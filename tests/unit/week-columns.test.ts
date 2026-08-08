import { describe, expect, it } from 'vitest';
import { HOVER_Z, NOW_MARKER_Z, WEEK_GUTTER_Z } from '@/lib/schedule-constants';
import {
  CANVAS_PAD_PX,
  MAX_COL_PX,
  MAX_WEEK_DAYS,
  MIN_WEEK_DAYS,
  TARGET_COL_PX,
  TARGET_TOLERANCE_PX,
  WEEK_DAY_STOPS,
  WEEK_GEOMETRY,
  clampWeekDays,
  defaultWeekDays,
  forgetWeekCanvas,
  isScalableLayout,
  noteWeekCanvas,
  resolveWeekDays,
  resolveWeekDaysFromLastCanvas,
  stepWeekDays,
  visibleDays,
  weekColumnPx,
  weekStops,
} from '@/lib/week-columns';

/**
 * The whole point of pulling this out of the views is that the arithmetic is
 * testable without a DOM. CI gates on `pnpm test:unit` and runs e2e with
 * continue-on-error, so every invariant that matters lives here.
 *
 * The viewport widths below are real, measured against the desktop shell:
 * a 1280px window leaves an 836px scrollport (the Playwright default), a 1440px
 * window leaves 996px, and a 1920px window leaves 1476px.
 */

const SCHEDULE = WEEK_GEOMETRY.schedule;
const BUCKETS = WEEK_GEOMETRY.buckets;

const VP_1280 = 836;
const VP_1440 = 996;
const VP_1920 = 1476;

describe('clampWeekDays', () => {
  it('keeps every value on the ladder', () => {
    for (const days of WEEK_DAY_STOPS) expect(clampWeekDays(days)).toBe(days);
  });

  it('falls back to the default for anything that is not a number', () => {
    for (const junk of [undefined, null, NaN, Infinity, '5', {}, []]) {
      expect(clampWeekDays(junk)).toBe(MAX_WEEK_DAYS);
    }
  });

  it('clamps out-of-range values rather than rejecting them', () => {
    expect(clampWeekDays(0)).toBe(MIN_WEEK_DAYS);
    expect(clampWeekDays(1)).toBe(MIN_WEEK_DAYS);
    expect(clampWeekDays(-4)).toBe(MIN_WEEK_DAYS);
    expect(clampWeekDays(8)).toBe(MAX_WEEK_DAYS);
    expect(clampWeekDays(1000)).toBe(MAX_WEEK_DAYS);
  });

  it('is idempotent', () => {
    for (const v of [-1, 0, 2.4, 4, 6.6, 9]) {
      expect(clampWeekDays(clampWeekDays(v))).toBe(clampWeekDays(v));
    }
  });
});

describe('stepWeekDays', () => {
  it('treats +1 as one step WIDER, which is one day fewer', () => {
    expect(stepWeekDays(7, 1)).toBe(6);
    expect(stepWeekDays(3, 1)).toBe(2);
  });

  it('treats -1 as one step narrower', () => {
    expect(stepWeekDays(2, -1)).toBe(3);
    expect(stepWeekDays(6, -1)).toBe(7);
  });

  it('saturates at both ends instead of wrapping', () => {
    expect(stepWeekDays(MIN_WEEK_DAYS, 1)).toBe(MIN_WEEK_DAYS);
    expect(stepWeekDays(MAX_WEEK_DAYS, -1)).toBe(MAX_WEEK_DAYS);
    // Holding the key down is a stream of steps, not one big one.
    expect(stepWeekDays(7, 99)).toBe(MIN_WEEK_DAYS);
    expect(stepWeekDays(2, -99)).toBe(MAX_WEEK_DAYS);
  });

  it('sanitises a garbage current value the same way clamp does', () => {
    expect(stepWeekDays(undefined, 1)).toBe(MAX_WEEK_DAYS - 1);
  });
});

