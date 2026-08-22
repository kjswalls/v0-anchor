/**
 * push-send.ts — one place that actually pushes.
 *
 * Extracted from app/api/push/send/route.ts when the reminder scan became a
 * second caller. The scan could have POSTed to that route the way
 * /api/cron/eod-notify does, and that pattern is exactly why this file exists:
 * a server route calling ITSELF over HTTP has to reconstruct its own origin
 * from a Host header, carry the service key in a header so it can authenticate
 * to itself, and pay a network round-trip per user — three failure modes bought
 * for no isolation whatsoever, since both ends run in the same deployment.
 *
 * The route keeps its HTTP surface (the browser and OpenClaw both use it) and
 * now delegates here. eod-notify was switched over in the same change rather
 * than left as the last self-fetching caller.
 */

import webPush from 'web-push'
import type { createServiceClient } from './supabase-service'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * One action button on a notification.
 *
 * Two is the practical ceiling: Chrome renders at most two on Android and
 * `maxActions` is 2 on most builds, so a third is silently dropped rather than
 * scrolled. Design for two and the notification looks the same everywhere.
 */
export interface PushAction {
  /** Matched in the service worker's notificationclick handler. */
  action: string
  title: string
}

export interface PushPayload {
  title: string
  body: string
  /** Where a plain click lands. */
  url?: string
  /**
   * Collapse key. Two notifications with the same tag replace rather than
   * stack, which is what keeps a re-delivered cue from becoming a pile.
   */
  tag?: string
  actions?: PushAction[]
  /** Echoed back to the service worker on click — the item id, the date. */
  data?: Record<string, unknown>
}

export interface PushResult {
  sent: number
  /** Endpoints dropped because the browser reported them gone. */
  expired: number
}

let vapidConfigured = false

/**
 * Returns false when VAPID isn't configured, so callers can degrade instead of
 * throwing. A personal deployment without keys should mean "push is off", not
 * "the reminder scan 500s for every user".
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function configureVapid(): void {
  if (vapidConfigured) return
  webPush.setVapidDetails(
    'mailto:hello@anchor.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  vapidConfigured = true
}

/**
 * Push one payload to every device a user has subscribed.
 *
 * Requires a SERVICE client: push_subscriptions is RLS'd to the owner, and the
 * scan runs with no session at all.
 *
 * Expired endpoints (410 Gone / 404) are deleted as they are found. That is not
 * housekeeping — a user who reinstalls the PWA accumulates dead endpoints, and
 * every one of them is a request the scan pays for on every tick forever.
 */
export async function sendPushToUser(
  service: ServiceClient,
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  if (!isPushConfigured()) return { sent: 0, expired: 0 }

  const { data: subscriptions, error } = await service
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  if (!subscriptions?.length) return { sent: 0, expired: 0 }

  configureVapid()
  const body = JSON.stringify(payload)

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      ),
    ),
  )

  const expired: string[] = []
  results.forEach((result, i) => {
    if (result.status !== 'rejected') return
    const err = result.reason as { statusCode?: number }
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      expired.push(subscriptions[i].endpoint)
    }
  })

  if (expired.length) {
    // Scoped to THIS user, which the version this was extracted from was not.
    // push_subscriptions is unique on (user_id, endpoint), not on endpoint
    // alone, so two accounts used in the same browser profile hold the same
    // endpoint string — an unscoped delete would sign the other account out of
    // notifications entirely. Harmless-looking in a route that ran on demand;
    // this now runs for every user on every tick.
    await service
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expired)
  }

  return { sent: results.filter((r) => r.status === 'fulfilled').length, expired: expired.length }
}
