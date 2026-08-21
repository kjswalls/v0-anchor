/**
 * settle.ts — close one day, once.
 *
 * Claim-then-act, and everything below exists to make that true:
 *
 *   1. Every enabled adapter says what it would record (`plan`) — pure.
 *   2. All of it is inserted against the unique index from migration 031, with
 *      duplicates ignored.
 *   3. Everything still UNCOMMITTED for this day is read back — which is the
 *      rows just claimed, plus anything an earlier tick claimed and failed to
 *      act on.
 *   4. Each adapter acts on its own share (`commit`), and its rows are stamped
 *      committed_at only when it succeeds.
 *
 * Step 2 is why the naive order is wrong: the settlement is driven by a cron
 * that can run twice, retry after a timeout, or catch up after an outage, and
 * act-then-record charges a pledge twice on every one of those. A ledger that
 * overcharges once is a ledger nobody trusts again.
 *
 * Step 3 is why claiming alone is not enough. Claiming makes a retry find the
 * row already present and do nothing — so an adapter whose commit failed once
 * would never be retried, the next tick would report no problem, and the day
 * would be stamped settled with the datapoint never posted. committed_at is
 * what separates "recorded" from "done".
 */

import { resolveEnabled } from '../extension-registry'
import type { createServiceClient } from '../supabase-service'
import { settleDay, type CreatedOnLookup, type DayOutcome } from './day'
import { beeminderAdapter } from './beeminder'
import { pledgeAdapter } from './pledge'
import { partnerAdapter } from './partner'
import type { StakeAdapter, StakeContext, StakeEventDraft } from './types'
import type { ActivationContext } from '../active'
import type { Item } from '../planner-types'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Every known adapter. Adding one is an entry here and a manifest entry. */
export const STAKE_ADAPTERS: StakeAdapter[] = [beeminderAdapter, pledgeAdapter, partnerAdapter]

export interface SettleInput {
  userId: string
  /** The local day being closed, yyyy-MM-dd. Always in the past. */
  dateStr: string
  timezone: string
  items: readonly Item[]
  /** Local creation day per item id — see CreatedOnLookup for why it is required. */
  createdOn: CreatedOnLookup
  activation: ActivationContext
  extensionEnabled: Record<string, boolean>
  configs: Record<string, Record<string, unknown>>
  secrets: Record<string, Record<string, string>>
}

export interface SettleReport {
  dateStr: string
  hits: number
  misses: number
  /** One line per adapter that failed. Empty on a clean settlement. */
  notes: string[]
}

interface StakeEventRow {
  subject: string
  channel: string
}

/** Channel::subject — the key both the plan and the ledger agree on. */
function rowKey(channel: string, subject: string): string {
  return `${channel}::${subject}`
}

export async function settleOneDay(
  service: ServiceClient,
  input: SettleInput,
): Promise<SettleReport> {
  const outcome: DayOutcome = settleDay(
    input.items,
    input.dateStr,
    input.activation,
    input.createdOn,
  )
  const report: SettleReport = {
    dateStr: input.dateStr,
    hits: outcome.hits.length,
    misses: outcome.misses.length,
    notes: [],
  }

  const active = STAKE_ADAPTERS.filter((adapter) =>
    resolveEnabled(input.extensionEnabled, adapter.extensionSlug),
  )
  if (active.length === 0) return report

  // ── 1. Plan ───────────────────────────────────────────────────────────────
  const planned = new Map<string, StakeEventDraft[]>()
  for (const adapter of active) {
    const ctx = contextFor(adapter, service, input)
    try {
      const drafts = adapter.plan(outcome, ctx)
      if (drafts.length > 0) planned.set(adapter.slug, drafts)
    } catch (err) {
      // plan() is supposed to be pure, but a bad config value can still throw
      // out of a parse. One adapter's malformed settings must not stop the
      // others from settling.
      report.notes.push(`${adapter.slug}: plan failed — ${errorText(err)}`)
    }
  }
  if (planned.size === 0) return report

  // ── 2. Claim ──────────────────────────────────────────────────────────────
  const rows: Record<string, unknown>[] = []
  for (const [slug, drafts] of planned) {
    for (const draft of drafts) {
      rows.push({
        user_id: input.userId,
        date: input.dateStr,
        subject: draft.subject,
        subject_title: draft.subjectTitle,
        kind: draft.kind,
        channel: slug,
        amount_cents: draft.amountCents ?? null,
        currency: draft.currency ?? null,
        detail: draft.detail ?? null,
      })
    }
  }

  const { error } = await service
    .from('stake_events')
    .upsert(rows, { onConflict: 'user_id,date,subject,channel', ignoreDuplicates: true })

  if (error) {
    // Nothing was claimed, so nothing may be acted on. Silence is the correct
    // failure here: the next tick will try again, and a settlement that acted
    // without claiming is the double-charge this design exists to prevent.
    report.notes.push(`claim failed — ${error.message}`)
    return report
  }

  // ── 3. What still owes the outside world ─────────────────────────────────
  // Read back rather than trusting the insert's own RETURNING, because the two
  // answers differ in exactly the case that matters: a row an EARLIER tick
  // claimed and then failed to act on is not newly inserted, and is precisely
  // what needs retrying.
  const { data: pendingRows, error: pendingError } = await service
    .from('stake_events')
    .select('subject, channel')
    .eq('user_id', input.userId)
    .eq('date', input.dateStr)
    .is('committed_at', null)

  if (pendingError) {
    report.notes.push(`pending read failed — ${pendingError.message}`)
    return report
  }

  const pending = new Set(
    ((pendingRows ?? []) as StakeEventRow[]).map((row) => rowKey(row.channel, row.subject)),
  )

  // ── 4. Commit ─────────────────────────────────────────────────────────────
  // Concurrently, and every rejection caught: the adapters are independent and
  // an expired Beeminder token must not cost the partner their digest.
  await Promise.all(
    active.map(async (adapter) => {
      const drafts = planned.get(adapter.slug) ?? []
      const owed = drafts.filter((draft) => pending.has(rowKey(adapter.slug, draft.subject)))
      if (owed.length === 0) return

      let result
      try {
        result = await adapter.commit(owed, outcome, contextFor(adapter, service, input))
      } catch (err) {
        report.notes.push(`${adapter.slug}: threw — ${errorText(err)}`)
        return
      }

      if (!result.ok) {
        // Left uncommitted on purpose. The note stops scan.ts advancing
        // stakes_settled_date, so the next tick reads these rows back and tries
        // again rather than declaring a day done that never left the building.
        report.notes.push(`${adapter.slug}: ${result.detail ?? 'failed'}`)
        return
      }

      const { error: commitError } = await service
        .from('stake_events')
        .update({ committed_at: new Date().toISOString() })
        .eq('user_id', input.userId)
        .eq('date', input.dateStr)
        .eq('channel', adapter.slug)
        .in('subject', owed.map((draft) => draft.subject))

      // The side effect DID happen; only the bookkeeping failed. Reported so the
      // day is not stamped — the retry re-commits, which is why every adapter's
      // commit has to be safe to repeat (Beeminder's requestid, a duplicate
      // digest, a re-sent notification) and why none of them moves money.
      if (commitError) {
        report.notes.push(`${adapter.slug}: acted but could not record it — ${commitError.message}`)
      }
    }),
  )

  return report
}

function contextFor(
  adapter: StakeAdapter,
  service: ServiceClient,
  input: SettleInput,
): StakeContext {
  return {
    userId: input.userId,
    service,
    timezone: input.timezone,
    config: input.configs[adapter.slug] ?? {},
    secrets: input.secrets[adapter.slug] ?? {},
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