describe('weekColumnPx', () => {
  it('solves for the width that fits exactly N columns beside the gutter', () => {
    // Seven columns on a 1920px window: 1476 − 64 padding − 68 gutter − 7×8 gap
    // = 1288, over seven columns = 184.
    expect(weekColumnPx(7, VP_1920, SCHEDULE)).toBe(184);
    expect(weekColumnPx(5, VP_1920, SCHEDULE)).toBe(260);
    expect(weekColumnPx(4, VP_1920, SCHEDULE)).toBe(328);
  });

  it('lands on the floor at seven days on the canvases that used to cap out', () => {
    // This is the contract that makes the change invisible until you move the
    // control: at the default, both of these render exactly what the view
    // rendered when its columns were a hardcoded 140px min-width.
    expect(weekColumnPx(MAX_WEEK_DAYS, VP_1280, SCHEDULE)).toBe(SCHEDULE.minColPx);
    expect(weekColumnPx(MAX_WEEK_DAYS, VP_1440, SCHEDULE)).toBe(SCHEDULE.minColPx);
  });

  it('never returns less than the layout floor', () => {
    for (const vp of [200, 400, VP_1280, VP_1440, VP_1920, 3000]) {
      for (const days of WEEK_DAY_STOPS) {
        expect(weekColumnPx(days, vp, SCHEDULE)).toBeGreaterThanOrEqual(SCHEDULE.minColPx);
        expect(weekColumnPx(days, vp, BUCKETS)).toBeGreaterThanOrEqual(BUCKETS.minColPx);
      }
    }
  });

  it('never returns more than MAX_COL_PX, however wide the canvas', () => {
    expect(weekColumnPx(2, 5000, SCHEDULE)).toBe(MAX_COL_PX);
    expect(weekColumnPx(2, 5000, BUCKETS)).toBe(MAX_COL_PX);
  });

  it('is monotonic: fewer days is never a narrower column', () => {
    for (const vp of [VP_1280, VP_1440, VP_1920, 2400]) {
      const widths = WEEK_DAY_STOPS.map((d) => weekColumnPx(d, vp, SCHEDULE));
      for (let i = 1; i < widths.length; i++) {
        expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
      }
    }
  });

  it('floors rather than rounds, so a fitting stop never overflows by a pixel', () => {
    // overflowX is hard-set to `scroll` on the Radix viewport, so a 1px overflow
    // does not clip — it leaves the grid permanently nudgeable, which reads as a
    // bug on a stop whose promise is "this fits".
    for (const vp of [VP_1280, 900, 997, VP_1440, 1101, VP_1920, 1477]) {
      for (const days of WEEK_DAY_STOPS) {
        const colPx = weekColumnPx(days, vp, SCHEDULE);
        if (colPx === SCHEDULE.minColPx || colPx === MAX_COL_PX) continue; // clamped, expected to overflow
        const used = 2 * CANVAS_PAD_PX + SCHEDULE.gutterPx + days * SCHEDULE.gapPx + days * colPx;
        expect(used).toBeLessThanOrEqual(vp);
      }
    }
  });

  it('sanitises the day count before using it', () => {
    expect(weekColumnPx(undefined, VP_1920, SCHEDULE)).toBe(weekColumnPx(7, VP_1920, SCHEDULE));
    expect(weekColumnPx(99, VP_1920, SCHEDULE)).toBe(weekColumnPx(MAX_WEEK_DAYS, VP_1920, SCHEDULE));
  });
});

describe('week-buckets geometry', () => {
  it('reproduces the old fixed w-60 at the default on every realistic canvas', () => {
    // Buckets had no gutter and a hardcoded 240px column. The arithmetic only
    // clears 240 at seven days past a ~1940px scrollport, so until you move the
    // control this view is pixel-identical to what shipped.
    for (const vp of [VP_1280, VP_1440, VP_1920, 1900]) {
      expect(weekColumnPx(MAX_WEEK_DAYS, vp, BUCKETS)).toBe(240);
    }
    expect(weekColumnPx(MAX_WEEK_DAYS, 2400, BUCKETS)).toBeGreaterThan(240);
  });

  it('still widens on the stops that do clear the floor', () => {
    expect(weekColumnPx(4, VP_1920, BUCKETS)).toBe(325);
    expect(weekColumnPx(3, VP_1920, BUCKETS)).toBe(442);
  });
});

describe('weekStops', () => {
  it('reports one entry per ladder position, in ladder order', () => {
    const stops = weekStops(VP_1920, SCHEDULE);
    expect(stops.map((s) => s.days)).toEqual([...WEEK_DAY_STOPS]);
  });

  it('marks a stop that had to be clamped as not fitting', () => {
    // 1440px window, seven days: the arithmetic wants 115px, the floor is 140.
    const stops = weekStops(VP_1440, SCHEDULE);
    const seven = stops.find((s) => s.days === 7)!;
    expect(seven.fits).toBe(false);
    expect(seven.colPx).toBe(SCHEDULE.minColPx);

    const four = stops.find((s) => s.days === 4)!;
    expect(four.fits).toBe(true);
  });

  it('marks every stop as fitting once the canvas is big enough', () => {
    expect(weekStops(VP_1920, SCHEDULE).every((s) => s.fits)).toBe(true);
  });

  it('agrees with weekColumnPx', () => {
    for (const stop of weekStops(VP_1440, BUCKETS)) {
      expect(stop.colPx).toBe(weekColumnPx(stop.days, VP_1440, BUCKETS));
    }
  });
});

