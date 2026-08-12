import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

/**
 * Lanes and focus, rendered (Phase 5b).
 *
 * The pure half is `schedule-lanes.test.ts`. This is the half that has burned
 * this project twice: a props-level test passes while the MOUNT is wrong, and
 * both Schedules are exactly the mounts the Phase 5a review found unpinned.
 *
 * jsdom reports every width as 0, so `useFieldWidth` never measures and the day
 * grid cannot divide on its own. The cases that need lanes stub ResizeObserver
 * to report a real width — which is also the only way to test the budget at all.
 */

/** Width every observed element reports, so useFieldWidth has something to see. */
let stubbedFieldWidth = 0;

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
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver;
  // useFieldWidth reads clientWidth, which jsdom pins at 0 — and a 0 width means
  // "unmeasured", which forces focus mode. This is the only lever.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return stubbedFieldWidth;
    },
  });
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
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
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));

import { DaySchedule } from '@/components/views/day-schedule';
import { WeekSchedule } from '@/components/views/week-schedule';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { useScheduleFocusStore } from '@/lib/schedule-focus-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';
import { MIN_CHANNEL_PX } from '@/lib/schedule-constants';
import type { GroupBy, Task } from '@/lib/planner-types';

const TZ = 'UTC';
const DATE_STR = '2026-08-13';
const DATE = new Date(`${DATE_STR}T12:00:00Z`);

const task = (over: Partial<Task>): Task =>
  ({
    status: 'pending',
    isScheduled: true,
    order: 0,
    startDate: DATE_STR,
    timeBucket: 'morning',
    duration: 60,
    ...over,
  }) as Task;

/** Three timed tasks in three projects — enough to divide, at three distinct times. */
const tasks: Task[] = [
  task({ id: 'w', title: 'Work block', project: 'Work', startTime: '09:00' }),
  task({ id: 'h', title: 'Home block', project: 'Home', startTime: '11:00' }),
  task({ id: 'a', title: 'Admin block', project: 'Admin', startTime: '13:00' }),
];

function seed(canvasGroupBy: GroupBy, over: Partial<Task>[] = []) {
  const rows = over.length ? (over as Task[]) : tasks;
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: TZ,
    selectedDate: DATE,
    weekStartDay: 'sunday',
    navDirection: null,
    tasks: rows,
    habits: [],
    items: rows as never,
    projects: [
      { id: 'p1', name: 'Work', emoji: '💼' },
      { id: 'p2', name: 'Home', emoji: '🏠' },
      { id: 'p3', name: 'Admin', emoji: '🗂' },
    ],
    habitGroups: [],
    routines: [],
    programs: [],
    showCompletedTasks: true,
    showPausedOnGrid: true,
    showCurrentTimeIndicator: false,
  });
  useViewStore.setState({
    canvasGroupBy,
    canvasSortBy: 'default',
    canvasFilters: EMPTY_VIEW_FILTERS,
    typeFilter: 'all',
  });
  useScheduleFocusStore.setState({ focusedKey: null });
}

const mount = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

const capRow = () => screen.queryByTestId('lane-cap-row');
const caps = () => [...document.querySelectorAll('[data-lane]')] as HTMLElement[];
const capLabels = () => caps().map((el) => el.textContent?.trim());
/** A block's wrapper carries its band; the pane inside carries the recession. */
const blockPanes = () => [...document.querySelectorAll('[data-block-id]')] as HTMLElement[];

afterEach(() => {
  cleanup();
  stubbedFieldWidth = 0;
});
beforeEach(() => seed('none'));

