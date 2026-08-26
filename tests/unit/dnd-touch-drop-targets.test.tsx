import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { DragStartEvent } from '@dnd-kit/core';

/**
 * The one drop target a finger is not offered (lib/dnd/CONTRACT.md § Input).
 *
 * `scheduled:{bucket}:{before|after}:{ref}` is an 8px sliver between two timed
 * rows. Mechanically it is a MOVE like every other drop — `inferDropTime`
 * resolves it as ±30 min from the reference row's own time — so it is not the
 * drag-to-reorder `dnd-no-reorder.test.ts` forbids, and by the letter of that
 * ticket's scope it survived. Kirby then looked at it and removed it for touch
 * anyway: unaimable with a thumb, and the target sitting directly in the scroll
 * path between rows, so it is the one most likely to eat a gesture that meant
 * to scroll. The accepted cost: on a phone there is no "put this just before
 * that one" — you move the row to the bucket and set a time.
 *
 * ## What has to be true, and why each half needs its own test
 *
 * 1. The rule exists once (`OFFERED_TO`, lib/dnd/drop-targets.ts).
 * 2. The VIEW does not mount the sliver for a touch drag. This is the half that
 *    changes behaviour: with no node there is no rect, `closestCenter` cannot
 *    pick it, and the finger's drop lands on the bucket instead — so the row
 *    still moves, untimed. A mount test is the only thing that can see it.
 * 3. `resolveDrop` refuses it too, as the backstop for a target that comes back.
 * 4. The SHELL actually feeds the real input type in. Without this one, a shell
 *    hard-coding `'pointer'` leaves 1–3 green and ships the sliver to phones —
 *    the exact "load-bearing claim no test held" this repo keeps getting burned
 *    by. Hence `beginDrag` is imported from app-shell rather than rebuilt.
 * 5. Nothing else moved: every OTHER target in the grammar still resolves for a
 *    finger, and every one still resolves for a cursor.
 */

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver;
  }
});

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  setItemCompletion: vi.fn(async () => {}),
  fetchRoutines: vi.fn(async () => []),
  fetchPrograms: vi.fn(async () => []),
  fetchGoals: vi.fn(async () => []),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));

import { DayBuckets } from '@/components/views/day-buckets';
import { beginDrag } from '@/components/shell/app-shell';
import { dragInputOf, type DragInput } from '@/lib/dnd/sensors';
import { dropTargetKind, isDropTargetOffered, OFFERED_TO } from '@/lib/dnd/drop-targets';
import { resolveDrop, type DropCommand, type DropContext } from '@/lib/dnd/handle-drag-end';
import { useDragStore } from '@/lib/drag-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';
import type { Habit, Task } from '@/lib/planner-types';

/* ------------------------------------------------------------------ *
 * 1. The rule, and the parse that feeds it
 * ------------------------------------------------------------------ */

/**
 * Every droppable ID pattern in CONTRACT.md § Droppable IDs — the same list
 * `dnd-no-reorder.test.ts` sweeps, for the same reason: it is the contract
 * restated, so a grammar entry that stops classifying shows up here.
 */
const EVERY_DROP_TARGET = [
  'scheduled:morning:before:task:t2',
  'scheduled:morning:after:habit:h2',
  'scheduled:afternoon:empty',
  'anytime',
  'morning',
  'afternoon',
  'evening',
  'unscheduled:evening',
  'week:2026-07-06:morning',
  'hour:9',
  'weekhour:2026-07-06:14',
  'week:2026-07-06:anytime',
  'projectblock:Work',
  'sidebar',
] as const;

const RELATIVE_TIME_TARGETS = [
  'scheduled:morning:before:task:t2',
  'scheduled:morning:after:habit:h2',
] as const;

