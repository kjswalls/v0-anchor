/**
 * program-boundaries — where a run of days changes hands.
 *
 * A week that spans a program's start or end renders live and suppressed
 * columns side by side. That is the showcase for date-parameterized activation
 * (plan decision 3), and it is also the moment the grid becomes confusing: five
 * columns carry the summer routine and two do not, and the two that don't look
 * like a bug rather than a boundary.
 *
 * So the boundary gets said out loud, once, on the column where it happens.
 * Not on every column — a persistent "Summer" badge across five days is chrome,
 * and the rule everywhere else in this feature is that only the exception is
 * labelled.
 *
 * Pure and store-free, like lib/active.ts: dates in, labels out. It lives in
 * its own module rather than inside the week grid because the bucket week view
 * wants the same markers, and a second copy of this logic is how lib/overdue.ts
 * came to exist.
 */

import { isProgramActiveOn } from './active';
import type { Program } from './planner-types';

export interface ProgramBoundary {
  /** Programs that begin carrying their members on this date. */
  started: Program[];
  /** Programs that stopped: live on the previous date in the run, not on this one. */
  ended: Program[];
}

/**
 * Boundaries for a run of consecutive dates, indexed by date string.
 *
 * The FIRST date in the run never reports a boundary, and that is deliberate
 * rather than a missing edge case: with no previous column rendered there is
 * nothing on screen for the change to be a change FROM, so a marker there would
 * be an assertion the user cannot check. Walk to the previous week and the same
 * boundary appears in its rightful place.
 *
 * Programs with no date range never appear here. Only `auto` programs flip on a
 * date; the manual states apply uniformly to every column (they have no
 * recorded history to place a boundary at), so a manual flip correctly produces
 * no marker anywhere.
 */
export function programBoundaries(
  dateStrs: readonly string[],
  programs: readonly Program[],
): Map<string, ProgramBoundary> {
  const boundaries = new Map<string, ProgramBoundary>();
  if (programs.length === 0) return boundaries;

  let previous: Set<string> | null = null;
  for (const dateStr of dateStrs) {
    const live = new Set<string>();
    for (const program of programs) {
      if (isProgramActiveOn(program, dateStr)) live.add(program.id);
    }
    if (previous) {
      const started = programs.filter((p) => live.has(p.id) && !previous!.has(p.id));
      const ended = programs.filter((p) => !live.has(p.id) && previous!.has(p.id));
      if (started.length || ended.length) boundaries.set(dateStr, { started, ended });
    }
    previous = live;
  }
  return boundaries;
}

/**
 * The marker's words. Short enough for a 140px week column, and phrased from
 * the reader's side of the screen — "Summer starts" describes the day they are
 * looking at, where "Program activated" describes the database.
 */
export function boundaryLabel(boundary: ProgramBoundary): string {
  const names = (list: Program[]) => list.map((p) => p.name).join(' & ');
  if (boundary.started.length && boundary.ended.length) {
    return `${names(boundary.ended)} → ${names(boundary.started)}`;
  }
  if (boundary.started.length) return `${names(boundary.started)} starts`;
  return `${names(boundary.ended)} ends`;
}
