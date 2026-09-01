/**
 * channels/push.ts — the built-in channel: a web push notification.
 *
 * Always available (no extension gate) and the only channel that can put a
 * BUTTON in front of the user. That matters more than it sounds: the single
 * biggest friction cut available here is marking a habit done from the lock
 * screen without opening the app, and every study of this kind of prompt says
 * the gap between "saw the reminder" and "did the thing" is where the day is
 * lost. The Done action closes it in one tap.
 */

import { sendPushToUser } from '../../push-send'
import type { NudgeChannel } from './types'

/** Matched in app/sw.ts. Changing either string breaks deployed notifications. */
export const ACTION_DONE = 'done'
export const ACTION_SNOOZE = 'snooze'

/**
 * How long Snooze defers a cue.
 *
 * Lives here, beside the button that promises it, so the label and the
 * behaviour cannot drift — /api/reminders/act imports this rather than picking
 * its own number, and a notification that says "15m" and means 30 is a small
 * lie the user has no way to check.
 *
 * Short on purpose. A snooze long enough to leave the moment is a dismissal
 * with extra steps.
 */
export const SNOOZE_MINUTES = 15

export const pushChannel: NudgeChannel = {
  slug: 'push',
  extensionSlug: null,
  async deliver(nudge, ctx) {
    // A Done button only makes sense when there is exactly one thing it could
    // mean. A last call naming three habits gets a plain click-through instead
    // of a button that silently picks one of them.
    const actionable = Boolean(nudge.itemId)
    const result = await sendPushToUser(ctx.service, ctx.userId, {
      title: nudge.title,
      body: nudge.body,
      url: nudge.url,
      // Collapse on the item (or on the day, for a multi-item last call) so a
      // re-delivery REPLACES rather than stacks. A shade with four copies of
      // the same cue is how someone learns to swipe the whole app away.
      tag: nudge.itemId ? `dsul-item-${nudge.itemId}` : `dsul-${nudge.kind}-${nudge.dateStr}`,
      actions: actionable
        ? [
            { action: ACTION_DONE, title: 'Done' },
            { action: ACTION_SNOOZE, title: `Snooze ${SNOOZE_MINUTES}m` },
          ]
        : undefined,
      data: {
        url: nudge.url,
        itemId: nudge.itemId,
        dateStr: nudge.dateStr,
        kind: nudge.kind,
      },
    })
    return { ok: true, detail: `push sent=${result.sent} expired=${result.expired}` }
  },
}
