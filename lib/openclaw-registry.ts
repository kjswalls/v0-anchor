/**
 * In-memory registry of connected OpenClaw plugin instances.
 *
 * In production this would live in Supabase (so it survives restarts), but
 * for now an in-process Map is fine — the plugin re-registers on OpenClaw
 * startup anyway.
 */

export interface PluginRegistration {
  pluginId: string
  webhookUrl: string
  secret: string
  userId: string
  events: string[]
  registeredAt: string
}

export const registeredPlugins = new Map<string, PluginRegistration>()

/**
 * Notify all registered plugins for a given user + event type.
 * Called from db.ts whenever a mutation succeeds.
 *
 * Payload shape (sent as JSON to webhookUrl):
 *   { event, userId, data, timestamp }
 *
 * HMAC signature (if secret is set):
 *   X-Anchor-Signature: sha256=<hex>
 */
export async function notifyPlugins(
  userId: string,
  event: AnchorEvent,
  data: unknown
): Promise<void> {
  const payload = JSON.stringify({
    event,
    userId,
    data,
    timestamp: new Date().toISOString(),
  })

  const promises: Promise<void>[] = []

  for (const reg of registeredPlugins.values()) {
    if (reg.userId !== userId) continue
    if (!reg.events.includes(event) && !reg.events.includes('*')) continue

    promises.push(sendWebhook(reg, payload))
  }

  // Fire-and-forget: don't block the mutation response
  await Promise.allSettled(promises)
}

async function sendWebhook(reg: PluginRegistration, payload: string): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Sign the payload if a secret is configured
  if (reg.secret) {
    const sig = await hmacSha256(reg.secret, payload)
    headers['X-Anchor-Signature'] = `sha256=${sig}`
  }

  try {
    const res = await fetch(reg.webhookUrl, { method: 'POST', headers, body: payload })
    if (!res.ok) {
      console.warn(`[openclaw-registry] Webhook delivery failed for ${reg.pluginId}: ${res.status}`)
    }
  } catch (err) {
    console.warn(`[openclaw-registry] Webhook error for ${reg.pluginId}:`, err)
  }
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type AnchorEvent =
  | 'tasks.updated'
  | 'habits.updated'
  | 'projects.updated'
  | 'habitGroups.updated'
  | '*'
