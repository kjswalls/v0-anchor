import { MIN_CHANNEL_PX } from './schedule-constants';
import type { ViewLayout } from './view-store';

/**
 * How wide a day column is in the week views.
 *
 * The stored preference is a DAY COUNT — "show me five days" — not a pixel
 * width, because that is the promise the control makes and the only one that
 * survives the canvas changing size under it. Open the item panel (420px) or
 * collapse the sidebar and "five days" is still five days; a stored pixel width
 * would silently become four and a half. Pixels are the derived value, and they
 * are what the readout shows.
 *
 * Every number here is geometry the two week views already had, lifted out so
 * the derivation is one pure function with a unit test rather than a formula
 * living in a style attribute.
 *
 * ── The measurement contract ──
 * `viewportPx` is the Radix ScrollArea VIEWPORT's clientWidth — the scrollport,
 * not the content. It never depends on how wide the columns are (the viewport
 * is `size-full`), which is what makes deriving column width from it safe:
 * there is no measure → resize → measure loop. Measuring the content wrapper
 * instead would close that loop immediately.
 */

/** Mirrors `padding-inline: 2rem` on `@utility canvas-container` in app/globals.css.
 *  A JS copy of a CSS number is a liability, so it is stated once, here, and the
 *  CSS carries a pointer back. Both week views are desktop-only (mobile is
 *  day-scope by construction — see components/mobile/mobile-view-router.tsx), so
 *  the <768px override of that padding is deliberately not mirrored. */
export const CANVAS_PAD_PX = 32;

/**
 * The day counts the control offers, widest column last.
 *
 * Seven is "the whole week at once" and is the default — at any canvas narrower
 * than ~1170px it lands exactly on the floor, which is pixel-for-pixel what both
 * views rendered before this control existed. Two is the practical far end: one
 * day is the Day view, and the day header cards stop being a week at that point.
 */
export const WEEK_DAY_STOPS = [7, 6, 5, 4, 3, 2] as const;

export const MIN_WEEK_DAYS = WEEK_DAY_STOPS[WEEK_DAY_STOPS.length - 1];
export const MAX_WEEK_DAYS = WEEK_DAY_STOPS[0];

/**
 * The column width the view aims for when nobody has picked yet.
 *
 * The default is expressed as a WIDTH, not a day count, because a comfortable
 * column is a property of the content — a title, a checkbox, a time — and not of
 * the screen. So the stored preference stays a day count (it has to; see the
 * header), but the *default* is whichever day count lands nearest this width on
 * the canvas you actually have. A laptop and a 4K monitor then open at the same
 * apparent density rather than at the same seven crushed columns.
 *
 * Only ever consulted while the preference is null. The moment the control is
 * touched, the day count is what persists — see resolveWeekDays.
 */
export const TARGET_COL_PX = 287;

/**
 * How far off the target a stop may be and still count as "as good as the best".
 *
 * Nearest-wins alone gives some bad answers, because the ladder is coarse at the
 * wide end: on an 836px scrollport three days lands 61px under the target and
 * two days lands 57px over, so two days wins by four pixels — and a "week" view
 * opens showing two days. Neither is near 287; the arithmetic is just picking
 * between two mediocre options, and when it is that close the tie should go to
 * seeing more of the week.
 *
 * So: gather every stop within this much of the best, and take the one with the
 * MOST days. 24px is about four characters at the 12px content size — below
 * that, extra column width buys no visible content, which is what makes the two
 * candidates genuinely interchangeable. It is also comfortably inside the
 * margins that decide the common cases: the stops that win on a 1256px and a
 * 1476px canvas beat their runners-up by 57px and 44px respectively, so this
 * changes neither.
 */
export const TARGET_TOLERANCE_PX = 24;

/**
 * A column never grows past this however few days you ask for. Not a legibility
 * bound — a sanity one: at two days on a 4K canvas the arithmetic wants ~900px,
 * and a 900px-wide day column inside a *week* view is just the Day view wearing
 * a costume.
 */
