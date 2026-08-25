/**
 * Is tonight's review still owed?
 *
 * Pure, and separate from lib/eod-store.ts on purpose: this is the question the
 * dock asks every render, and it has three inputs that are easy to get subtly
 * wrong (a clock, a saved timezone, and a date string). A predicate that owns a
 * `new Date()` cannot be tested at 21:01 versus 20:59, so the clock arrives as
 * an argument.
 *
 * THE GAP THIS EXISTS TO CLOSE. The review has never had an in-app entry point
 * that appears on its own. components/shell/app-shell.tsx opens the modal from
 * `?eod=1` — a tapped push notification — and lib/commands/registry.ts opens it
 * from the palette. That is the whole list. Turn the review on, deny
 * notification permission or swipe the notification away, and the app will
 * never mention it again: the setting is on, the hour has passed, and nothing
 * on screen says so. The predicate below is what a surface needs in order to.
 */

export interface EodOwedInput {
  eodReviewEnabled: boolean;
  /** HH:mm, the hour the review is due. */
  eodReviewTime: string;
  /** yyyy-MM-dd of the last completed review, or null if never. */
  lastEodReviewDate: string | null;
  /** yyyy-MM-dd the user is deferring, set when they wave the line away. */
  eodDeferredDate?: string | null;
}

/** Minutes past local midnight, or null if the stored time is malformed. */
export function minutesOfDay(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * @param todayStr today in the user's SAVED timezone (`toDateStr`), never the
 *   machine's — the same convention the waiting notice and the sweep use, so
 *   the three cannot disagree about which day it is.
 * @param nowMinutes minutes past midnight, in that same timezone.
 *
 * A malformed `eodReviewTime` reads as NOT owed. The alternative — treating an
 * unparseable hour as midnight — would put a line on the dock all day for a
 * value the user cannot see and did not choose.
 */
export function isEodOwed(
  input: EodOwedInput,
  todayStr: string,
  nowMinutes: number
): boolean {
  if (!input.eodReviewEnabled) return false;
  // Already done today. This is the only thing that RETIRES the line, as
  // opposed to hiding it — see the deferral below.
  if (input.lastEodReviewDate === todayStr) return false;
  const due = minutesOfDay(input.eodReviewTime);
  if (due === null) return false;
  return nowMinutes >= due;
}

/**
 * Owed, and not waved away for today.
 *
 * The split matters: a deferral hides the LINE, it does not settle the review.
 * Anything asking "does the user still owe tonight's review" (a future digest, a
 * streak, the push job) wants `isEodOwed`; only the dock wants this. Same shape
 * as the waiting notice's dismissal, which is deliberate — one gesture, one
 * meaning, on both of the app's unprompted lines.
 */
export function shouldShowEodNotice(
  input: EodOwedInput,
  todayStr: string,
  nowMinutes: number
): boolean {
  if (input.eodDeferredDate === todayStr) return false;
  return isEodOwed(input, todayStr, nowMinutes);
}

/** Minutes past midnight right now, in `timeZone`. */
export function nowMinutesIn(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Intl renders midnight as 24 in some ICU versions under hour12:false.
  return (hour % 24) * 60 + minute;
}
