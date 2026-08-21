/**
 * day.ts — what a finished day concluded.
 *
 * Pure, string-based, and the ONE place "was this a hit or a miss" is decided.
 * Every stake adapter reads this rather than asking the items itself, so a
 * Beeminder datapoint and a pledge ledger row can never disagree about whether
 * Tuesday happened.
 *
 * THE THREE-WAY SPLIT, and why it is not two. An occurrence on a settled day is
 * a hit, a miss, or NEITHER — a skip is neither. That is not a technicality: a
 * skip is the user saying "not this one, deliberately", and charging for it
 * would make the honest gesture the expensive one and teach people to just let
 * things lapse silently instead. Anchor already treats a skip as a discharged
 * obligation everywhere else (isOpenLoopOn); money must not be the exception.
 */

import { getItemTypeConfig, isRemindable, itemTypeName } from '../item-registry'
import { isItemActiveOn, isOpenLoopOn, type ActivationContext } from '../active'
import { occursOn } from '../reminders/due'
import type { Item } from '../planner-types'

export interface DayOutcome {
  /** The local day settled, yyyy-MM-dd. */
  dateStr: string
  /** Occurred and was completed (or tallied). */
  hits: Item[]
  /** Occurred, was not completed, and was not skipped. */
  misses: Item[]
}

/**
 * Which items a stake may be attached to at all.
 *
 * Streak-bearing types only — the same set the last call names, and for the
 * same reason stated once there: a stake is denominated in what a lapse costs,
 * and a dated one-off task has no lapse, only a completion that has not
 * happened yet. Deriving it from `counters.streak` rather than a second
 * registry flag keeps the two answers from ever disagreeing.
 */
export function stakeEligible(item: Item): boolean {
  if (!isRemindable(item)) return false
  return getItemTypeConfig(itemTypeName(item)).counters.streak
}

export function settleDay(
  items: readonly Item[],
  dateStr: string,
  ctx: ActivationContext,
): DayOutcome {
  const hits: Item[] = []
  const misses: Item[] = []

  for (const item of items) {
    if (!stakeEligible(item)) continue
    if (!occursOn(item, dateStr, ctx.userTimezone)) continue
    // A suppressed day is not a missed day. Pausing a habit — or the program
    // that holds it — is a decision the user made, and billing them for it
    // would make the pause button cost money.
    if (!isItemActiveOn(item, dateStr, ctx)) continue

    // isOpenLoopOn is the shared definition: false means the obligation was
    // discharged, by a completion OR a tally OR a skip. The skip has to be
    // separated back out, because only the first two are hits.
    if (!isOpenLoopOn(item, dateStr)) {
      if (wasSkipped(item, dateStr)) continue
      hits.push(item)
      continue
    }
    misses.push(item)
  }

  return { dateStr, hits, misses }
}

function wasSkipped(item: Item, dateStr: string): boolean {
  const skipped = 'skippedDates' in item ? item.skippedDates : undefined
  return Array.isArray(skipped) && skipped.includes(dateStr)
}
