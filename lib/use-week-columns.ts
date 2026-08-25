'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDragStore } from './drag-store';
import { useViewStore } from './view-store';
import {
  MAX_WEEK_DAYS,
  WEEK_GEOMETRY,
  noteWeekCanvas,
  resolveWeekDays,
  weekColumnPx,
  type ScalableLayout,
} from './week-columns';

/**
 * The measured half of the week scale control: turns the stored day count into
 * the pixel width a day column actually renders at, on this canvas, right now —
 * and owns the ⌘-wheel gesture, since both need the same scrollport.
 *
 * Attach the returned `ref` to any element inside the view's <ScrollArea>; the
 * hook walks up to the Radix viewport from there.
 *
 * Observing the VIEWPORT and nothing else is the load-bearing detail. Its
 * clientWidth comes from `size-full`, so it never depends on how wide the
 * columns are. Observing the content wrapper instead — as lib/use-fit-hour-px.ts
 * does, correctly, for a *height* the columns cannot affect — would close a
 * measure → resize → measure loop the instant a column width changed.
 *
 * `viewportPx` is null before the first measurement; the column falls back to
 * its floor width rather than a guess, so the first paint is never wider than
 * the truth.
 */

/**
 * Wheel delta that counts as one notch. A mouse wheel click is ~100 deltaY but a
 * trackpad emits a stream of ~1-3, so stepping per event would fly through the
 * whole ladder on a single two-finger flick.
 */
const WHEEL_STEP_DELTA = 60;

export function useWeekColumns(layout: ScalableLayout) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewportPx, setViewportPx] = useState<number | null>(null);
  const [scrolledX, setScrolledX] = useState(false);
  const days = useViewStore((s) => s.weekDaysVisible);
  const stepWeekDaysVisible = useViewStore((s) => s.stepWeekDaysVisible);

  useLayoutEffect(() => {
    const viewport = ref.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    if (!viewport) return;
    const measure = () => {
      const w = viewport.clientWidth;
      if (w > 0) setViewportPx((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  /*
   * Whether the grid is scrolled off its left edge — the pinned hour gutter
   * raises its edge treatment only then, so nothing is drawn at rest.
   *
   * Passive, and coerced to a boolean before it reaches state: this fires on
   * every frame of a horizontal scroll, and setting a pixel number here would
   * re-render seven columns and ~170 droppables per frame. As a boolean it
   * changes at most twice per gesture.
   */
  useEffect(() => {
    const viewport = ref.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    if (!viewport) return;
    const onScroll = () => setScrolledX(viewport.scrollLeft > 0);
    onScroll();
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  /*
   * ⌘/Ctrl + wheel steps the scale, the way it zooms a canvas everywhere else.
   * A trackpad pinch arrives as exactly this event, so pinch comes free.
   *
   * `{ passive: false }` is mandatory — without it preventDefault is ignored and
   * the browser zooms the whole page, so the gesture would fight itself. And the
   * handler bails while a drag is live: dnd-kit measures droppable rects with
   * MeasuringStrategy.Always but an *Optimized* frequency, which re-measures
   * only when the container set changes, so resizing every column mid-drag would
   * leave all ~175 drop targets sitting where they used to be.
   */
  const accRef = useRef(0);
  useEffect(() => {
    const viewport = ref.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // Read through getState, not a subscription: a drag starting must not tear
      // down and re-register a non-passive listener mid-gesture.
      if (useDragStore.getState().activeId) return;
      event.preventDefault();

      accRef.current += event.deltaY;
      // Scrolling up is "zoom in" everywhere else, and zooming in means wider
      // columns — so up is one stop wider.
      while (accRef.current <= -WHEEL_STEP_DELTA) {
        accRef.current += WHEEL_STEP_DELTA;
        stepWeekDaysVisible(1);
      }
      while (accRef.current >= WHEEL_STEP_DELTA) {
        accRef.current -= WHEEL_STEP_DELTA;
        stepWeekDaysVisible(-1);
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      accRef.current = 0;
    };
  }, [stepWeekDaysVisible]);

  const geo = WEEK_GEOMETRY[layout];

  // Hand the measurement to the module that owns the concept, so the keyboard
  // commands — which fire from a keydown handler with no DOM to measure — can
  // resolve the same default this render just used. Safe during render: it
  // writes to a plain module variable, not to React state.
  if (viewportPx !== null) noteWeekCanvas(viewportPx, geo);

  const resolvedDays = viewportPx === null ? MAX_WEEK_DAYS : resolveWeekDays(days, viewportPx, geo);
  const colPx = viewportPx === null ? geo.minColPx : weekColumnPx(resolvedDays, viewportPx, geo);

  return { colPx, viewportPx, days: resolvedDays, isAuto: days == null, ref, geo, scrolledX };
}