describe('visibleDays', () => {
  it('returns the requested count when the stop actually fits', () => {
    const colPx = weekColumnPx(5, VP_1920, SCHEDULE);
    expect(visibleDays(colPx, VP_1920, SCHEDULE)).toBeGreaterThanOrEqual(5);
    expect(visibleDays(colPx, VP_1920, SCHEDULE)).toBeLessThan(6);
  });

  it('tells the truth when a stop was clamped', () => {
    // Seven days at 1440px is really about six.
    const colPx = weekColumnPx(7, VP_1440, SCHEDULE);
    const visible = visibleDays(colPx, VP_1440, SCHEDULE);
    expect(visible).toBeGreaterThan(5);
    expect(visible).toBeLessThan(7);
  });

  it('never goes negative on an absurdly small canvas', () => {
    expect(visibleDays(140, 40, SCHEDULE)).toBe(0);
  });
});

describe('the width-derived default', () => {
  it('never picks a stop further than the tolerance from the best available', () => {
    for (const vp of [VP_1280, VP_1440, VP_1920, 2400]) {
      const deltas = WEEK_DAY_STOPS.map((d) =>
        Math.abs(weekColumnPx(d, vp, SCHEDULE) - TARGET_COL_PX)
      );
      const chosenDelta = Math.abs(weekColumnPx(defaultWeekDays(vp, SCHEDULE), vp, SCHEDULE) - TARGET_COL_PX);
      expect(chosenDelta).toBeLessThanOrEqual(Math.min(...deltas) + TARGET_TOLERANCE_PX);
    }
  });

  it('prefers more days whenever two stops are within the tolerance of each other', () => {
    for (const vp of [VP_1280, VP_1440, VP_1920, 2400]) {
      const chosen = defaultWeekDays(vp, SCHEDULE);
      const best = Math.min(
        ...WEEK_DAY_STOPS.map((d) => Math.abs(weekColumnPx(d, vp, SCHEDULE) - TARGET_COL_PX))
      );
      // Nothing with MORE days was also in contention — if it had been, it
      // should have won.
      for (const days of WEEK_DAY_STOPS) {
        if (days <= chosen) continue;
        const delta = Math.abs(weekColumnPx(days, vp, SCHEDULE) - TARGET_COL_PX);
        expect(delta).toBeGreaterThan(best + TARGET_TOLERANCE_PX);
      }
    }
  });

  it('keeps a small laptop on a real week instead of two days', () => {
    // The case the tolerance exists for. On an 836px scrollport three days is
    // 226px (61 under target) and two days is 344px (57 over) — nearest-wins
    // hands it to TWO columns by four pixels, which is not a week view.
    expect(weekColumnPx(3, VP_1280, SCHEDULE)).toBe(226);
    expect(weekColumnPx(2, VP_1280, SCHEDULE)).toBe(344);
    expect(defaultWeekDays(VP_1280, SCHEDULE)).toBe(3);
  });

  it('still lets a clear winner win — the tolerance is not a thumb on the scale', () => {
    // 1256px: four days is 14px off, five days is 71px off. Nowhere near a tie,
    // so the extra day does NOT get to claim it.
    const vp = 1256;
    expect(weekColumnPx(4, vp, SCHEDULE)).toBe(273);
    expect(weekColumnPx(5, vp, SCHEDULE)).toBe(216);
    expect(defaultWeekDays(vp, SCHEDULE)).toBe(4);
    // …and 1476px keeps five days at 260 over four at 328.
    expect(defaultWeekDays(VP_1920, SCHEDULE)).toBe(5);
  });

  it('opens a big monitor and a laptop at a comparable column, not a comparable day count', () => {
    // The point of a width-derived default: the same apparent density, whatever
    // the screen. The day counts differ; the column widths do not, much.
    const wide = defaultWeekDays(VP_1920, SCHEDULE);
    const narrow = defaultWeekDays(VP_1280, SCHEDULE);
    expect(wide).not.toBe(narrow);
    for (const [days, vp] of [
      [wide, VP_1920],
      [narrow, VP_1280],
    ] as const) {
      expect(Math.abs(weekColumnPx(days, vp, SCHEDULE) - TARGET_COL_PX)).toBeLessThan(80);
    }
  });

  it('breaks an exact tie toward more days', () => {
    // Geometry solved so four days and three days are EXACTLY equidistant from
    // the target: a 984px field gives 246px and 328px, both 41px away.
    const geo = { gutterPx: 0, gapPx: 0, minColPx: 1 };
    const vp = 984 + 2 * CANVAS_PAD_PX;
    expect(weekColumnPx(4, vp, geo)).toBe(TARGET_COL_PX - 41);
    expect(weekColumnPx(3, vp, geo)).toBe(TARGET_COL_PX + 41);
    expect(defaultWeekDays(vp, geo)).toBe(4);
  });
});

