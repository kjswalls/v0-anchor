import { describe, it, expect } from 'vitest';
import { deriveGridRange, GRID_MIN_SPAN, type TimedEntry } from '@/components/views/day-schedule';

/** deriveGridRange only reads startMin + duration, so stub the rest. */
function entry(startMin: number, duration: number): TimedEntry {
  return { itemType: 'task', item: { id: 'x' } as never, startMin, duration };
}

describe('deriveGridRange', () => {
  it('falls back to 8am–7pm for an empty day', () => {
    expect(deriveGridRange([])).toEqual({ gridStartHour: 8, gridEndHour: 19 });
  });

  it('pads content by an hour of context on each side', () => {
    // 9:00–10:00 and 17:00–18:00 → 8..19 (span 11, no min-span growth needed)
    const r = deriveGridRange([entry(540, 60), entry(1020, 60)]);
    expect(r).toEqual({ gridStartHour: 8, gridEndHour: 19 });
  });

  it('grows a sparse day out to the minimum span', () => {
    // A single 2pm task would be a 3-row sliver; min-span widens it.
    const r = deriveGridRange([entry(840, 30)]);
    expect(r.gridEndHour - r.gridStartHour).toBe(GRID_MIN_SPAN);
    // The task (14:00) stays inside the window.
    expect(r.gridStartHour).toBeLessThanOrEqual(14);
    expect(r.gridEndHour).toBeGreaterThanOrEqual(15);
  });

  it('never runs past midnight or before hour 0', () => {
    const late = deriveGridRange([entry(1380, 60)]); // 23:00–24:00
    expect(late.gridEndHour).toBe(24);
    expect(late.gridStartHour).toBeGreaterThanOrEqual(0);

    const early = deriveGridRange([entry(0, 30)]); // 00:00–00:30
    expect(early.gridStartHour).toBe(0);
    expect(early.gridEndHour - early.gridStartHour).toBe(GRID_MIN_SPAN);
  });

  it('spans the full range when content is wide, letting fit-to-height compress', () => {
    // 6:00 and 22:00 → 5..24, a wide window (span 19).
    const r = deriveGridRange([entry(360, 60), entry(1320, 60)]);
    expect(r.gridStartHour).toBe(5);
    expect(r.gridEndHour).toBe(24);
  });
});
