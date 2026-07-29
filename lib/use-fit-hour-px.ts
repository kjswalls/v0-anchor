'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { HOUR_PX } from '@/lib/schedule-constants';

/**
 * Adaptive hour height for the schedule grids. Shrinks each hour row so the
 * whole day's grid fits the ScrollArea viewport, but never grows past HOUR_PX —
 * so a day that already fits renders pixel-identical to before, and only a day
 * that would otherwise scroll gets compressed (down to MIN_HOUR_PX, below which
 * it scrolls rather than becoming illegible).
 *
 * The math is one-directional: available height depends only on the chrome
 * ABOVE the grid (Anytime strip + paddings), which never depends on hourPx, so
 * there's no measure -> resize -> measure loop. Attach `anchorRef` to the top of
 * the hour-rows region; the hook walks up to the Radix viewport to measure.
 *
 * `freeze` holds the current hourPx (skips re-measuring) — used while a block is
 * being drag-resized so widening the visible range doesn't rescale the grid
 * mid-gesture (which would make the dragged edge drift off the cursor).
 */

const MIN_HOUR_PX = 40;
const BOTTOM_RESERVE = 24; // breathing room kept below the grid

export function useFitHourPx(rowCount: number, freeze = false) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [hourPx, setHourPx] = useState(HOUR_PX);
  const freezeRef = useRef(freeze);
  // Latest-ref sync for `freeze`. It lives in a ref (not a `measure` dep) so a
  // freeze toggle doesn't tear down and re-create the ResizeObserver mid-drag.
  // Assigning during render trips react-hooks/refs, so it syncs in a LAYOUT
  // effect declared ABOVE the measure effect: React runs effects in declaration
  // order within a commit, and ResizeObserver callbacks are always async, so
  // the ref is guaranteed current before any measure() call can read it. The
  // useRef seed keeps the first render correct.
  useLayoutEffect(() => {
    freezeRef.current = freeze;
  }, [freeze]);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (freezeRef.current || !anchor || rowCount <= 0) return;
    const viewport = anchor.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport || !viewport.clientHeight) return;
    // Anchor top relative to the scroll CONTENT (scroll-independent), so the
    // measurement holds even if the grid is currently scrolled.
    const anchorTop =
      anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    const available = viewport.clientHeight - anchorTop - BOTTOM_RESERVE;
    const next = Math.max(MIN_HOUR_PX, Math.min(HOUR_PX, Math.floor(available / rowCount)));
    setHourPx((prev) => (prev === next ? prev : next));
  }, [rowCount]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const viewport = anchor.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) return;
    measure();
    // Observe the viewport (window/pane resize) and its content wrapper (Anytime
    // strip growing/shrinking pushes the anchor without changing viewport size).
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  return { hourPx, anchorRef };
}

/**
 * Keeps the grid visually anchored when `gridStartHour` changes while `active`
 * (a resize is in progress). Expanding the window to the full day at resize-start
 * adds rows above the content, which would shove every block — and the edge under
 * the cursor — downward. Counter-scrolling by the exact shift (added-hours ×
 * hourPx) before paint keeps the block where it was; the newly-added earlier rows
 * sit just above the fold, revealed by auto-scroll only when you drag up to them.
 */
export function useResizeScrollCompensation(
  gridStartHour: number,
  hourPx: number,
  active: boolean,
  anchorRef: RefObject<HTMLDivElement | null>
) {
  const prevStartRef = useRef(gridStartHour);
  useLayoutEffect(() => {
    const prevStart = prevStartRef.current;
    prevStartRef.current = gridStartHour;
    if (!active || prevStart === gridStartHour) return;
    const viewport = anchorRef.current?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (viewport) viewport.scrollTop += (prevStart - gridStartHour) * hourPx;
  }, [gridStartHour, hourPx, active, anchorRef]);
}
