'use client';

import { useLayoutEffect, useState } from 'react';
import { ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useViewStore } from '@/lib/view-store';
import {
  WEEK_DAY_STOPS,
  WEEK_GEOMETRY,
  clampWeekDays,
  isScalableLayout,
  resolveWeekDays,
  visibleDays,
  weekStops,
  type ScalableLayout,
} from '@/lib/week-columns';
import { cn } from '@/lib/utils';

/**
 * The week scale — how wide a day column is, as a notched slider.
 *
 * Lives on the canvas header row beside the header capsule rather than inside
 * it: the capsule's pill answers "what am I looking at" (type · layout · scope)
 * and is already at its horizontal budget, while this answers "how big", which
 * is a different question and one that only exists in two of the six views.
 * Sitting at the far end of the same `canvas-container` row puts it on the
 * right edge of the grid it scales, at every window width and in both the
 * capped and full-width canvases.
 *
 * The slider's value is an INDEX INTO THE LADDER, not a day count, so that
 * dragging right means wider — the ladder runs seven days (narrowest columns)
 * to two (widest). The stored preference is the day count; see lib/week-columns.
 *
 * Mounted unconditionally and self-hiding, so the header row's layout doesn't
 * have to know about it.
 */

const STOP_COUNT = WEEK_DAY_STOPS.length;

/** Half the slider thumb (`size-3.5`). The thumb's travel is inset by this much
 *  at each end, so a tick rail that spans the full track drifts out of
 *  registration with it — the rail is inset to match. */
const THUMB_HALF_PX = 7;

/** The step buttons, sized off the capsule's ghost icon buttons. */
const STEP_BUTTON =
  'inline-flex h-7 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25';

function daysLabel(days: number) {
  return days === 1 ? '1 day' : `${days} days`;
}

