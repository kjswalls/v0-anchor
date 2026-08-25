/**
 * stakes/live.ts — post the datapoint at the moment the box is ticked.
 *
 * WHY THIS EXISTS. The nightly settlement was the only writer, and it runs at
 * 03:00 by default while a Beeminder goal's deadline defaults to midnight. So
 * with both at their defaults every completion was reported three hours after
 * the goal had already decided you missed it: the graph ended up right (the
 * daystamp is correct) and the derailment still happened. A commitment device
 * that charges you for a habit you did is worse than none.
 *
 * WHAT IT IS NOT. It is not a replacement for the settlement — the settlement
 * stays, as the backstop for every completion that never passes through a
 * browser (the lock-screen action, the agent API, a tab that was offline). The
 * two never coordinate and never need to: both claim the SAME ledger row, so
 * whichever arrives first does the work and the other finds it committed.
 *
 * WHY IT ONLY SERVES BEEMINDER. It is the only stake whose value depends on
 * *when* the report lands. A pledge is a record and a partner digest is a daily
 * summary; both are about a day that is over, and reporting a miss the instant
 * a box is not ticked would be nagging, not accounting.
 *
 * THE RETRACTION. Un-ticking withdraws the datapoint and drops the ledger row.
 * Deleting rather than tombstoning is deliberate: the row IS the claim on the
 * datapoint, so once the datapoint is gone the claim must go too, or a
 * re-completion later that day can never re-post. The ledger keeps a record of
 * what a day CONCLUDED; a tick that was taken back concluded nothing.
 */

import { getItemTypeConfig } from '../item-registry'
import { loadChannelState } from '../reminders/extension-state'
import { resolveEnabled } from '../extension-registry'
import type { createServiceClient } from '../supabase-service'
import {
  EXT_BEEMINDER,
  type BeeminderCredentials,
  beeminderCredentials,
  decodeDetail,
  encodeDetail,
  goalForTitle,
  postDatapoint,
  retractDatapoint,
} from './beeminder'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface LiveCompletionInput {
  userId: string
  itemId: string
  /** The LOCAL day being credited, yyyy-MM-dd — never derived server-side. */
  dateStr: string
  /** True on a tick, false on an un-tick. */
  completed: boolean
}

export interface LiveCompletionResult {
  /** False only when something genuinely went wrong reaching Beeminder. */
  ok: boolean
  /** Nothing to do — not configured, not mapped, already posted. */
  skipped?: boolean
  detail?: string
}

const OK_NOOP = (detail: string): LiveCompletionResult => ({ ok: true, skipped: true, detail })

/**
 * Which item types a live datapoint may be posted for.
 *
 * The row-shaped twin of stakeEligible() in day.ts, and it has to be, because
 * this path holds a database row rather than a hydrated Item. Same two
 * questions in the same order: remindable (with the subtask rule), and does the
 * type carry a streak. A second opinion about eligibility is how the live path
 * and the settlement would end up disagreeing about which habits count.
 */
export function stakeEligibleRow(type: string, parentItemId: string | null): boolean {
  if (parentItemId) return false
  const config = getItemTypeConfig(type)
  return config.remindable && config.counters.streak
}

interface ItemRow {
  id: string
  type: string
  title: string
  parent_item_id: string | null
  completed_dates: string[] | null
}

interface LedgerRow {
  id: string
  detail: string | null
  committed_at: string | null
}

/**
 * Report one completion (or un-completion) to Beeminder, now.
 *
 * Callable from the API route the browser hits and directly from
 * /api/reminders/act, which already holds a service client — the notification's
 * Done button is the single most valuable completion this feature has, and
 * routing it back out through HTTP to our own deployment is the pattern
 * lib/push-send.ts exists to have removed.
 *
 * Never throws. Every caller is a side path attached to a write that has
 * already succeeded, and a failed datapoint must not turn a completed habit
 * into an error the user sees.
 */
