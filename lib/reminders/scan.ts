/**
 * scan.ts — the tick.
 *
 * Runs every few minutes, works out whose cue is due in their own local minute,
 * and hands each resolved nudge to lib/reminders/deliver.ts. The route around
 * it (app/api/cron/reminders) is auth and nothing else, so this stays callable
 * from a test with a stubbed client and a fixed `now`.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not decide whether an item wants
 * doing (lib/reminders/due.ts), it does not write the words (copy.ts), and it
 * does not know a single channel's name (deliver.ts). Its whole job is the loop
 * and the bookkeeping — which is the part that has to be right about
 * timezones, and the part nothing else should have an opinion about.
 */

import { fetchItems, fetchRoutines, fetchPrograms } from '../db'
import type { createServiceClient } from '../supabase-service'
import { dueReminders, lastCallItems, minutesOfDay, streakOf, type ScanRow } from './due'
import { lastCallCopy, reminderCopy, type TimeFormat } from './copy'
import { deliverNudge, type DeliveryReport } from './deliver'
import type { Nudge, NudgeItem } from './nudge'
import type { ActivationContext } from '../active'
import type { Item } from '../planner-types'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Postgres undefined_column / PostgREST's flavour of it — migration not applied. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column\b.*\bdoes not exist/i.test(error.message ?? '')
}

export interface LocalClock {
  dateStr: string
  nowMinutes: number
  nowIso: string
}

/**
 * The user's own day and minute.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which is not the same thing:
 * the latter leaves the cycle to the locale and some ICU builds answer midnight
 * as "24", which parses to 1440 and silently puts every user an entire day
 * outside every window. Naming the cycle removes the question.
 */
export function localClock(now: Date, timezone: string): LocalClock {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)
  return { dateStr, nowMinutes: minutesOfDay(hhmm) ?? 0, nowIso: now.toISOString() }
}

interface ReminderUserRow {
  user_id: string
  timezone: string | null
  time_format: string | null
  habit_last_call_enabled: boolean | null
  habit_last_call_time: string | null
  habit_last_call_date: string | null
}

interface BookkeepingRow {
  id: string
  user_id: string
  reminder_sent_date: string | null
  reminder_snooze_until: string | null
}

export interface ScanSummary {
  /** Users considered this tick. */
  users: number
  /** Item cues delivered. */
  cues: number
  /** Last calls delivered. */
  lastCalls: number
  /** Non-fatal problems, one line each. */
  notes: string[]
  /** True when migration 029 has not been applied — the scan is a no-op. */
  migrationMissing?: boolean
}

export interface ScanOptions {
  now: Date
  graceMinutes?: number
}

function toNudgeItem(item: Item): NudgeItem {
  return { id: item.id, title: item.title, streak: streakOf(item) }
}

/**
 * Read the per-channel config and credentials for one user.
 *
 * Both tables are tolerated missing, on the fetchUserExtensions contract: a
 * database that predates them means "no extensions", which leaves push — the
 * channel that needs neither — working exactly as before.
 */
async function loadChannelState(service: ServiceClient, userId: string) {
  const extensionEnabled: Record<string, boolean> = {}
  const configs: Record<string, Record<string, unknown>> = {}

  const { data: extensions } = await service
    .from('user_extensions')
    .select('slug, enabled, config')
    .eq('user_id', userId)

  for (const row of (extensions ?? []) as { slug: string; enabled: boolean; config: unknown }[]) {
    extensionEnabled[row.slug] = row.enabled
    if (row.config && typeof row.config === 'object') {
      configs[row.slug] = row.config as Record<string, unknown>
    }
  }

  // Credentials, read with the SERVICE client and never sent anywhere else.
  // user_secrets has its grants revoked from anon and authenticated (migration
  // 012), so this is the only kind of client that can see the column at all —
  // which is the property the whole split exists to buy.
  const secrets: Record<string, Record<string, string>> = {}
  const { data: secretRow } = await service
    .from('user_secrets')
    .select('reminder_secrets')
    .eq('user_id', userId)
    .maybeSingle()

  const bag = (secretRow as { reminder_secrets?: unknown } | null)?.reminder_secrets
  if (bag && typeof bag === 'object') {
    for (const [slug, values] of Object.entries(bag as Record<string, unknown>)) {
      if (!values || typeof values !== 'object') continue
      const clean: Record<string, string> = {}
      for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
        // Validated on READ rather than trusted, the item_types.config rule: a
        // credential left behind by a channel that no longer exists, or a value
        // of the wrong shape, is ignored instead of reaching a fetch.
        if (typeof value === 'string' && value !== '') clean[key] = value
      }
      secrets[slug] = clean
    }
  }

  return { extensionEnabled, configs, secrets }
}