export function WeekScale({ className }: { className?: string }) {
  const scope = useViewStore((s) => s.scope);
  const layout = useViewStore((s) => s.layout);
  const days = useViewStore((s) => s.weekDaysVisible);
  const setWeekDaysVisible = useViewStore((s) => s.setWeekDaysVisible);

  const visible = scope === 'week' && isScalableLayout(layout);

  // The readout needs the same scrollport width the views derive from, and this
  // control lives outside their <ScrollArea> — so it finds the viewport by role
  // rather than by ref. Measuring <main> instead would be wrong by the panel's
  // own chrome. Null until a week view has mounted one, which is also every
  // case where there is nothing to report.
  const [viewportPx, setViewportPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!visible) return;
    // Re-queried on every scope/layout change because the week views mount a
    // fresh <ScrollArea> each time. A stale width is never cleared on the way
    // out — the control is unmounted then anyway, and re-measuring on the way
    // back in is one layout pass.
    const viewport = document.querySelector<HTMLElement>(
      '[data-tour="timeline"] [data-slot="scroll-area-viewport"]'
    );
    if (!viewport) return;
    const measure = () => {
      const w = viewport.clientWidth;
      if (w > 0) setViewportPx((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [visible, layout]);

  if (!visible) return null;

  const scalable = layout as ScalableLayout;
  const geo = WEEK_GEOMETRY[scalable];
  const ready = viewportPx !== null;
  const stops = viewportPx === null ? null : weekStops(viewportPx, geo);
  // Until a week view has measured, fall back to the ladder's narrow end rather
  // than guessing a default that the very next frame would contradict.
  const current =
    viewportPx === null ? clampWeekDays(days) : resolveWeekDays(days, viewportPx, geo);
  const index = WEEK_DAY_STOPS.indexOf(current as (typeof WEEK_DAY_STOPS)[number]);
  const stop = stops?.[index];

  const setIndex = (next: number) => {
    const clamped = Math.min(STOP_COUNT - 1, Math.max(0, next));
    setWeekDaysVisible(WEEK_DAY_STOPS[clamped]);
  };

  // The day count only. The pixel width is what the setting RESOLVES to, not
  // what it means, and it changes under you when the canvas resizes — so it
  // belongs in the hover explanation, where it can be given its context, rather
  // than in a number that appears to be the value you set.
  const readout = daysLabel(current);

  const explain =
    stop && viewportPx !== null
      ? stop.fits
        ? `${daysLabel(stop.days)} across the canvas — ${stop.colPx}px per column`
        : `${stop.colPx}px is as narrow as a column goes — about ${Math.floor(
            visibleDays(stop.colPx, viewportPx, geo)
          )} of ${stop.days} days fit, and the grid scrolls`
      : undefined;

  return (
    <div
      data-testid="week-scale"
      data-days={current}
      data-col-px={stop?.colPx ?? ''}
      // Inert for the sub-frame before the first measurement. Until then the
      // resolved day count is a fallback rather than the derived default, so a
      // step taken in that window would move from the wrong rung — and land
      // somewhere the user did not ask for. Nobody can act inside one frame;
      // this exists so nothing else has to reason about the null case.
      data-measured={viewportPx === null ? 'false' : 'true'}
      className={cn(
        // Same family as the header capsule: gray tray, elevated bar shadow,
        // r10 — one row instead of two, because it carries one control.
        'inline-flex flex-shrink-0 items-center gap-0.5 rounded-[10px] bg-surface-3 px-2 py-1.5 shadow-[var(--shadow-elev-bar)]',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIndex(index - 1)}
        disabled={!ready || index<= 0}
        aria-label="Narrower day columns"
        title="Narrower columns (⌘−)"
        className={STEP_BUTTON}
      >
        <ChevronsRightLeft className="h-3.5 w-3.5" />
      </button>

      {/* The slider is centred in the row, and the ticks live INSIDE its own
          14px band rather than in a rail below it — a rail underneath is what
          used to push the whole control off-centre. The notches sit just under
          the track, still within the thumb's height, so they cost no layout. */}
      <div className="relative flex h-7 w-[116px] items-center">
        <Slider
          min={0}
          max={STOP_COUNT - 1}
          step={1}
          value={[index]}
          onValueChange={([v]) => setIndex(v)}
          disabled={!ready}
          aria-label="Day column width"
          aria-valuetext={readout}
          className={cn(
            // Above the ticks, so the thumb covers the notch it is parked on —
            // which is what reads as the knob sitting IN a detent rather than
            // beside one.
            'relative z-10 w-full',
            // Finer than the shadcn default: this is view chrome sitting next to
            // hairline borders, and a 6px track with a 16px knob read as a form
            // field parked on the canvas.
            '[&_[data-slot=slider-track]]:h-1',
            '[&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:shadow-[var(--shadow-elev-sm)]'
          )}
        />
        {/* A sibling of the Slider, not a child of its Track — the Track is
            `overflow-hidden` (it has to clip the Range), so anything inside is
            cut off at the ends. Inset by half a thumb because the thumb's travel
            is inset by that much at each end; spanning the full track instead
            puts every tick out of registration with the thumb it is supposed to
            mark, by up to 7px at the ends. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 mt-[3px] h-[3px]"
          style={{ left: THUMB_HALF_PX, right: THUMB_HALF_PX }}
        >
          {WEEK_DAY_STOPS.map((d, i) => (
            <span
              key={d}
              style={{ left: `${(i / (STOP_COUNT - 1)) * 100}%` }}
              className="absolute top-0 h-[3px] w-px -translate-x-1/2 rounded-full bg-muted-foreground/35"
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIndex(index + 1)}
        disabled={!ready || index>= STOP_COUNT - 1}
        aria-label="Wider day columns"
        title="Wider columns (⌘+)"
        className={STEP_BUTTON}
      >
        <ChevronsLeftRight className="h-3.5 w-3.5" />
      </button>

      {/* Fixed width, and never wrapping. The control is right-aligned in the
          header row, so a readout that resized with its value would walk the
          whole capsule left and right as you drag. */}
      <span
        title={explain}
        className="ml-1 w-[46px] shrink-0 whitespace-nowrap text-right font-num text-2xs tabular-nums text-muted-foreground"
      >
        {readout}
      </span>
    </div>
  );
}