export async function reportLiveCompletion(
  service: ServiceClient,
  input: LiveCompletionInput,
): Promise<LiveCompletionResult> {
  try {
    return await run(service, input)
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function run(
  service: ServiceClient,
  input: LiveCompletionInput,
): Promise<LiveCompletionResult> {
  const { userId, itemId, dateStr, completed } = input

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return OK_NOOP('bad date')

  // The master switch, checked FIRST and against the database rather than the
  // caller's claim. "Settle the day" governs every stake, and an extension that
  // kept posting while it was off would make turning the accounting off a
  // setting that visibly does nothing.
  const { data: settings, error: settingsError } = await service
    .from('user_settings')
    .select('stakes_enabled, timezone')
    .eq('user_id', userId)
    .maybeSingle()
  if (settingsError) throw new Error(settingsError.message)
  const stakes = settings as { stakes_enabled?: boolean; timezone?: string | null } | null
  if (!stakes?.stakes_enabled) return OK_NOOP('stakes off')

  // A day that has not happened yet cannot be credited. The client sends the
  // date it ticked, so this is the guard between "the user is looking at
  // tomorrow in the week view" and a goal satisfied a day early.
  if (stakes.timezone && dateStr > localToday(stakes.timezone)) {
    return OK_NOOP('future date')
  }

  const state = await loadChannelState(service, userId)
  if (!resolveEnabled(state.extensionEnabled, EXT_BEEMINDER)) return OK_NOOP('beeminder off')

  const config = state.configs[EXT_BEEMINDER] ?? {}
  const creds = beeminderCredentials(config, state.secrets[EXT_BEEMINDER] ?? {})
  if (!creds) return OK_NOOP('beeminder not configured')

  // Scoped by user_id even though the caller is already authenticated: this
  // function takes a SERVICE client, which RLS does not constrain, so the
  // predicate is the only thing standing between an itemId someone guessed and
  // someone else's habit.
  const { data: itemRow, error: itemError } = await service
    .from('items')
    .select('id, type, title, parent_item_id, completed_dates')
    .eq('id', itemId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (itemError) throw new Error(itemError.message)
  const item = itemRow as ItemRow | null
  if (!item) return OK_NOOP('no such item')

  if (!stakeEligibleRow(item.type, item.parent_item_id)) return OK_NOOP('type not staked')

  const goal = goalForTitle(config, item.title)
  if (!goal) return OK_NOOP('title not mapped to a goal')

  // The DATABASE decides whether the day is complete, not the caller's flag.
  // Both callers fire immediately after their own write, so this is the read
  // that catches the write that actually landed — including the case where two
  // toggles race and the last one in is the one that counts.
  const isComplete = (item.completed_dates ?? []).includes(dateStr)
  if (completed !== isComplete) return OK_NOOP('completion state moved on')

  return completed
    ? await postForDay(service, { userId, dateStr, item, goal, creds })
    : await retractForDay(service, { userId, dateStr, item, creds })
}

async function postForDay(
  service: ServiceClient,
  args: {
    userId: string
    dateStr: string
    item: ItemRow
    goal: string
    creds: BeeminderCredentials
  },
): Promise<LiveCompletionResult> {
  const { userId, dateStr, item, goal, creds } = args

  // Claim, then act — the whole reason the settlement is shaped the way it is,
  // and the live path is not exempt. The insert is the exclusion: two tabs
  // ticking the same habit both reach here, and only the row's absence decides
  // who posts.
  const { error: claimError } = await service.from('stake_events').upsert(
    [
      {
        user_id: userId,
        date: dateStr,
        subject: item.id,
        subject_title: item.title,
        kind: 'hit',
        channel: EXT_BEEMINDER,
        detail: encodeDetail(goal),
      },
    ],
    { onConflict: 'user_id,date,subject,channel', ignoreDuplicates: true },
  )
  if (claimError) throw new Error(claimError.message)

  const row = await readLedgerRow(service, userId, dateStr, item.id)
  if (!row) return OK_NOOP('claim vanished')
  // Committed means the datapoint is up — by the settlement, by another tab, or
  // by an earlier tick of this same box. Posting again would be harmless
  // (requestid dedupes it) and pointless.
  if (row.committed_at) return OK_NOOP('already posted')

  const datapointId = await postDatapoint(creds, goal, {
    subject: item.id,
    subjectTitle: item.title,
    dateStr,
  })

  // `.select()` so the answer says whether the row was still THERE, not merely
  // whether the statement succeeded. Those differ in one narrow but real case:
  // a tick and an un-tick in the same second, where the retraction reads the
  // uncommitted claim and deletes it while this post is in flight. Without the
  // check the datapoint would be left on the graph with no row pointing at it —
  // unwithdrawable, and invisible to the settlement, which will not re-claim a
  // day the user un-ticked.
  const { data: stamped, error: stampError } = await service
    .from('stake_events')
    .update({ committed_at: new Date().toISOString(), detail: encodeDetail(goal, datapointId) })
    .eq('id', row.id)
    .select('id')

  // The datapoint IS up; only the bookkeeping failed. Reported rather than
  // thrown, and left uncommitted on purpose — the settlement will find the row
  // pending and re-post, which Beeminder's requestid makes a no-op.
  if (stampError) return { ok: false, detail: `posted but not recorded — ${stampError.message}` }

  if (((stamped as unknown[] | null) ?? []).length === 0) {
    // The claim was released underneath us. Undo the post rather than leave it.
    if (datapointId) {
      await retractDatapoint(creds, goal, datapointId)
      return { ok: true, skipped: true, detail: 'claim released mid-post; datapoint withdrawn' }
    }
    return { ok: false, detail: 'claim released mid-post; datapoint id unknown, left in place' }
  }

  return { ok: true, detail: `posted to ${goal}` }
}

async function retractForDay(
  service: ServiceClient,
  args: {
    userId: string
    dateStr: string
    item: ItemRow
    creds: BeeminderCredentials
  },
): Promise<LiveCompletionResult> {
  const { userId, dateStr, item, creds } = args

  const row = await readLedgerRow(service, userId, dateStr, item.id)
  if (!row) return OK_NOOP('nothing posted')

  const { goal, datapointId } = decodeDetail(row.detail)

  // Withdraw FIRST, drop the row second. The other order loses the id on a
  // failed delete and strands the datapoint on the graph with nothing left
  // pointing at it.
  if (row.committed_at && goal && datapointId) {
    await retractDatapoint(creds, goal, datapointId)
  }

  const { error } = await service.from('stake_events').delete().eq('id', row.id)
  if (error) throw new Error(error.message)

  if (row.committed_at && !datapointId) {
    // The row was committed by a path that could not record the id (an older
    // row, or a response without one). Say so rather than reporting a
    // retraction that did not happen — the datapoint is still on the graph.
    return { ok: true, detail: 'ledger cleared; datapoint id unknown, not withdrawn' }
  }
  return { ok: true, detail: row.committed_at ? 'datapoint withdrawn' : 'claim released' }
}

async function readLedgerRow(
  service: ServiceClient,
  userId: string,
  dateStr: string,
  subject: string,
): Promise<LedgerRow | null> {
  const { data, error } = await service
    .from('stake_events')
    .select('id, detail, committed_at')
    .eq('user_id', userId)
    .eq('date', dateStr)
    .eq('subject', subject)
    .eq('channel', EXT_BEEMINDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as LedgerRow | null) ?? null
}

/** The user's own day, yyyy-MM-dd. */
function localToday(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  } catch {
    // An unusable IANA zone is the user's data, not a reason to refuse the
    // datapoint. The future-date guard simply does not apply.
    return '9999-12-31'
  }
}
