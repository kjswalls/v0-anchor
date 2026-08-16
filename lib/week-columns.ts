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
 * Seven is "the whole week at once" — the ladder's narrow end, and the answer
 * when no stop fits at all, where it lands exactly on the floor and is
 * pixel-for-pixel what both views rendered before this control existed. It is
 * NOT the default; that is derived from the canvas (see TARGET_COL_PX). Two is
 * the practical far end: one day is the Day view, and the day header cards stop
 * being a week at that point.
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
 * - buckets: no gutter, `gap-7`, and a floor derived the same way schedule's is
 *   (below).
 *
 * ── The buckets floor ──
 * It was 240 — the view's old fixed `w-60` — for this control's first release,
 * on the argument that a bucket card carrying stacked rows needs meaningfully
 * more than a schedule block. The width was right and the argument was wrong:
 * `w-60` was chosen when `canvas-container` still capped the canvas at 1100px
 * and only ~4 columns were ever on screen, so it was a comfortable column, not a
 * minimum one. Kept as a floor it swallowed most of the ladder — on a 1440px
 * window four of the six stops resolved to exactly 240 and the slider did
 * nothing for two thirds of its travel.
 *
 * So it is derived from the same budget MIN_CHANNEL_PX is: ~128px of title
 * (about 16 characters at 12/17), plus the mini bucket's own chrome. A spine
 * mini row starts its title at cardX 13 + body pl-2 + TaskRow px-2 = 29 and ends
 * 16 from the right, with 16 + 12 for the checkbox and its gap — 73px of
 * furniture, so 128 + 73 ≈ 200. The tray variant's chrome is 13px lighter, so
 * the spine sets the number.
 *
 * 200 is only ever REACHED by dragging toward the seven-day end: the derived
 * default lands on 238 or wider on every canvas from an 836px scrollport up
 * (see defaultWeekDays), so nothing gets narrower than the old 240 unless the
 * user asks for it.
 */