describe('Day × Schedule — the cap row', () => {
  it('renders nothing at all when nothing is grouped', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    mount(<DaySchedule activeId={null} />);
    expect(capRow()).toBeNull();
  });

  it('divides into lanes on a field that can afford them', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    seed('project');
    mount(<DaySchedule activeId={null} />);

    expect(capRow()).toHaveAttribute('data-lane-mode', 'lanes');
    expect(capLabels()).toEqual(['Work', 'Home', 'Admin']);
  });

  it('falls back to focus when the field cannot carry three lanes', () => {
    // The budget is measured, so this is the same day at a narrower canvas —
    // an item panel opening is exactly this.
    stubbedFieldWidth = MIN_CHANNEL_PX * 2;
    seed('project');
    mount(<DaySchedule activeId={null} />);

    expect(capRow()).toHaveAttribute('data-lane-mode', 'focus');
    // Every group is still named, and still one click from the whole field.
    expect(capLabels()).toEqual(['Work', 'Home', 'Admin']);
  });
});

describe('focus recedes the other lanes', () => {
  it('starts with nothing receded', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    seed('project');
    mount(<DaySchedule activeId={null} />);

    expect(blockPanes().filter((el) => el.dataset.receded === 'true')).toHaveLength(0);
  });

  it('recedes every block outside the picked lane, and only those', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    seed('project');
    mount(<DaySchedule activeId={null} />);

    fireEvent.click(caps().find((el) => el.dataset.lane === 'project:Work')!);

    const receded = blockPanes().filter((el) => el.dataset.receded === 'true');
    expect(receded.map((el) => el.dataset.blockId).sort()).toEqual(['a', 'h']);
    expect(caps().find((el) => el.dataset.lane === 'project:Work')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('clears on a second pick — the cap is a toggle', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    seed('project');
    mount(<DaySchedule activeId={null} />);

    const workCap = () => caps().find((el) => el.dataset.lane === 'project:Work')!;
    fireEvent.click(workCap());
    fireEvent.click(workCap());

    expect(blockPanes().filter((el) => el.dataset.receded === 'true')).toHaveLength(0);
  });

  it('stops applying when the grouping changes under it', () => {
    // Focus is held by group key in a store that knows nothing about grouping,
    // so `project:Work` outlives the lanes that named it. Resolved against the
    // current plan it simply stops applying; left alone it would recede the
    // whole grid with nothing on screen able to explain why.
    stubbedFieldWidth = MIN_CHANNEL_PX * 6;
    seed('project');
    mount(<DaySchedule activeId={null} />);
    fireEvent.click(caps().find((el) => el.dataset.lane === 'project:Work')!);
    expect(blockPanes().filter((el) => el.dataset.receded === 'true')).toHaveLength(2);

    cleanup();
    useViewStore.setState({ canvasGroupBy: 'priority' });
    mount(<DaySchedule activeId={null} />);

    expect(useScheduleFocusStore.getState().focusedKey).toBe('project:Work');
    expect(blockPanes().filter((el) => el.dataset.receded === 'true')).toHaveLength(0);
  });
});

describe('Week × Schedule — focus, never lanes', () => {
  it('mounts a focus cap row naming every group in the week', () => {
    // NOT a test that week refuses to divide. WeekSchedule passes no fieldWidth
    // at all, so this stays in focus mode even with the `variant === 'day'` rule
    // deleted — I checked, by deleting it. The rule itself is pinned in
    // schedule-lanes.test.ts, which hands week an explicit width.
    //
    // What this does pin is the mount: that the plan is built over all seven
    // columns and reaches a cap row.
    stubbedFieldWidth = MIN_CHANNEL_PX * 12;
    seed('project');
    mount(<WeekSchedule activeId={null} />);

    expect(capRow()).toHaveAttribute('data-lane-mode', 'focus');
    expect(capLabels()).toEqual(['Work', 'Home', 'Admin']);
  });

  it('recedes across every column at once, because focus is a question about the week', () => {
    stubbedFieldWidth = MIN_CHANNEL_PX * 12;
    seed('project');
    mount(<WeekSchedule activeId={null} />);

    fireEvent.click(caps().find((el) => el.dataset.lane === 'project:Work')!);

    const receded = blockPanes().filter((el) => el.dataset.receded === 'true');
    expect(receded.map((el) => el.dataset.blockId).sort()).toEqual(['a', 'h']);
  });
});