export const MAX_COL_PX = 480;

export interface WeekGeometry {
  /** Fixed left column the day columns sit beside (the hour gutter), or 0. */
  gutterPx: number;
  /** The flex `gap` between every pair of adjacent children, gutter included. */
  gapPx: number;
  /** The narrowest this layout's column may ever be. */
  minColPx: number;
}

/**
 * Per-layout geometry. Both entries restate what the view already hardcoded, so
 * the default day count reproduces today's rendering exactly:
 *
 * - schedule: DAY_FIELD_LEFT (68) + `gap-2` + the MIN_CHANNEL_PX floor the
 *   columns already carried as `minWidth`.
 * - buckets: no gutter, `gap-7`, and a 240px floor — its old fixed `w-60`.
 *   Bucket cards carry stacked rows and a header count, so they need
 *   meaningfully more than a schedule block does; 240 is where the view already
 *   sat, and at seven days it takes a canvas wider than ~1940px before the
 *   arithmetic clears it. In other words buckets renders at exactly 240 on
 *   every realistic screen until you actually move the control.
 */
export const WEEK_GEOMETRY: Record<'schedule' | 'buckets', WeekGeometry> = {
  schedule: { gutterPx: 68, gapPx: 8, minColPx: MIN_CHANNEL_PX },
  buckets: { gutterPx: 0, gapPx: 28, minColPx: 240 },
};

/** The layouts that have day columns at all. Week × List is a stack of rows. */
export type ScalableLayout = keyof typeof WEEK_GEOMETRY;

export function isScalableLayout(layout: ViewLayout): layout is ScalableLayout {
  return layout === 'schedule' || layout === 'buckets';
}

/** Coerce anything that came out of persisted storage into a usable day count. */
export function clampWeekDays(days: unknown): number {
  const n = typeof days === 'number' && Number.isFinite(days) ? Math.round(days) : MAX_WEEK_DAYS;
  return Math.min(MAX_WEEK_DAYS, Math.max(MIN_WEEK_DAYS, n));
}

/** Move `days` along the ladder. `delta` is in *stops*: +1 is one wider. */
export function stepWeekDays(days: unknown, delta: number): number {
  const current = clampWeekDays(days);
  // The ladder is contiguous, so a stop step is a day step — inverted, because
  // wider columns mean fewer of them.
  return clampWeekDays(current - delta);
}

/**
 * The day count whose column lands nearest TARGET_COL_PX on this canvas — with
 * anything within TARGET_TOLERANCE_PX of that treated as equally good, and the
 * tie broken toward MORE days. See the tolerance constant for why.
 */
export function defaultWeekDays(viewportPx: number, geo: WeekGeometry): number {
  const deltas = WEEK_DAY_STOPS.map((days) => ({
    days,
    delta: Math.abs(weekColumnPx(days, viewportPx, geo) - TARGET_COL_PX),
  }));
  const bestDelta = Math.min(...deltas.map((d) => d.delta));
  const contenders = deltas.filter((d) => d.delta <= bestDelta + TARGET_TOLERANCE_PX);
  // WEEK_DAY_STOPS runs most days first, so the first contender has the most.
  return contenders[0].days;
}

/**
 * The day count actually in force: the user's choice if they have made one, and
 * the width-derived default until then.
 *
 * `null` is a real, meaningful state — "never adjusted" — and not the same as
 * "adjusted, and happened to land on the default". While it is null the default
 * keeps re-deriving, so moving the window or opening the item panel re-picks the
 * stop nearest TARGET_COL_PX. The first touch of the control writes a number and
 * that stops for good.
 */
export function resolveWeekDays(
  stored: number | null | undefined,
  viewportPx: number,
  geo: WeekGeometry
): number {
  return stored == null ? defaultWeekDays(viewportPx, geo) : clampWeekDays(stored);
}

