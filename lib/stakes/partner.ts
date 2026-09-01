/**
 * stakes/partner.ts — tell a person.
 *
 * Posts a short daily digest to a webhook the user gives dsul: a Slack or
 * Discord channel shared with a friend, a coach, a group chat bridge.
 *
 * The mechanism is EXPECTATION, not exposure. Someone knowing the digest is
 * coming is what moves behaviour; someone waiting to be disappointed does not,
 * and reliably produces avoidance of the whole arrangement instead. That is why
 * the digest leads with what was DONE, reports the rest flatly, and contains no
 * adjectives at all — see lib/stakes/copy.ts, where the wording is the feature.
 *
 * It also sends on a clean day. A report that only ever arrives when you failed
 * is a punishment schedule with a delivery mechanism, and the person on the
 * other end learns to dread the notification exactly as much as you do.
 *
 * Config:  webhookUrl, name (whose day it is, for the reader)
 * Secrets: none.
 */

import { assertSafeUrl, postToChannel, requireString } from '../reminders/channels/http'
import { partnerDigest } from './copy'
import type { StakeAdapter } from './types'

export const EXT_ACCOUNTABILITY_PARTNER = 'accountability-partner'

export const partnerAdapter: StakeAdapter = {
  slug: EXT_ACCOUNTABILITY_PARTNER,
  extensionSlug: EXT_ACCOUNTABILITY_PARTNER,

  plan(outcome, ctx) {
    if (!requireString(ctx.config, 'webhookUrl')) return []
    // Nothing happened at all — no occurrences either way. A digest saying
    // "0/0 done" is noise in someone else's chat.
    if (outcome.hits.length === 0 && outcome.misses.length === 0) return []

    return [
      {
        // 'day' rather than an item id: this is ONE record for the whole day,
        // and it is what the unique index dedupes on so the digest cannot be
        // sent twice.
        subject: 'day',
        subjectTitle: `Digest for ${outcome.dateStr}`,
        kind: outcome.misses.length > 0 ? 'miss' : 'hit',
        detail: `${outcome.hits.length}/${outcome.hits.length + outcome.misses.length}`,
      },
    ]
  },

  async commit(claimed, outcome, ctx) {
    if (claimed.length === 0) return { ok: true, skipped: true, detail: 'nothing new' }

    const webhookUrl = requireString(ctx.config, 'webhookUrl')
    if (!webhookUrl) return { ok: true, skipped: true, detail: 'partner not configured' }

    try {
      const text = partnerDigest(outcome, requireString(ctx.config, 'name'))
      await postToChannel(assertSafeUrl(webhookUrl), {
        // Slack reads `text`, Discord reads `content`. Both are sent so one
        // pasted URL works either way.
        body: JSON.stringify({ text, content: text }),
      })
      return { ok: true, detail: 'digest sent' }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }
  },
}
