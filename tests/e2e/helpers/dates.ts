/**
 * Timezone-aware date helpers for E2E tests.
 *
 * Module-scoped `new Date()` calls are computed once at import time using the
 * runner's local timezone, which can produce wrong dates in CI when the runner
 * is in a different timezone than the app (America/Los_Angeles).
 *
 * Use these helpers inside each test to get the correct calendar date.
 */

/**
 * Returns today's date as "YYYY-MM-DD" in the given IANA timezone.
 * Defaults to America/Los_Angeles (the app's timezone).
 */
export function getTodayStr(tz = 'America/Los_Angeles'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/**
 * Returns tomorrow's date as "YYYY-MM-DD" in the given IANA timezone.
 * Computes the next calendar day relative to today in the target timezone.
 */
export function getTomorrowStr(tz = 'America/Los_Angeles'): string {
  const todayStr = getTodayStr(tz);
  const [y, m, d] = todayStr.split('-').map(Number);
  // 18:00 UTC on the next calendar day is safely within "tomorrow" for
  // America/Los_Angeles (UTC-7 / UTC-8), so Intl will return the right date.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.UTC(y, m - 1, d + 1, 18, 0, 0))
  );
}

/**
 * Returns a Date object representing "today" in the given IANA timezone,
 * at noon UTC of that calendar day. Use this instead of `new Date()` when
 * passing to date-fns helpers (nextSaturday, nextMonday, etc.) so that the
 * resulting dates match the browser's timezone-aware view of the world.
 */
export function getTodayInTz(tz = 'America/Los_Angeles'): Date {
  const todayStr = getTodayStr(tz);
  const [y, m, d] = todayStr.split('-').map(Number);
  // Noon UTC is unambiguously within the target calendar day for LA (UTC-7/8).
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
