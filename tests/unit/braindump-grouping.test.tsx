import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

// RelayField (the braindump's empty-state backdrop) reads prefers-reduced-motion.
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
});

/**
 * Grouping owns the outer order; Ordering only moves rows inside a section.
 *
 * Rendered rather than reimplemented. The defect this pins was in the ORDER OF
 * TWO OPERATIONS inside one component — sorting the flat row list and then
 * partitioning it — and a test that rebuilds that partition in the test file
 * asserts its own arithmetic, not the component's. That is the third time this
 * project has produced a test that passes whatever the code does, so this one
 * mounts the real Braindump.
 */

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  createItemType: vi.fn(async () => {}),
  updateItemType: vi.fn(async () => {}),
  deleteItemType: vi.fn(async () => {}),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  restoreItem: vi.fn(async () => {}),
  setItemCompletion: vi.fn(async () => {}),
  createProject: vi.fn(async () => {}),
  updateProject: vi.fn(async () => {}),
  deleteProject: vi.fn(async () => {}),
  restoreProject: vi.fn(async () => {}),
  createHabitGroup: vi.fn(async () => {}),
  updateHabitGroup: vi.fn(async () => {}),
  deleteHabitGroup: vi.fn(async () => {}),
  restoreHabitGroup: vi.fn(async () => {}),
  fetchRoutines: vi.fn(async () => []),
  createRoutine: vi.fn(async () => {}),
  updateRoutine: vi.fn(async () => {}),
  deleteRoutine: vi.fn(async () => {}),
  restoreRoutine: vi.fn(async () => {}),
  fetchPrograms: vi.fn(async () => []),
  createProgram: vi.fn(async () => {}),
  updateProgram: vi.fn(async () => {}),
  deleteProgram: vi.fn(async () => {}),
  restoreProgram: vi.fn(async () => {}),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));

import { Braindump } from '@/components/sidebar/braindump';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';
import type { Item } from '@/lib/planner-types';
import type { SortBy } from '@/lib/sort-rows';

/**
 * Two unscheduled tasks whose STORE order is the reverse of their alphabetical
 * order, in two different projects. That is what makes the section sequence
 * observable: under the defect, sorting by title promoted Apple's row to the
 * front of the flat list, so Home was the first project the grouping map met.
 */
const items: Item[] = [
  {
    type: 'task',
    id: 'z',
    title: 'Zebra',
    project: 'Work',
    status: 'pending',
    isScheduled: false,
    order: 0,
  } as unknown as Item,
  {
    type: 'task',
    id: 'a',
    title: 'Apple',
    project: 'Home',
    status: 'pending',
    isScheduled: false,
    order: 1,
  } as unknown as Item,
];

function seed(braindumpSortBy: SortBy) {
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: 'UTC',
    items,
    tasks: items as never,
    habits: [],
    projects: [
      { id: 'p1', name: 'Work', emoji: '💼' },
      { id: 'p2', name: 'Home', emoji: '🏠' },
    ],
    habitGroups: [],
    routines: [],
    programs: [],
  });
  useViewStore.setState({
    braindumpGroupBy: 'project',
    braindumpSortBy,
    braindumpFilters: EMPTY_VIEW_FILTERS,
  });
}

const renderBraindump = () =>
  render(
    <DndContext>
      <Braindump />
    </DndContext>
  );

/** Section headings in render order. GroupSection renders them as uppercase. */
const sections = () =>
  screen
    .getAllByText(/^(Work|Home|No project)$/i)
    .map((el) => el.textContent?.trim().toLowerCase());

afterEach(cleanup);

describe('braindump: grouping owns the outer order', () => {
  it('keeps the section sequence under Default', () => {
    seed('default');
    renderBraindump();

    expect(sections()).toEqual(['work', 'home']);
  });

  it('keeps the SAME section sequence under Title A–Z', () => {
    // The defect: the grouping map is filled by walking the row list, and
    // `[...groups.entries()]` returns insertion order — so sorting the flat
    // list first made the headings swap to [Home, Work] while the rows inside
    // each stayed correct. It reads as the panel jumping, not as a bug.
    seed('title');
    renderBraindump();

    expect(sections()).toEqual(['work', 'home']);
  });

  it('still orders the rows inside a section', () => {
    // Ordering has to do SOMETHING — this is what stops the fix above from
    // being "ignore the sort entirely".
    usePlannerStore.setState({
      items: [
        ...items,
        {
          type: 'task',
          id: 'm',
          title: 'Mango',
          project: 'Work',
          status: 'pending',
          isScheduled: false,
          order: 2,
        } as unknown as Item,
      ],
    });
    usePlannerStore.setState({ tasks: usePlannerStore.getState().items as never });
    useViewStore.setState({ braindumpSortBy: 'title' });
    renderBraindump();

    const titles = screen.getAllByText(/^(Zebra|Mango|Apple)$/).map((el) => el.textContent);
    // Work's two rows sort inside their section; Apple stays in Home, after them.
    expect(titles).toEqual(['Mango', 'Zebra', 'Apple']);
  });
});

beforeEach(() => seed('default'));
