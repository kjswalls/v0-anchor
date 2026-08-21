/**
 * settle.ts — close one day, once.
 *
 * Claim-then-act, and everything below exists to make that true:
 *
 *   1. Every enabled adapter says what it would record (`plan`) — pure.
 *   2. All of it is inserted against the unique index from migration 031, with
 *      duplicates ignored. What comes back is exactly what had NOT been settled
 *      before.
 *   3. Each adapter acts on its own newly-claimed rows (`commit`).
 *
 * Step 2 is the whole design. The settlement is driven by a cron that can run
 * twice, retry after a timeout, or catch up after an outage, and the naive
 * order — act, then record — charges a pledge twice on every one of those. A
 * ledger that overcharges once is a ledger nobody trusts again, so the write
 * that claims the day happens before anything reaches the outside world.
 */

import { resolveEnabled } from '../extension-registry'
import type { createServiceClient } from '../supabase-service'
import { settleDay, type DayOutcome } from './day'
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
  date: string
  subject: string
  channel: string
}

export async function settleOneDay(
  service: ServiceClient,
  input: SettleInput,
): Promise<SettleReport> {
  const outcome: DayOutcome = settleDay(input.items, input.dateStr, input.activation)
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

  const { data: inserted, error } = await service
    .from('stake_events')
    .upsert(rows, { onConflict: 'user_id,date,subject,channel', ignoreDuplicates: true })
    .select('date, subject, channel')

  if (error) {
    // Nothing was claimed, so nothing may be acted on. Silence is the correct
    // failure here: the next tick will try again, and a settlement that acted
    // without claiming is the double-charge this design exists to prevent.
    report.notes.push(`claim failed — ${error.message}`)
    return report
  }

  const claimedKeys = new Set(
    ((inserted ?? []) as StakeEventRow[]).map((row) => `${row.channel}::${row.subject}`),
  )

  // ── 3. Commit ─────────────────────────────────────────────────────────────
  // Concurrently, and every rejection caught: the adapters are independent and
  // an expired Beeminder token must not cost the partner their digest.
  await Promise.all(
    active.map(async (adapter) => {
      const drafts = planned.get(adapter.slug) ?? []
      const claimed = drafts.filter((draft) => claimedKeys.has(`${adapter.slug}::${draft.subject}`))
      if (claimed.length === 0) return
      try {
        const result = await adapter.commit(claimed, outcome, contextFor(adapter, service, input))
        if (!result.ok) report.notes.push(`${adapter.slug}: ${result.detail ?? 'failed'}`)
      } catch (err) {
        report.notes.push(`${adapter.slug}: threw — ${errorText(err)}`)
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
