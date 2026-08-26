import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

/**
 * Who is allowed to start a schedule resize (lib/dnd/CONTRACT.md § Sensors).
 *
 * The handle's hit zone is 12px tall — a target no fingertip can aim at, but one
 * a scrolling thumb crosses constantly, and every crossing used to capture the
 * pointer and commit a new duration on release. So `onResizeDown` declines
 * touch pointers, and mouse/pen keep the same element.
 *
 * The two existing tests that press a handle (`schedule-lanes-render.test.tsx`,
 * `schedule-block-overlap.test.tsx`) fire `pointerDown` with no `pointerType` at
 * all, so they pass identically with the guard deleted — a review found it could
 * be removed with CI staying green. These press the handle as each input type
 * actually presses it.
 *
 * The blank case is here deliberately and is not padding: an unlabelled
 * `pointerType` must keep reading as NON-touch, because that is the pointer
 * every other resize test in the suite sends, and because erring the other way
 * would disable resize outright on any engine that leaves the field empty.
 */

vi.mock('@/lib/planner-store', () => ({
  usePlannerStore: () => ({
    getProjectColor: () => 'var(--accent-3)',
    getHabitGroupColor: () => 'var(--accent-2)',
    selectedDate: new Date('2026-07-29T12:00:00Z'),
    userTimezone: 'UTC',
    toggleTaskStatus: vi.fn(),
    updateTask: vi.fn(),
    updateHabit: vi.fn(),
  }),
}));
vi.mock('@/lib/use-time-format', () => ({ useTimeFormat: () => 'h:mm a' }));
vi.mock('@/lib/ui-store', () => ({ openEditFor: vi.fn() }));

const { ScheduleBlock } = await import('@/components/views/day-schedule');
const { useScheduleResizeStore } = await import('@/lib/schedule-resize-store');
type TimedEntry = import('@/components/views/day-schedule').TimedEntry;

const HOUR = 52;
const GRID = 9 * 60;

const entry: TimedEntry = {
  itemType: 'task',
  item: {
    id: 'gym',
    title: 'Go to the gym',
    type: 'task',
    status: 'pending',
    startTime: '10:00',
    duration: 60,
    repeatFrequency: 'none',
    completedDates: [],
  } as never,
  startMin: 10 * 60,
  duration: 60,
};

function paint() {
  const { container } = render(
    <DndContext>
      <ScheduleBlock entry={entry} gridStartMin={GRID} hourPx={HOUR} fieldWidth={900} />
    </DndContext>
  );
  return {
    handle: (edge: 'start' | 'duration') =>
      container.querySelector(`[aria-label="Resize ${edge}"]`) as HTMLElement,
  };
}

const resizing = () => useScheduleResizeStore.getState().resizing;

let capture: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  useScheduleResizeStore.setState({ resizing: false });
  // jsdom's stub is installed in tests/unit/setup.ts; spying keeps it a no-op
  // and records whether the gesture was taken over.
  capture = vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  capture.mockRestore();
});

describe('a finger on a resize handle', () => {
  it('starts nothing, on either edge', () => {
    const { handle } = paint();

    for (const edge of ['start', 'duration'] as const) {
      fireEvent.pointerDown(handle(edge), { pointerType: 'touch', clientY: 100, pointerId: 1 });
      expect(resizing()).toBe(false);
      expect(capture).not.toHaveBeenCalled();
    }
  });

  it('leaves the gesture to the browser, so the grid can still scroll', () => {
    const { handle } = paint();

    // `fireEvent` reports the dispatch result: false once anything has called
    // preventDefault. A handler that swallowed the touch here would take the
    // scroll away whatever else it did or didn't do.
    const delivered = fireEvent.pointerDown(handle('duration'), {
      pointerType: 'touch',
      clientY: 100,
      pointerId: 1,
    });

    expect(delivered).toBe(true);
  });
});

describe('a mouse on the same handle', () => {
  it('starts the resize and captures the pointer', () => {
    const { handle } = paint();

    const delivered = fireEvent.pointerDown(handle('duration'), {
      pointerType: 'mouse',
      clientY: 100,
      pointerId: 1,
    });

    expect(resizing()).toBe(true);
    expect(capture).toHaveBeenCalledWith(1);
    // The gesture IS claimed on this path — preventDefault is what stops the
    // press from turning into a text selection or a click on the block.
    expect(delivered).toBe(false);
  });
});

describe('an unlabelled pointerType', () => {
  it('still resizes — blank is read as not-a-finger', () => {
    const { handle } = paint();

    fireEvent.pointerDown(handle('duration'), { clientY: 100, pointerId: 1 });

    expect(resizing()).toBe(true);
  });
});
