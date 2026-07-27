/** Comfortable hour-row height (px) for the schedule grids — the ceiling the
 *  adaptive fit (useFitHourPx) shrinks down from, never grows past. Lives here,
 *  not in day-schedule, so the fit hook can read it without an import cycle. */
export const HOUR_PX = 75;
