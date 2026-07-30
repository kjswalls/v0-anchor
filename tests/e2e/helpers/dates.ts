import { TEST_TZ } from './env';

/**
 * Timezone-aware date helpers for E2E tests.
 *
 * Module-scoped `new Date()` calls are computed once at import time in the
 * runner's local timezone, which produces wrong dates in CI when the runner sits
 * in a different zone than the browser. Call these inside each test instead.
 *
 * The zone comes from TEST_TZ (helpers/env.ts), which playwright.config.ts also
 * imports for `timezoneId` — so the browser and these helpers cannot disagree.
 * This file used to hardcode the string in three places and the config repeated
 * it twice more.
 */

/** Today as "YYYY-MM-DD" in the app's timezone. */
export function getTodayStr(tz = TEST_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/**
 * A calendar date `offsetDays` from today, as "YYYY-MM-DD" in `tz`.
 *
 * Offsets are applied with UTC arithmetic on a NOON anchor and re-formatted in
 * the target zone. Noon is far enough from both midnights that no real-world UTC
 * offset (−12…+14) or DST shift can land the result on a neighbouring day — which
 * is why this is safe for an arbitrary `tz`, unlike the old getTomorrowStr /
 * getTodayInTz pair whose 18:00-UTC and noon-UTC tricks were only correct for the
 * Americas despite advertising a `tz` parameter.
 *
 * recurring.spec.ts used to hand-roll its own offset maths because this did not
 * exist — two date implementations in one suite.
 */
export function getDateStr(offsetDays: number, tz = TEST_TZ): string {
  const [y, m, d] = getTodayStr(tz).split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(anchor);
}

/** Tomorrow as "YYYY-MM-DD" in the app's timezone. */
export function getTomorrowStr(tz = TEST_TZ): string {
  return getDateStr(1, tz);
}

/**
 * A `Date` for a "YYYY-MM-DD" calendar day, anchored at noon UTC.
 *
 * Use this when handing a day to date-fns helpers (nextSaturday, addDays, …) so
 * the result matches the browser's timezone-aware view rather than the runner's.
 */
export function dateFromStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** A `Date` for today in the app's timezone, anchored at noon UTC. */
export function getTodayInTz(tz = TEST_TZ): Date {
  return dateFromStr(getTodayStr(tz));
}

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" day. */
export function weekdayOf(dateStr: string): number {
  return dateFromStr(dateStr).getUTCDay();
}

/**
 * The first date at/after `fromOffset` whose weekday is `weekday`, as
 * "YYYY-MM-DD". Lets a spec say "the next Saturday" without importing date-fns
 * or repeating modular arithmetic.
 */
export function nextWeekdayStr(weekday: number, fromOffset = 1, tz = TEST_TZ): string {
  for (let i = fromOffset; i < fromOffset + 7; i++) {
    const candidate = getDateStr(i, tz);
    if (weekdayOf(candidate) === weekday) return candidate;
  }
  // Unreachable: any 7-day window contains every weekday.
  throw new Error(`nextWeekdayStr: no weekday ${weekday} found from offset ${fromOffset}`);
}