export const WEEK_GEOMETRY: Record<'schedule' | 'buckets', WeekGeometry> = {
  schedule: { gutterPx: 68, gapPx: 8, minColPx: MIN_CHANNEL_PX },
  buckets: { gutterPx: 0, gapPx: 28, minColPx: 200 },
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

/**
 * Move `days` along the raw ladder. `delta` is in *stops*: +1 is one wider.
 *
 * Only for the case where there is no canvas to measure against — see
 * stepWeekRung, which is what the control and the shortcuts actually use.
 */
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
 *
 * Only stops that FIT are candidates, and that exclusion is load-bearing rather
 * than tidy. Every clamped stop renders at the floor, so they all sit at the
 * same distance from the target — which means the tie-break above hands the
 * default to whichever clamped stop has the most days, always. That is how Week
 * × Buckets came to open on a "7 days" that showed five and scrolled: with a
 * 240px floor, four of its six stops were clamped to the same width, and the one
 * with the most days won a tie between four identical renders. Choosing to
 * scroll is fine; being handed a scroll by an arithmetic tie is not.
 */
export function defaultWeekDays(viewportPx: number, geo: WeekGeometry): number {
  const fitting = WEEK_DAY_STOPS.filter((days) => fitsWeekDays(days, viewportPx, geo));
  // Nothing fits — a canvas too narrow for even two columns at the floor (both
  // week views on a laptop with the sidebar and the item panel open). Every stop
  // is then the floor, so they are pixel-identical renders and only the label
  // differs; "the whole week" is the honest one of those, and it is what both
  // views did before this control existed.
  if (fitting.length === 0) return MAX_WEEK_DAYS;

  const deltas = fitting.map((days) => ({
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
 * stepWeekRung against the last measured canvas — the shortcuts' entry point.
 *
 * Falls back to a raw stop step when nothing has measured, which cannot happen
 * from the shortcuts (they are gated on a week view with columns being mounted,
 * and that view measures on layout) but is the answer that keeps a step a step.
 */
export function stepWeekDaysFromLastCanvas(
  stored: number | null | undefined,
  delta: number
): number {
  const from = resolveWeekDaysFromLastCanvas(stored);
  if (!lastCanvas) return stepWeekDays(from, delta);
  return stepWeekRung(from, delta, lastCanvas.viewportPx, lastCanvas.geo);
}

/**
 * How many flex gaps a row of N day columns pays for.
 *
 * A gap sits BETWEEN children, so the count is boxes − 1 — and schedule has one
 * extra box, its hour gutter. `gutterPx: 0` is exactly the structural fact that a
 * layout has no gutter child, which is why it can stand in for the box count.
 *
 * Buckets charged N gaps for its N children until this was pulled out, and the
 * 28px it discarded made every stop ~4px narrower than the canvas allowed. Small,
 * but it also made `fits` pessimistic on the stop where those 4px decide it, in a
 * module whose whole promise is "this fits".
 */
function weekGapCount(days: number, geo: WeekGeometry): number {
  return geo.gutterPx > 0 ? days : days - 1;
}

/** The pixel field N columns divide between them, gaps and padding paid. */
function weekColumnField(days: number, viewportPx: number, geo: WeekGeometry): number {
  return viewportPx - 2 * CANVAS_PAD_PX - geo.gutterPx - weekGapCount(days, geo) * geo.gapPx;
}

/**
 * Whether N columns genuinely fit this canvas, i.e. whether the arithmetic
 * clears the layout's floor without being clamped up to it.
 */
function fitsWeekDays(days: number, viewportPx: number, geo: WeekGeometry): boolean {
  return Math.floor(weekColumnField(days, viewportPx, geo) / days) >= geo.minColPx;
}

/**
 * The pixel width of one day column at `days` days across a `viewportPx` canvas.
 *
 * Fitting N columns beside the gutter means the row's children are
 * `[gutter, col × N]` — N + 1 boxes, so N gaps — inside the container's content
 * box. Buckets has no gutter, so N boxes and N − 1 gaps (see weekGapCount).
 * Solving for the column:
 *
 *     colPx = (viewportPx - 2·pad - gutter - gaps·gap) / N
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
  const raw = Math.floor(weekColumnField(n, viewportPx, geo) / n);
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
  return WEEK_DAY_STOPS.map((days) => ({
    days,
    colPx: weekColumnPx(days, viewportPx, geo),
    fits: fitsWeekDays(days, viewportPx, geo),
  }));
}

/**
 * The positions the control actually offers on this canvas: one per DISTINCT
 * column width.
 *
 * The stops are day counts, but two of them can resolve to the same width — every
 * clamped stop renders at the floor, and on a wide enough canvas the two widest
 * both hit MAX_COL_PX. Those are not two settings. Both week views always render
 * all seven day columns (the day count only sets their width), so stops that
 * agree on the width are pixel-identical in every respect except the number
 * stored, and a control whose readout is a WIDTH has nothing to say about the
 * difference. Offering them as separate notches is what made the slider feel
 * broken: on a 13" canvas four of the six did nothing.
 *
 * A collapsed run keeps its MOST days. That only ever matters for the floor rung,
 * where "as many days as physically fit" is the honest promise and is what both
 * views rendered before this control existed.
 *
 * Narrowest first, so a rising index is a widening column — the direction the
 * slider travels.
 */
export function weekRungs(viewportPx: number, geo: WeekGeometry): WeekStop[] {
  const rungs: WeekStop[] = [];
  // WEEK_DAY_STOPS runs most days first, so the first of each run has the most.
  for (const stop of weekStops(viewportPx, geo)) {
    if (rungs[rungs.length - 1]?.colPx !== stop.colPx) rungs.push(stop);
  }
  return rungs;
}

/**
 * Where `days` sits on this canvas's rung ladder.
 *
 * Matched on the resolved WIDTH rather than on the day count, because a stored
 * count need not be a rung: choose five days on a wide canvas, then shrink the
 * window until five clamps to the floor, and the rung representing that width is
 * labelled seven. The width is what both agree on, and it is what the control
 * displays.
 */
export function weekRungIndex(days: number, viewportPx: number, geo: WeekGeometry): number {
  const colPx = weekColumnPx(days, viewportPx, geo);
  const rungs = weekRungs(viewportPx, geo);
  const exact = rungs.findIndex((r) => r.colPx === colPx);
  if (exact !== -1) return exact;
  // Unreachable via weekColumnPx, which is where every colPx in play comes from.
  // Kept because the alternative to a nearest match is a -1 that would silently
  // park the thumb at the narrow end.
  let best = 0;
  for (let i = 1; i < rungs.length; i++) {
    if (Math.abs(rungs[i].colPx - colPx) < Math.abs(rungs[best].colPx - colPx)) best = i;
  }
  return best;
}

/**
 * Move along the RUNG ladder — one step is one visible change of width.
 * `delta` is +1 for wider, matching stepWeekDays.
 *
 * Returns the day count to store, since that is still what persists: a width
 * would stop meaning the same thing the moment the canvas resized under it (open
 * the item panel and "260px" is suddenly four and a half columns, where "five
 * days" is still five). The width is what the control SHOWS; the day count is
 * what it remembers.
 */
export function stepWeekRung(
  days: unknown,
  delta: number,
  viewportPx: number,
  geo: WeekGeometry
): number {
  const rungs = weekRungs(viewportPx, geo);
  const from = weekRungIndex(clampWeekDays(days), viewportPx, geo);
  const to = Math.min(rungs.length - 1, Math.max(0, from + delta));
  return rungs[to].days;
}

/**
 * How many columns are actually visible, to one decimal — the truth behind the
 * label when a stop is clamped. Never below zero; the caller formats it.
 *
 * Solving `k·colPx + gaps·gap ≤ field` for k adds one gap back on a layout with
 * no gutter, where k boxes pay k − 1 gaps. With a gutter the row pays a gap for
 * the gutter too and the two cancel out.
 */
export function visibleDays(colPx: number, viewportPx: number, geo: WeekGeometry): number {
  const field = viewportPx - 2 * CANVAS_PAD_PX - geo.gutterPx;
  const freeGap = geo.gutterPx > 0 ? 0 : geo.gapPx;
  return Math.max(0, (field + freeGap) / (colPx + geo.gapPx));
}