export async function runReminderScan(
  service: ServiceClient,
  options: ScanOptions,
): Promise<ScanSummary> {
  const summary: ScanSummary = { users: 0, cues: 0, lastCalls: 0, notes: [] }

  const { data: users, error } = await service
    .from('user_settings')
    .select(
      'user_id, timezone, time_format, habit_last_call_enabled, habit_last_call_time, habit_last_call_date',
    )
    .eq('habit_reminders_enabled', true)
    .not('timezone', 'is', null)

  if (error) {
    // A database without migration 029 must degrade to silence, not to a 500
    // that pages someone: the cron fires every few minutes, so an error here
    // is an alert storm about a migration that simply has not run yet.
    if (isMissingColumn(error)) {
      return { ...summary, migrationMissing: true, notes: ['migration 029 not applied'] }
    }
    throw new Error(error.message)
  }

  const rows = (users ?? []) as ReminderUserRow[]
  if (rows.length === 0) return summary

  // ONE query for everyone's bookkeeping, rather than one per user. It also
  // answers the cheap question — "does this user have any reminder at all?" —
  // which is what lets the expensive per-user item fetch be skipped entirely
  // for someone who has set none.
  const { data: bookRows, error: bookError } = await service
    .from('items')
    .select('id, user_id, reminder_sent_date, reminder_snooze_until')
    .in('user_id', rows.map((r) => r.user_id))
    .not('reminder_time', 'is', null)
    .is('deleted_at', null)

  if (bookError) {
    if (isMissingColumn(bookError)) {
      return { ...summary, migrationMissing: true, notes: ['migration 029 not applied'] }
    }
    throw new Error(bookError.message)
  }

  const bookByUser = new Map<string, Map<string, BookkeepingRow>>()
  for (const row of (bookRows ?? []) as BookkeepingRow[]) {
    let forUser = bookByUser.get(row.user_id)
    if (!forUser) bookByUser.set(row.user_id, (forUser = new Map()))
    forUser.set(row.id, row)
  }

  for (const user of rows) {
    const timezone = user.timezone as string
    let clock: LocalClock
    try {
      clock = localClock(options.now, timezone)
    } catch {
      // An unparseable IANA zone is the user's data, not our bug — skip them
      // and keep going rather than failing the whole tick for everyone.
      summary.notes.push(`${user.user_id}: unusable timezone ${timezone}`)
      continue
    }

    const book = bookByUser.get(user.user_id) ?? new Map<string, BookkeepingRow>()
    const lastCallMinutes = user.habit_last_call_enabled
      ? minutesOfDay(user.habit_last_call_time)
      : null
    const lastCallDue =
      lastCallMinutes !== null &&
      user.habit_last_call_date !== clock.dateStr &&
      clock.nowMinutes >= lastCallMinutes &&
      clock.nowMinutes < Math.min(lastCallMinutes + (options.graceMinutes ?? 30), 1440)

    // Nothing set and nothing owed — do not pay for the item fetch.
    if (book.size === 0 && !lastCallDue) continue

    summary.users += 1

    const [items, routines, programs] = await Promise.all([
      fetchItems(user.user_id, undefined, service),
      fetchRoutines(user.user_id, service),
      fetchPrograms(user.user_id, service),
    ])

    // routines/programs return null when their tables are unreachable. Passing
    // the nulls through as "no memberships known" is the ActivationContext
    // contract and leaves item-level pause still honoured — which is the safe
    // direction: the worst case is a nudge for something a paused PROGRAM
    // covers, not a nudge for something the user paused by hand.
    const ctx: ActivationContext = {
      userTimezone: timezone,
      routines: routines ?? undefined,
      programs: programs ?? undefined,
    }

    const timeFormat: TimeFormat = user.time_format === '24h' ? '24h' : '12h'
    const channelState = await loadChannelState(service, user.user_id)
    const base = { userId: user.user_id, service, timeFormat, timezone }

    /* ── The per-item cues ─────────────────────────────────────────────── */

    const scanRows: ScanRow[] = items.map((item) => ({
      item,
      sentDate: book.get(item.id)?.reminder_sent_date ?? undefined,
      snoozeUntil: book.get(item.id)?.reminder_snooze_until ?? undefined,
    }))

    const candidates = dueReminders(
      scanRows,
      { ...clock, graceMinutes: options.graceMinutes },
      ctx,
    )

    if (candidates.length > 0) {
      // STAMP BEFORE DELIVERING, which is the opposite of what
      // /api/cron/eod-notify does and a deliberate divergence.
      //
      // Deliver-first survives a failed write by re-sending, and for a push
      // notification that is nearly free — the tag collapses the duplicate into
      // the same slot in the shade. It stops being free the moment a channel
      // costs money or rings a phone: six identical calls between 07:30 and
      // 08:00 is not a degraded experience, it is the reason someone uninstalls
      // the app. A stamp that lands and a delivery that fails costs one missed
      // cue on one day; the reverse costs trust, so the failure is pointed at
      // the cheaper side on purpose.
      const stampIds = candidates.map((c) => c.item.id)
      const { error: stampError } = await service
        .from('items')
        .update({ reminder_sent_date: clock.dateStr, reminder_snooze_until: null })
        .in('id', stampIds)
        .eq('user_id', user.user_id)

      if (stampError) {
        summary.notes.push(`${user.user_id}: cue stamp failed — ${stampError.message}`)
      } else {
        for (const candidate of candidates) {
          const { title, body } = reminderCopy(candidate, timeFormat)
          const nudge: Nudge = {
            kind: 'cue',
            title,
            body,
            url: `/item/${candidate.item.id}`,
            dateStr: clock.dateStr,
            itemId: candidate.item.id,
            items: [toNudgeItem(candidate.item)],
            snoozed: candidate.snoozed,
          }
          const reports = await deliverNudge(nudge, base, channelState)
          noteFailures(summary, user.user_id, 'cue', reports)
          summary.cues += 1
        }
      }
    }

    /* ── The streak-at-risk last call ──────────────────────────────────── */

    if (lastCallDue) {
      const open = lastCallItems(items, clock.dateStr, ctx)
      const copy = lastCallCopy(open)

      // Stamp even when there is nothing to say. "Everything is done" is not a
      // notification anyone asked for, but it IS an answered question, and
      // leaving the stamp off would re-ask it every tick for the rest of the
      // window.
      const { error: stampError } = await service
        .from('user_settings')
        .update({ habit_last_call_date: clock.dateStr })
        .eq('user_id', user.user_id)

      if (stampError) {
        summary.notes.push(`${user.user_id}: last-call stamp failed — ${stampError.message}`)
      } else if (copy) {
        const nudge: Nudge = {
          kind: 'last-call',
          title: copy.title,
          body: copy.body,
          url: '/',
          dateStr: clock.dateStr,
          itemId: open.length === 1 ? open[0].id : undefined,
          items: open.map(toNudgeItem),
        }
        const reports = await deliverNudge(nudge, base, channelState)
        noteFailures(summary, user.user_id, 'last-call', reports)
        summary.lastCalls += 1
      }
    }
  }

  return summary
}

function noteFailures(
  summary: ScanSummary,
  userId: string,
  kind: string,
  reports: DeliveryReport[],
): void {
  for (const report of reports) {
    if (report.ok || report.skipped) continue
    summary.notes.push(`${userId}: ${kind} via ${report.channel} failed — ${report.detail ?? '?'}`)
  }
}
