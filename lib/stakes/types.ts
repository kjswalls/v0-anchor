/**
 * stakes/types.ts — the interface every stake adapter implements.
 *
 * Split into plan() and commit() deliberately, and the split is the whole
 * idempotency story.
 *
 * `plan` says what the day WOULD record, as rows. The settlement writes those
 * rows first, against a unique index (migration 031), and keeps only the ones
 * that were genuinely new. `commit` then performs the outside-world side effect
 * for exactly those.
 *
 * Claim-then-act, rather than act-then-record. The cron can run twice, retry
 * after a timeout, or catch up after an outage; with act-then-record, each of
 * those charges a pledge twice or sends a second digest, and the second charge
 * is the one that destroys trust in the ledger. With claim-then-act, the second
 * run finds nothing new to claim and does nothing at all.
 *
 * Adapters MUST NOT throw to signal failure — same contract as the delivery
 * channels, same reason: one expired token must not stop the others.
 */

import type { createServiceClient } from '../supabase-service'
import type { DayOutcome } from './day'

export interface StakeContext {
  userId: string
  service: ReturnType<typeof createServiceClient>
  timezone: string
  /** Non-secret settings from user_extensions.config, keyed by the slug. */
  config: Record<string, unknown>
  /** Credentials from user_secrets.reminder_secrets. Never leaves the server. */
  secrets: Record<string, string>
}

/** One ledger row, before it has an id. */
export interface StakeEventDraft {
  /** An item id, or the literal 'day' for a whole-day record. */
  subject: string
  /** Snapshot of the title — the ledger must survive a rename or a delete. */
  subjectTitle: string
  kind: 'hit' | 'miss'
  /** Pledge only. Integer minor units. */
  amountCents?: number
  currency?: string
  detail?: string
}

export interface StakeResult {
  ok: boolean
  /** Declined because it is not configured — not an error. */
  skipped?: boolean
  detail?: string
}

export interface StakeAdapter {
  /** Identical to the extension slug, the NudgeChannel rule. */
  slug: string
  extensionSlug: string
  /**
   * What this adapter would record for the day. Pure — no I/O, no side
   * effects: it runs before anything has been claimed.
   */
  plan: (outcome: DayOutcome, ctx: StakeContext) => StakeEventDraft[]
  /**
   * Act on the rows that were newly claimed. `claimed` is a subset of what
   * plan() returned — possibly empty, in which case the adapter must do
   * nothing at all, because empty means "already settled".
   */
  commit: (
    claimed: StakeEventDraft[],
    outcome: DayOutcome,
    ctx: StakeContext,
  ) => Promise<StakeResult>
}