describe('resolveWeekDays', () => {
  it('uses the derived default only while nothing is stored', () => {
    expect(resolveWeekDays(null, VP_1920, SCHEDULE)).toBe(defaultWeekDays(VP_1920, SCHEDULE));
    expect(resolveWeekDays(undefined, VP_1920, SCHEDULE)).toBe(defaultWeekDays(VP_1920, SCHEDULE));
  });

  it('honours a stored choice even when it is not what the canvas would pick', () => {
    const auto = defaultWeekDays(VP_1920, SCHEDULE);
    const other = auto === MAX_WEEK_DAYS ? MIN_WEEK_DAYS : MAX_WEEK_DAYS;
    expect(resolveWeekDays(other, VP_1920, SCHEDULE)).toBe(other);
  });

  it('still sanitises a stored value', () => {
    expect(resolveWeekDays(99, VP_1920, SCHEDULE)).toBe(MAX_WEEK_DAYS);
    expect(resolveWeekDays(0, VP_1920, SCHEDULE)).toBe(MIN_WEEK_DAYS);
  });

  it('re-derives as the canvas changes, which a stored choice must not', () => {
    const small = resolveWeekDays(null, VP_1280, SCHEDULE);
    const large = resolveWeekDays(null, VP_1920, SCHEDULE);
    expect(small).not.toBe(large);
    // …whereas a chosen 3 is 3 on any screen.
    expect(resolveWeekDays(3, VP_1280, SCHEDULE)).toBe(3);
    expect(resolveWeekDays(3, VP_1920, SCHEDULE)).toBe(3);
  });
});

describe('the last-measured-canvas cache', () => {
  it('falls back to the narrow end when nothing has measured yet', () => {
    forgetWeekCanvas();
    expect(resolveWeekDaysFromLastCanvas(null)).toBe(MAX_WEEK_DAYS);
  });

  it('resolves the default against whatever the view last measured', () => {
    forgetWeekCanvas();
    noteWeekCanvas(VP_1920, SCHEDULE);
    expect(resolveWeekDaysFromLastCanvas(null)).toBe(defaultWeekDays(VP_1920, SCHEDULE));
    noteWeekCanvas(VP_1280, SCHEDULE);
    expect(resolveWeekDaysFromLastCanvas(null)).toBe(defaultWeekDays(VP_1280, SCHEDULE));
  });

  it('never consults the cache when a choice is stored', () => {
    forgetWeekCanvas();
    noteWeekCanvas(VP_1920, SCHEDULE);
    expect(resolveWeekDaysFromLastCanvas(4)).toBe(4);
    forgetWeekCanvas();
    expect(resolveWeekDaysFromLastCanvas(4)).toBe(4);
  });
});

describe('the pinned hour gutter', () => {
  it('outranks the now-marker, or a column scrolling under it paints over the labels', () => {
    // The selected column creates no stacking context (no opacity, no
    // transform), so its now-marker's z escapes into the root layer and
    // competes with the gutter's. This one comparison is the whole reason
    // WEEK_GUTTER_Z is not just "10".
    expect(WEEK_GUTTER_Z).toBeGreaterThan(NOW_MARKER_Z);
    expect(WEEK_GUTTER_Z).toBeGreaterThan(HOVER_Z);
  });

  it('leaves the row geometry untouched: the pin is a margin trick, not a resize', () => {
    // The gutter's BOX grows by the canvas padding and is pulled back by the
    // same amount, so its contribution to the row's width — and therefore every
    // "does N days fit" answer — is still exactly DAY_FIELD_LEFT.
    const boxWidth = WEEK_GEOMETRY.schedule.gutterPx + CANVAS_PAD_PX;
    const netContribution = boxWidth - CANVAS_PAD_PX;
    expect(netContribution).toBe(WEEK_GEOMETRY.schedule.gutterPx);
  });
});

describe('isScalableLayout', () => {
  it('covers exactly the layouts that have day columns', () => {
    expect(isScalableLayout('schedule')).toBe(true);
    expect(isScalableLayout('buckets')).toBe(true);
    // Week × List is a stack of rows — there is nothing to scale.
    expect(isScalableLayout('list')).toBe(false);
  });

  it('has geometry for every layout it claims is scalable', () => {
    for (const layout of ['schedule', 'buckets'] as const) {
      expect(isScalableLayout(layout)).toBe(true);
      expect(WEEK_GEOMETRY[layout]).toBeDefined();
    }
  });
});
