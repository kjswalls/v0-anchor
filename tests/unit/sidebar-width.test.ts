import { describe, it, expect } from 'vitest';
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_CANVAS,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/sidebar-store';

/**
 * clampSidebarWidth is the only gate on the resizable sidebar's width, and it
 * is crossed from three directions that don't know about each other: the drag
 * handle (every pointermove), the persist `merge` (whatever localStorage holds,
 * including records an older build or a text editor wrote), and the keyboard
 * nudges. A width that escapes it either collapses the column to nothing or
 * squeezes <main> off the screen — both unrecoverable without devtools, since
 * the handle you'd grab to undo it has gone with the column.
 */
describe('clampSidebarWidth', () => {
  it('leaves an in-range width alone', () => {
    expect(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(500)).toBe(500);
  });

  it('bounds both ends', () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(-9000)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(99999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('rounds to whole pixels', () => {
    // Pointer deltas are fractional on a trackpad and on any fractional-DPI
    // display; the value goes on to be interpolated into a `px` string.
    expect(clampSidebarWidth(406.4)).toBe(406);
    expect(clampSidebarWidth(406.6)).toBe(407);
    expect(Number.isInteger(clampSidebarWidth(500.5))).toBe(true);
  });

  it('resolves garbage to the default rather than propagating it', () => {
    // The persist merge hands this whatever the JSON held. NaN would survive
    // Math.min/Math.max untouched and reach the stylesheet as `NaNpx`, which
    // computes to invalid and collapses the column.
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(undefined as unknown as number)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth('500' as unknown as number)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('reserves canvas when a viewport is supplied', () => {
    // 1400 leaves room for the full max; 1000 does not.
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH, 1400)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH, 1000)).toBe(1000 - SIDEBAR_MIN_CANVAS);
    // A width that already fits is untouched by the viewport ceiling.
    expect(clampSidebarWidth(400, 1000)).toBe(400);
  });

  it('keeps the minimum even on a window too small to honour the reserve', () => {
    // Below MIN + MIN_CANVAS the two demands conflict. The sidebar wins — a
    // ceiling under MIN would pin the column narrower than its floor and the
    // handle would refuse to move in either direction.
    expect(clampSidebarWidth(600, 700)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH, 400)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('ignores a viewport it cannot use', () => {
    // window.innerWidth is 0 in a detached/hidden frame; that must not shrink
    // the ceiling to nothing.
    expect(clampSidebarWidth(600, Number.NaN)).toBe(600);
    expect(clampSidebarWidth(600, undefined)).toBe(600);
  });

  it('agrees with app/globals.css on the pre-hydration default', () => {
    // The stylesheet declares --sidebar-w: 406px for the frame before the store
    // rehydrates. If this constant moves, that literal has to move with it.
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(406);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
  });
});
