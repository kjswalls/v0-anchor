/**
 * The horizon for per-date completion history.
 *
 * WHY A WINDOW AT ALL. `items.completed_dates` / `skipped_dates` accrue one
 * date string per completion and are never trimmed, so they are the only part
 * of an account that grows with TIME rather than with what the user creates. A
 * daily habit adds ~365 strings a year; fetchItems selects every non-deleted
 * item with no date bound, and planner-store holds them all in memory. Thirty
 * daily habits kept for a decade is roughly a megabyte of date strings shipped
 * on every page load, to render one day.
 *
 * TWO WINDOWS, NOT ONE, AND READ MUST BE THE SMALLER.
 *
 *   READ — how much history a fetch returns. Bounded by the deepest surface
 *   that renders history: HEATMAP_WEEKS (26 weeks ≈ 182 days) in
 *   components/planner/item-detail-sections.tsx, which aligns to a week start
 *   and so can reach ~189 days back. Everything else reads today, this week, or
 *   the last 14 days. 400 days is a bit over 2x that, and clears a year, so
 *   "this time last year" stays expressible without another migration.
 *
 *   RETRACTION — how far back an ABSOLUTE completedDates/skippedDates body may
 *   clear a date it omits (lib/db.ts reconcileDateArrays). This exists because
 *   windowing reads creates partial writers: a client holding 400 days of a
 *   ten-year history cannot distinguish "I retract this date" from "I was never
 *   sent it", and treating omission as retraction would delete the other nine
 *   years. Scoping retraction to a window makes the older history unreachable
 *   by an absolute write, whatever the writer believes.
 *
 * WHY THE GAP. A client fetched its arrays at some earlier time, so the oldest
 * date it holds is older than today's read cutoff. If retraction used the SAME
 * cutoff, a legitimate retraction of a date that had since aged out would be
 * silently ignored. The gap absorbs that staleness: a writer would have to be
 * ~400 days out of date before a real retraction is dropped, and the failure
 * direction is the safe one (a retraction is refused, never history deleted).
 *
 * CHANGE ONE, CHANGE BOTH: READ_DAYS is mirrored in SQL by
 * supabase/migrations/031_items_windowed.sql (the items_windowed view). The
 * numbers must agree, or the view serves a slice the app does not expect. Same
 * convention as CANVAS_PAD_PX.
 */
export const COMPLETION_READ_WINDOW_DAYS = 400;

/** See above. MUST be >= COMPLETION_READ_WINDOW_DAYS; asserted in tests. */
export const COMPLETION_RETRACTION_WINDOW_DAYS = 800;

/**
 * The oldest date a window admits, as a YYYY-MM-DD string.
 *
 * Deliberately UTC-based rather than resolved through the user's timezone. The
 * cutoff is a bulk bound with hundreds of days of margin over any surface that
 * reads it, so a day of timezone slop cannot move a date in or out of anything
 * a user can see — and requiring a timezone here would put one in the SQL view,
 * which has no user context at all. Callers that care about a SPECIFIC date
 * still resolve it through toDateStr; this is not that.
 */
export function windowStart(days: number, now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return cutoff.toISOString().slice(0, 10);
}
