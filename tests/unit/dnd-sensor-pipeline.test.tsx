import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragPendingEvent } from '@dnd-kit/core';

/**
 * The sensor arbitration, end to end (lib/dnd/CONTRACT.md § Sensors).
 *
 * `dnd-sensors.test.ts` next door pins the PREDICATE — that
 * `NonTouchPointerSensor`'s activator returns false for a finger. This file
 * pins the CONSEQUENCE, which is the only thing the bug was ever about: that a
 * finger landing on a draggable reaches the TouchSensor's 250ms hold instead of
 * being claimed at 5px by the pointer sensor. Those are different properties.
 * A predicate test passes against a shell wired to the plain `PointerSensor`,
 * because the predicate it exercises is then no longer mounted anywhere — which
 * is exactly what a review found: reverting the one line in `app-shell.tsx`
 * left the unit file 9/9 green.
 *
 * So this mounts the shell's OWN `useShellSensors` in a real `DndContext` and
 * drives real events through it. Importing the hook rather than rebuilding the
 * `useSensors` call is the whole point: rebuilding it would test a copy.
 *
 * jsdom carries enough of the pipeline for this — it implements `PointerEvent`
 * and `TouchEvent` with their real fields, dnd-kit's listeners fire, and the
 * hold is a plain `setTimeout` that fake timers own. The assertions cost ~350ms
 * all told; what is not free is importing the shell's module graph, once, to get
 * at the hook.
 */

vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));

const { useShellSensors } = await import('@/components/shell/app-shell');

const onDragPending = vi.fn<(event: DragPendingEvent) => void>();
const onDragStart = vi.fn();

function Row() {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: 'row-1' });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} data-testid="row">
      Ship the thing
    </button>
  );
}

function Bucket() {
  const { setNodeRef } = useDroppable({ id: 'bucket' });
  return <div ref={setNodeRef} data-testid="bucket" />;
}

/** The app's sensors, nothing else — no store, no shell, no network. */
function Harness() {
  const sensors = useShellSensors();
  return (
    <DndContext sensors={sensors} onDragPending={onDragPending} onDragStart={onDragStart}>
      <Row />
      <Bucket />
    </DndContext>
  );
}

const row = () => screen.getByTestId('row');

/** A finger. `isPrimary`/`button` matter: upstream's gate reads both. */
const finger = (over: { clientX?: number; clientY?: number } = {}) => ({
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  clientX: 0,
  clientY: 0,
  ...over,
});

const mouse = (over: { clientX?: number; clientY?: number } = {}) => ({
  pointerType: 'mouse',
  isPrimary: true,
  button: 0,
  clientX: 0,
  clientY: 0,
  ...over,
});

const touchAt = (clientX: number, clientY: number) => ({
  touches: [{ clientX, clientY }],
  changedTouches: [{ clientX, clientY }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a finger on a draggable', () => {
  it('is not claimed by the pointer sensor', () => {
    // The bug, stated as a test: `pointerdown` fires for a finger too, and it
    // fires BEFORE `touchstart`. If the pointer sensor takes it, dnd-kit marks
    // the native event and sets activeRef, and the touchstart below lands on a
    // context that has already committed.
    fireEvent.pointerDown(row(), finger());

    expect(onDragPending).not.toHaveBeenCalled();
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('pends on the touchstart that follows, under the 250ms hold', () => {
    fireEvent.pointerDown(row(), finger());
    fireEvent.touchStart(row(), touchAt(0, 0));

    expect(onDragPending).toHaveBeenCalledTimes(1);
    // The delay in the pending event is the TouchSensor's own constraint, so
    // this also says WHICH sensor took the gesture.
    expect(onDragPending.mock.calls[0][0].constraint).toMatchObject({ delay: 250 });
    // Pending is not dragging: nothing has lifted yet, and the browser is still
    // free to scroll.
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('starts the drag only once the hold has elapsed', () => {
    fireEvent.pointerDown(row(), finger());
    fireEvent.touchStart(row(), touchAt(0, 0));

    act(() => vi.advanceTimersByTime(249));
    expect(onDragStart).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('lets a scroll win: a finger that travels past the tolerance never drags', () => {
    // 6px inside the hold — less than the slop of an ordinary flick, and the
    // exact travel that used to lift a row while the list scrolled under it.
    // A real finger emits BOTH moves, so this fires both: the pointermove is
    // the one a pointer sensor holding the gesture would drag on, the touchmove
    // is the one that cancels the pending hold.
    //
    // They go to different targets on purpose. TouchSensor keeps its move
    // listeners on the gesture's own target; PointerSensor is the one that
    // relocates them to the ownerDocument (its comment: pointer events stop
    // firing if the target unmounts mid-drag). Swapping the two here would make
    // this pass for the wrong reason.
    fireEvent.pointerDown(row(), finger());
    fireEvent.touchStart(row(), touchAt(0, 0));
    fireEvent.pointerMove(document, finger({ clientY: 6 }));
    fireEvent.touchMove(row(), touchAt(0, 6));

    act(() => vi.advanceTimersByTime(1000));
    expect(onDragStart).not.toHaveBeenCalled();
  });
});

describe('a mouse on the same draggable', () => {
  it('drags on distance alone, with no hold to wait out', () => {
    fireEvent.pointerDown(row(), mouse());
    // Strictly greater than 5 — dnd-kit compares the travelled distance with
    // `>`, so 5px itself is still a click, which is what keeps a jittery press
    // opening the edit dialog.
    fireEvent.pointerMove(document, mouse({ clientY: 5 }));
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerMove(document, mouse({ clientY: 6 }));
    expect(onDragStart).toHaveBeenCalledTimes(1);
    // No timer was advanced anywhere in this test — the drag started off travel
    // alone. dnd-kit reports a pending for a distance constraint too, so the
    // claim worth pinning is not "never pends" but "never waits": nothing the
    // mouse produced carried a hold to sit through.
    const holds = onDragPending.mock.calls.filter(([event]) => 'delay' in event.constraint);
    expect(holds).toHaveLength(0);
  });
});