describe('the offered-to table', () => {
  it('classifies every id in the grammar (an unclassified target would be offered to all)', () => {
    // `isDropTargetOffered` is permissive for an id it cannot parse, on purpose
    // — a new droppable must not vanish for half the users because nobody
    // updated a table. This is the check that keeps that safe: a new grammar
    // entry has to be classified HERE, not discovered in production.
    for (const target of EVERY_DROP_TARGET) {
      expect(dropTargetKind(target), target).not.toBeNull();
    }
  });

  it('withholds the relative-time sliver from touch and nothing else', () => {
    const withheld = Object.entries(OFFERED_TO)
      .filter(([, inputs]) => !inputs.includes('touch'))
      .map(([kind]) => kind);
    expect(withheld).toEqual(['relative-time']);
  });

  it('offers every kind to a cursor — desktop loses nothing', () => {
    for (const [kind, inputs] of Object.entries(OFFERED_TO)) {
      expect(inputs, kind).toContain('pointer');
    }
  });

  it('reads the sliver ids as relative-time and the empty tray as its own kind', () => {
    for (const target of RELATIVE_TIME_TARGETS) {
      expect(dropTargetKind(target)).toBe('relative-time');
    }
    // The labelled 40px "Drop here to schedule with time" tray is a different
    // target and stays: it is aimable, and it is not between two rows.
    expect(dropTargetKind('scheduled:afternoon:empty')).toBe('bucket-timed');
    expect(isDropTargetOffered('scheduled:afternoon:empty', 'touch')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Knowing which input is dragging
 * ------------------------------------------------------------------ */

/** What `NonTouchPointerSensor` hands dnd-kit as the activator event. */
const pointerActivator = (pointerType: string) =>
  ({ pointerType, isPrimary: true, button: 0 }) as unknown as Event;

/** What `TouchSensor` hands it: a touchstart, which has no `pointerType`. */
const touchActivator = () =>
  ({ touches: [{ clientX: 0, clientY: 0 }] }) as unknown as Event;

describe('dragInputOf — per gesture, never per device', () => {
  it('reads a finger from either shape a sensor can produce', () => {
    // The TouchSensor's touchstart carries no pointerType at all, so `touches`
    // is what has to answer. The pointer branch matters too: it keeps the answer
    // correct even if the sensor split above were reverted and a PointerEvent
    // with pointerType 'touch' started reaching drags again.
    expect(dragInputOf(touchActivator())).toBe('touch');
    expect(dragInputOf(pointerActivator('touch'))).toBe('touch');
  });

  it('reads mouse and pen as pointer — a touchscreen laptop keeps its sliver', () => {
    // The failure mode a media query has and this does not: `(pointer: coarse)`
    // on a hybrid laptop answers for the DEVICE, so the machine's mouse would
    // lose a target it can aim perfectly. This answers for the GESTURE.
    expect(dragInputOf(pointerActivator('mouse'))).toBe('pointer');
    expect(dragInputOf(pointerActivator('pen'))).toBe('pointer');
  });

  it('reads an unlabelled or missing activator as pointer, not as touch', () => {
    // Erring the other way would silently disable a desktop capability on any
    // engine that leaves the field blank — the same direction isTouchPointer errs.
    expect(dragInputOf(pointerActivator(''))).toBe('pointer');
    expect(dragInputOf(null)).toBe('pointer');
    expect(dragInputOf({} as Event)).toBe('pointer');
  });
});

describe('the shell records the real input type', () => {
  const dragStart = (activatorEvent: Event) =>
    ({ active: { id: 'row-1' }, activatorEvent }) as unknown as DragStartEvent;

  afterEach(() => useDragStore.getState().endDrag());

  it('puts touch in the drag store when a finger started the drag', () => {
    // The wiring test. Without it, a shell that recorded `'pointer'`
    // unconditionally — or dropped the second argument — would leave every
    // other assertion in this file green while phones kept the sliver.
    beginDrag(dragStart(touchActivator()));
    expect(useDragStore.getState()).toMatchObject({ activeId: 'row-1', input: 'touch' });
  });

  it('puts pointer in it when a mouse did', () => {
    beginDrag(dragStart(pointerActivator('mouse')));
    expect(useDragStore.getState()).toMatchObject({ activeId: 'row-1', input: 'pointer' });
  });

  it('clears both together when the drag ends', () => {
    beginDrag(dragStart(touchActivator()));
    useDragStore.getState().endDrag();
    // A stale `input` outliving `activeId` would decide the NEXT drag's targets.
    expect(useDragStore.getState()).toMatchObject({ activeId: null, input: null });
  });
});

/* ------------------------------------------------------------------ *
 * 3. resolveDrop — the backstop half
 * ------------------------------------------------------------------ */

function ctx(input: DragInput, overrides: Partial<DropContext> = {}): DropContext {
  return {
    itemType: 'task',
    input,
    selectedDate: new Date('2026-07-04T12:00:00Z'),
    userTimezone: 'UTC',
    draggedTaskProject: 'Work',
    getRefTime: () => '10:00',
    inferDropTime: () => '10:30',
    ...overrides,
  };
}

describe('resolveDrop refuses a withheld target', () => {
  it.each(RELATIVE_TIME_TARGETS)('a touch drop on %s resolves to nothing', (target) => {
    expect(resolveDrop('t1', target, ctx('touch'))).toBeNull();
    expect(resolveDrop('h1', target, ctx('touch', { itemType: 'habit' }))).toBeNull();
  });

  it.each(RELATIVE_TIME_TARGETS)('a mouse drop on %s still schedules a time', (target) => {
    // Desktop unchanged, stated positively: same command, same inferred time.
    expect(resolveDrop('t1', target, ctx('pointer'))).toEqual({
      kind: 'schedule-task',
      taskId: 't1',
      bucket: 'morning',
      time: '10:30',
      dateStr: '2026-07-04',
    });
    expect(resolveDrop('h1', target, ctx('pointer', { itemType: 'habit' }))).toEqual({
      kind: 'schedule-habit',
      habitId: 'h1',
      bucket: 'morning',
      time: '10:30',
    });
  });

  const OTHER_TARGETS = EVERY_DROP_TARGET.filter(
    (t) => !(RELATIVE_TIME_TARGETS as readonly string[]).includes(t)
  );

  it.each(OTHER_TARGETS)('%s is untouched for a finger — every other move still works', (target) => {
    // Row → bucket, row → day, row → hour slot, row → project block, braindump,
    // and the empty-bucket tray. All of these are moves Kirby explicitly kept on
    // mobile; this is the boundary of the change, asserted rather than assumed.
    const commands = [
      resolveDrop('t1', target, ctx('touch')),
      resolveDrop('h1', target, ctx('touch', { itemType: 'habit' })),
    ].filter((c): c is DropCommand => c !== null);

    expect(commands.length).toBeGreaterThan(0);
    // And identical to what a cursor gets — the gate subtracts one target, it
    // does not rewrite the outcome of any other.
    expect(resolveDrop('t1', target, ctx('touch'))).toEqual(
      resolveDrop('t1', target, ctx('pointer'))
    );
  });
});

/* ------------------------------------------------------------------ *
 * 4. The mount half — the one that changes behaviour
 * ------------------------------------------------------------------ */

const TZ = 'UTC';
const DATE_STR = '2026-08-13';
const DATE = new Date('2026-08-13T12:00:00Z');

const task = (over: Partial<Task>): Task =>
  ({
    status: 'pending',
    isScheduled: true,
    order: 0,
    startDate: DATE_STR,
    timeBucket: 'morning',
    ...over,
  }) as Task;

/** Two TIMED rows in Morning, so the card renders slivers before/after them. */
const tasks: Task[] = [
  task({ id: 'untimed', title: 'Untimed thing' }),
  task({ id: 'nine', title: 'Nine', startTime: '09:00' }),
  task({ id: 'eleven', title: 'Eleven', startTime: '11:00' }),
];
const habits: Habit[] = [];

function seed(input: DragInput) {
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: TZ,
    selectedDate: DATE,
    navDirection: null,
    tasks,
    habits,
    items: [...tasks] as never,
    projects: [],
    habitGroups: [],
    routines: [],
    programs: [],
    showCompletedTasks: true,
    showPausedOnGrid: true,
  });
  useViewStore.setState({
    canvasGroupBy: 'none',
    canvasSortBy: 'default',
    canvasFilters: EMPTY_VIEW_FILTERS,
    typeFilter: 'all',
    collapsedBuckets: [],
    bucketStyle: 'spine',
  });
  // A drag IS in progress — that is the only state in which any of these zones
  // mount at all (CONTRACT.md: the slot opens on activation).
  useDragStore.getState().startDrag('untimed', input);
}

/** Every droppable id the rendered card registered a NODE for. */
const mountedDropIds = () =>
  [...document.querySelectorAll('[data-dnd-id]')].map((el) => el.getAttribute('data-dnd-id')!);

const renderBuckets = () =>
  render(
    <DndContext>
      <DayBuckets activeId="untimed" />
    </DndContext>
  );

afterEach(() => {
  cleanup();
  useDragStore.getState().endDrag();
});
beforeEach(() => seed('pointer'));

describe('Day × Buckets mounts the sliver for a cursor only', () => {
  const SLIVERS = ['scheduled:morning:before:task:nine', 'scheduled:morning:after:task:eleven'];

  it('renders the before/after zones during a mouse drag', () => {
    renderBuckets();
    // Guards the guard: if the fixtures stopped producing slivers at all, the
    // touch assertion below would pass vacuously.
    expect(mountedDropIds()).toEqual(expect.arrayContaining(SLIVERS));
  });

  it('renders NONE of them during a touch drag', () => {
    seed('touch');
    renderBuckets();

    const relative = mountedDropIds().filter(
      (id) => dropTargetKind(id) === 'relative-time'
    );
    expect(relative).toEqual([]);
  });

  it('keeps every other drop target in the card for touch', () => {
    seed('touch');
    renderBuckets();
    const ids = mountedDropIds();

    // The bucket itself, its untimed section, and the labelled empty-timed tray
    // in the buckets that have no timed rows. This is what makes the touch
    // outcome a MOVE rather than a dead drag: the finger's drop still resolves
    // on the bucket, and the row lands there untimed.
    expect(ids).toEqual(
      expect.arrayContaining([
        'morning',
        'unscheduled:morning',
        'evening',
        'unscheduled:evening',
        'scheduled:evening:empty',
      ])
    );
  });

  it('still renders the timed rows themselves — only the drop zones went', () => {
    seed('touch');
    renderBuckets();
    const morning = document.querySelector('[data-dnd-bucket="morning"]') as HTMLElement;
    expect(morning.textContent).toContain('Nine');
    expect(morning.textContent).toContain('Eleven');
  });
});
