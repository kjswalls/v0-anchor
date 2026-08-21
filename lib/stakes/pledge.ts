/**
 * stakes/pledge.ts — the anti-charity ledger.
 *
 * A miss costs a stated amount, payable to an organisation the user actively
 * dislikes. That specificity is the mechanism: the money going somewhere you
 * would hate to fund is what makes the loss vivid, and a generic fine is a much
 * weaker version of the same idea.
 *
 * ANCHOR DOES NOT MOVE MONEY, and says so wherever a user can see it. There is
 * no payment rail here and no attempt to look like one — this records what is
 * owed, tells the user, and optionally tells a witness. A commitment device
 * that silently failed to collect would be worse than no device at all, because
 * the user would go on trusting it while it did nothing. Anyone who wants the
 * money to actually move is pointed at the Beeminder extension, which has the
 * rail this deliberately lacks.
 *
 * What it buys, then, is a real ledger and a real witness — which is most of
 * what a deposit contract is, minus the escrow.
 *
 * Config:  amount ("10"), currency ("GBP"), charity, witnessUrl
 * Secrets: none.
 */

import { postToChannel, requireString } from '../reminders/channels/http'
import { assertSafeUrl } from '../reminders/channels/http'
import { sendPushToUser } from '../push-send'
import { formatMoney, pledgeSummary } from './copy'
import type { StakeAdapter, StakeEventDraft } from './types'

export const EXT_PLEDGE = 'pledge'

const DEFAULT_CURRENCY = 'USD'

/**
 * "10", "10.50", "£10" → minor units.
 *
 * Parsed to an integer immediately and stored that way. Floats and money is the
 * oldest bug there is, and a ledger that is a penny out is a ledger someone
 * stops believing.
 */
export function parseAmountCents(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100)
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

export const pledgeAdapter: StakeAdapter = {
  slug: EXT_PLEDGE,
  extensionSlug: EXT_PLEDGE,

  plan(outcome, ctx) {
    const amountCents = parseAmountCents(ctx.config.amount)
    if (amountCents === null || amountCents === 0) return []
    const currency = requireString(ctx.config, 'currency') ?? DEFAULT_CURRENCY
    const charity = requireString(ctx.config, 'charity')

    return outcome.misses.map<StakeEventDraft>((item) => ({
      subject: item.id,
      subjectTitle: item.title,
      kind: 'miss',
      amountCents,
      currency,
      detail: charity ?? undefined,
    }))
  },

  async commit(claimed, outcome, ctx) {
    // Empty means the day was already settled — say nothing. A second "you owe
    // £10" for a debt already recorded is how a ledger loses its authority.
    if (claimed.length === 0) return { ok: true, skipped: true, detail: 'nothing new' }

    const currency = claimed[0].currency ?? DEFAULT_CURRENCY
    const totalCents = claimed.reduce((sum, event) => sum + (event.amountCents ?? 0), 0)
    const charity = claimed[0].detail ?? null
    const copy = pledgeSummary(outcome, totalCents, currency, charity)

    const problems: string[] = []

    try {
      await sendPushToUser(ctx.service, ctx.userId, {
        title: copy.title,
        body: copy.body,
        url: '/',
        tag: `anchor-pledge-${outcome.dateStr}`,
      })
    } catch (err) {
      problems.push(`push: ${err instanceof Error ? err.message : String(err)}`)
    }

    // The witness. Optional, and the reason the whole thing is more than a
    // number in an app: a debt only one person knows about is a debt that
    // quietly stops being paid.
    const witnessUrl = requireString(ctx.config, 'witnessUrl')
    if (witnessUrl) {
      try {
        const text = `${copy.title} — ${copy.body}`
        await postToChannel(assertSafeUrl(witnessUrl), {
          // `text` for Slack, `content` for Discord. Sending both means one
          // pasted webhook URL works with either without the user being asked
          // to know which shape their chat app wants.
          body: JSON.stringify({ text, content: text }),
        })
      } catch (err) {
        problems.push(`witness: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const owed = formatMoney(totalCents, currency)
    if (problems.length > 0) return { ok: false, detail: `${owed} recorded; ${problems.join('; ')}` }
    return { ok: true, detail: `${owed} recorded across ${claimed.length} miss(es)` }
  },
}
