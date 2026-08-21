/**
 * stakes/beeminder.ts — put the day on a graph that costs money to break.
 *
 * The best evidence-to-effort ratio of anything in Tier 3, and the reason is
 * that Anchor is not trying to be the commitment device here — Beeminder
 * already is one, with a payment rail, a derailment ladder and years of
 * behaviour behind it. This posts the datapoint and gets out of the way.
 *
 * Datapoints are posted for HITS only. That is not an omission: a do-more goal
 * derails on the ABSENCE of data, which is exactly the mechanism, and posting a
 * zero would actively defeat it by satisfying the goal's rate with nothing.
 *
 * Config:  username, goals ("Vitamins: vitamins, Reading: read")
 * Secrets: authToken
 */

import { postToChannel, requireString } from '../reminders/channels/http'
import type { StakeAdapter, StakeEventDraft } from './types'

export const EXT_BEEMINDER = 'beeminder'

const BEEMINDER_API = 'https://www.beeminder.com/api/v1'

/**
 * Parse "Vitamins: vitamins, Reading: read" into a title → goal map.
 *
 * Keyed on the item TITLE rather than its id, which is a real trade-off made
 * knowingly: an id is stable across renames but no user can find one, and a
 * mapping nobody can fill in correctly is worse than one that needs re-editing
 * after a rename. Comparison is case- and whitespace-insensitive to take the
 * edge off.
 */
export function parseGoalMap(raw: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof raw !== 'string') return map
  for (const pair of raw.split(',')) {
    // Split on the LAST colon, not the first: a Beeminder goal slug cannot
    // contain one, but a habit called "Reading: 30 minutes" very much can, and
    // splitting at the first would map "Reading" to " 30 minutes" — a goal that
    // does not exist, failing silently on every settlement.
    const at = pair.lastIndexOf(':')
    if (at === -1) continue
    const key = pair.slice(0, at).trim().toLowerCase()
    const slug = pair.slice(at + 1).trim()
    if (key && slug) map.set(key, slug)
  }
  return map
}

export const beeminderAdapter: StakeAdapter = {
  slug: EXT_BEEMINDER,
  extensionSlug: EXT_BEEMINDER,

  plan(outcome, ctx) {
    const goals = parseGoalMap(ctx.config.goals)
    if (goals.size === 0) return []
    const drafts: StakeEventDraft[] = []
    for (const item of outcome.hits) {
      const goal = goals.get(item.title.trim().toLowerCase())
      if (!goal) continue
      drafts.push({
        subject: item.id,
        subjectTitle: item.title,
        kind: 'hit',
        detail: goal,
      })
    }
    return drafts
  },

  async commit(claimed, outcome, ctx) {
    if (claimed.length === 0) return { ok: true, skipped: true, detail: 'nothing new' }

    const username = requireString(ctx.config, 'username')
    const authToken = requireString(ctx.secrets, 'authToken')
    if (!username || !authToken) return { ok: true, skipped: true, detail: 'beeminder not configured' }

    const failures: string[] = []
    for (const draft of claimed) {
      try {
        await postToChannel(
          `${BEEMINDER_API}/users/${encodeURIComponent(username)}/goals/${encodeURIComponent(draft.detail as string)}/datapoints.json`,
          {
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({
              auth_token: authToken,
              value: '1',
              comment: `Anchor — ${draft.subjectTitle} on ${outcome.dateStr}`,
              // Beeminder's own idempotency key. Belt and braces with the
              // ledger's unique index: the index stops us re-planning a claimed
              // day, and this stops a retry INSIDE one run from double-posting.
              requestid: `anchor-${outcome.dateStr}-${draft.subject}`,
              daystamp: outcome.dateStr.replace(/-/g, ''),
            }).toString(),
          },
        )
      } catch (err) {
        failures.push(`${draft.subjectTitle}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (failures.length > 0) {
      return { ok: false, detail: failures.join('; ') }
    }
    return { ok: true, detail: `posted ${claimed.length} datapoint(s)` }
  },
}