/* ── the last measured week canvas ─────────────────────────────────────────
   Everything above is pure. This is not, and it exists for exactly one caller.

   Resolving the default needs a measurement, and the keyboard commands in
   lib/commands/registry.ts are the one consumer that has no DOM to measure —
   they run from a keydown handler, not from a component. So the week views
   record what they measured here on the way past.

   The invariant that makes it safe: those commands are gated `availableWhen`
   scope is week AND the layout has columns, which is exactly when a week view —
   and therefore useWeekColumns — is mounted and has measured. A stale reading is
   not possible; an absent one falls back to the ladder's narrow end. */

let lastCanvas: { viewportPx: number; geo: WeekGeometry } | null = null;

export function noteWeekCanvas(viewportPx: number, geo: WeekGeometry): void {
  lastCanvas = { viewportPx, geo };
}

/** For tests, which must not inherit a measurement from a previous case. */
export function forgetWeekCanvas(): void {
  lastCanvas = null;
}

/** resolveWeekDays against the last measured canvas. */
export function resolveWeekDaysFromLastCanvas(stored: number | null | undefined): number {
  if (stored != null) return clampWeekDays(stored);
  if (!lastCanvas) return MAX_WEEK_DAYS;
  return defaultWeekDays(lastCanvas.viewportPx, lastCanvas.geo);
}

/**
 * The pixel width of one day column at `days` days across a `viewportPx` canvas.
 *
 * Fitting N columns beside the gutter means the row's children are
 * `[gutter, col × N]` — N + 1 boxes, so N gaps — inside the container's content
 * box. Solving for the column:
 *
 *     colPx = (viewportPx - 2·pad - gutter - N·gap) / N
 *
 * FLOOR, never round: `overflowX` is hard-set to `scroll` on the Radix viewport
 * (the horizontal <ScrollBar> flips it), so rounding up by a single pixel does
 * not clip — it leaves the grid permanently nudgeable by 1px, which reads as a
 * bug on a stop whose entire promise is "this fits".
 *
 * The result is clamped, and a clamped result is the honest answer rather than a
 * failed one: at seven days on a 1440px window the arithmetic wants 115px, and
 * 115px cannot hold a block title. It renders at the floor and scrolls, which is
 * exactly what the view did before the control existed.
 */
export function weekColumnPx(
  days: number | null | undefined,
  viewportPx: number,
  geo: WeekGeometry
): number {
  const n = clampWeekDays(days);
  const field = viewportPx - 2 * CANVAS_PAD_PX - geo.gutterPx - n * geo.gapPx;
  const raw = Math.floor(field / n);
  return Math.min(MAX_COL_PX, Math.max(geo.minColPx, raw));
}

export interface WeekStop {
  days: number;
  colPx: number;
  /**
   * False when the arithmetic was clamped, i.e. this many days does NOT actually
   * fit the canvas and the grid will scroll. The control says so rather than
   * pretending; two adjacent inexact stops also render identically, which is why
   * the readout has to be able to explain itself.
   */
  fits: boolean;
}

/** Every stop with the width it resolves to on this canvas, for the readout. */
export function weekStops(viewportPx: number, geo: WeekGeometry): WeekStop[] {
  return WEEK_DAY_STOPS.map((days) => {
    const colPx = weekColumnPx(days, viewportPx, geo);
    const field = viewportPx - 2 * CANVAS_PAD_PX - geo.gutterPx - days * geo.gapPx;
    return { days, colPx, fits: Math.floor(field / days) >= geo.minColPx };
  });
}

/**
 * How many columns are actually visible, to one decimal — the truth behind the
 * label when a stop is clamped. Never below zero; the caller formats it.
 */
export function visibleDays(colPx: number, viewportPx: number, geo: WeekGeometry): number {
  const field = viewportPx - 2 * CANVAS_PAD_PX - geo.gutterPx;
  return Math.max(0, field / (colPx + geo.gapPx));
}
