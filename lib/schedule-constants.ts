/** Comfortable hour-row height (px) for the schedule grids — the ceiling the
 *  adaptive fit (useFitHourPx) shrinks down from, never grows past. Lives here,
 *  not in day-schedule, so the fit hook can read it without an import cycle. */
export const HOUR_PX = 75;

/** Cap for <ProjectBlock variant="week"> (issue #193). Day view's ProjectBlock
 *  stays unbounded, since a mini week column can't afford an ever-growing card
 *  the way a full day-width one can. ~4 task rows before it scrolls.
 *  Week × Buckets (components/views/week-buckets.tsx) passes variant="week";
 *  it nests inside the bucket's own WEEK_BUCKET_MAX_H cap, so keep this the
 *  smaller of the two or the inner scroll never engages. */
export const WEEK_PROJECT_BLOCK_MAX_H = 160;

/** Week × Buckets. A single time bucket's content caps out here and scrolls
 *  internally, so a bucket stacked with rows doesn't push the rest of the day
 *  column off-screen. */
export const WEEK_BUCKET_MAX_H = 320;
