/**
 * active.ts — the ONE definition of "is this item live right now?"
 *
 * Written the way lib/overdue.ts was, and for the same reason: that module
 * exists because one predicate had been copied into three surfaces and the
 * copies drifted. Suppression is going to be asked by MORE surfaces than
 * "past due" ever was — the grid, the past-due bar, the EOD review, the
 * braindump, Beacon's context, the agent projections, search — so it gets a
 * single home before the first copy can happen, not after the third.
 *
 * Everything here is pure and string-based. Nothing reads a store and nothing
 * calls `new Date()` for "today" — callers pass the day, which is what makes
 * the whole thing testable and timezone-stable.
 *
 * Phase 1 resolves ITEM-level pause only. Programs and routines land in
 * Phases 2–3 by growing {@link ActivationContext} and the path rules inside
 * {@link isItemActiveOn}; every call site is already written against the final
 * signature, so those phases add no new call-site churn.
 *
 * See memory/plans/programs-routines.md, locked decisions 3 and 4.
 */

import { isRecurring, isCompletedOnDate, isSkippedOnDate, toDateStr } from './recurrence';
import { toDateOnly } from './overdue';
import type { Item } from './planner-types';

/**
 * Everything the resolver needs beyond the item and the date.
 *
 * Phases 2–3 add `routinesById` / `programsById` / membership lookups here.
 * It is an object rather than a positional argument precisely so that growth
 * is additive at every call site.
 */
export interface ActivationContext {
  /** IANA zone — the pause interval's start is a timestamp and must be read in the user's day. */
  userTimezone: string;
}

/** The pause columns, on an item or (from Phase 2) a routine. */
export interface Pausable {
  pausedAt?: string;
  pausedUntil?: string;
}

/**
 * Is `x` inside a pause interval on `dateStr`?
 *
 * The interval is [pausedAt's date, pausedUntil), and BOTH bounds matter:
 *
 * - The lower bound is why `pausedAt` is stored at all. Without it, pausing a
 *   habit today would suppress every unmarked occurrence backwards through its
 *   whole history — habits are deliberately un-anchored (they render on every
 *   matching day, forever) precisely so that history stays visible, and a
 *   pause must not retroactively erase a July that actually happened.
 * - The upper bound is EXCLUSIVE: "paused until Sep 1" is live again ON Sep 1.
 *   That makes auto-resume a read-side predicate — no cron, no cleanup write,
 *   and an expired pause still reads correctly as "was paused during […]",
 *   which is what the auto-age sweep's resume grace needs (plan decision 9).
 *
 * A manual resume normalizes to `pausedUntil = today` rather than clearing the
 * pair, so the interval survives on the row.
 */
export function isPausedOn(x: Pausable, dateStr: string, userTimezone: string): boolean {
  if (!x.pausedAt) return false;
  const day = toDateOnly(dateStr);
  const started = pauseStartDate(x.pausedAt, userTimezone);
  // Unparseable timestamp: treat as not-paused. Hiding work is the costlier
  // failure, and a bad value here would otherwise silently swallow items.
  if (!started || started > day) return false;
  if (x.pausedUntil && day >= toDateOnly(x.pausedUntil)) return false;
  return true;
}

/** The user-local calendar day a pause began, or null if the stamp is junk. */
function pauseStartDate(pausedAt: string, userTimezone: string): string | null {
  const at = new Date(pausedAt);
  if (Number.isNaN(at.getTime())) return null;
  return toDateStr(at, userTimezone);
}

/**
 * Is this item live on `dateStr`?
 *
 * Phase 1: an item is live unless it is itself paused. Phases 2–3 add the
 * activation-path algebra (direct program membership, membership via a routine,
 * and a routine belonging to no program), where an item with at least one live
 * path is live and an item with NO paths keeps today's always-live behavior.
 *
 * Note this answers "is it live", NOT "should it be hidden" — a suppressed item
 * with a completion mark still renders. Hiding surfaces want
 * {@link isOpenLoopSuppressedOn}.
 */
export function isItemActiveOn(item: Item, dateStr: string, ctx: ActivationContext): boolean {
  return !isPausedOn(item, dateStr, ctx.userTimezone);
}

/**
 * Does this item still want doing on `dateStr` — i.e. is it an OPEN LOOP there?
 *
 * A recurring item's obligation on a date is discharged by any mark: a
 * completion, a skip, or (for a counted habit) a tally. A one-shot item's is
 * discharged by leaving `pending` — which covers 'completed' and, deliberately,
 * 'cancelled', matching selectOverdue's reasoning that a cancelled item must
 * never resurface in a surface whose exits assume it can be completed.
 */
export function isOpenLoopOn(item: Item, dateStr: string): boolean {
  const day = toDateOnly(dateStr);
  if (isRecurring(item)) {
    if (isCompletedOnDate(item, day)) return false;
    if (isSkippedOnDate(item, day)) return false;
    // Habit-only, and only when timesPerDay is in play; absent elsewhere.
    const counts = (item as { dailyCounts?: Record<string, number> }).dailyCounts;
    if (counts && (counts[day] ?? 0) > 0) return false;
    return true;
  }
  return item.status === 'pending';
}

/**
 * THE predicate every hiding surface asks: suppressed AND still an open loop.
 *
 * This is locked decision 4 in one function — "suppression hides open loops,
 * never history". A paused habit you already ticked today keeps its row in the
 * EOD review, in Beacon's narration and in the agent projection; only the
 * unanswered obligations disappear. Get this wrong in the hiding direction and
 * pausing quietly rewrites the past.
 */
export function isOpenLoopSuppressedOn(
  item: Item,
  dateStr: string,
  ctx: ActivationContext,
): boolean {
  return !isItemActiveOn(item, dateStr, ctx) && isOpenLoopOn(item, dateStr);
}

/**
 * Ids of every item that must be hidden on `dateStr`.
 *
 * The pure derivations downstream (deriveDayItems, selectOverdue) take this Set
 * rather than the containers themselves: they are store-free by design, and
 * from Phase 2 resolving an item would mean walking item → routine → program.
 * Resolving once per rendered date and passing ids keeps that walk in one place.
 */
export function inactiveItemIdsOn(
  items: readonly Item[],
  dateStr: string,
  ctx: ActivationContext,
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (isOpenLoopSuppressedOn(item, dateStr, ctx)) ids.add(item.id);
  }
  return ids;
}

/**
 * Why an item is suppressed, for the surfaces that must SAY so — the item
 * panel's activation line and the braindump's Paused section. Returns null when
 * the item is live, so `!reason` doubles as the liveness check.
 *
 * Phase 2–3 widen the return with a container cause ("Hidden with your Summer
 * program"); the shape is a discriminated object so that growth doesn't break
 * the callers written now.
 */
export type SuppressionReason =
  | { kind: 'paused'; until?: string };

export function suppressionReason(
  item: Item,
  dateStr: string,
  ctx: ActivationContext,
): SuppressionReason | null {
  if (isPausedOn(item, dateStr, ctx.userTimezone)) {
    return { kind: 'paused', until: item.pausedUntil };
  }
  return null;
}
