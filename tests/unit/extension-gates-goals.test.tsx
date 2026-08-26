import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * The Goals extension's gate — what "off" costs, and what it must never cost.
 *
 * Two obligations, and this file exists because they pull in opposite
 * directions. A gate that does too little leaves the feature acting while the
 * user has switched it off; a gate that does too much either takes the
 * extension out of the catalogue (so it can never be switched back on) or —
 * far worse here — takes a user's WORK off the screen with it.
 *
 * The second is the sharp one for goals specifically. Goals are an `aspire`
 * container (lib/container-registry.ts): membership switches nothing, so a goal
 * hides no item when it is ON, and the gate must not become the one thing about
 * goals that can hide an item. Every case in "no item disappears" is a check on
 * that, and the stranded-filter case is the exact shape it would take: a Goal
 * filter left set by the switch, resolving to an empty set instead of to
 * "cannot narrow", would empty the canvas with nothing on screen to say why.
 *
 * See lib/extension-gates.ts for what inert means per surface.
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
  fetchGoals: vi.fn(async () => []),
  createGoal: vi.fn(async () => {}),
  updateGoal: vi.fn(async () => {}),
  deleteGoal: vi.fn(async () => {}),
  restoreGoal: vi.fn(async () => {}),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

/** The goal page reads useParams and pushes with useRouter. */
const routeParams = vi.hoisted(() => ({ current: { id: 'g1' } as Record<string, string> }));
vi.mock('next/navigation', () => ({
  useParams: () => routeParams.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/goal/g1',
  useSearchParams: () => new URLSearchParams(),
}));

import GoalPage from '@/app/goal/[id]/page';
import { DisplayMenu } from '@/components/primitives/display-menu';
import { useDayItemsForDates } from '@/hooks/use-day-items';
import { useCanvasGroupBy, useGoalFilterIds } from '@/lib/extension-gates';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { useExtensionsStore } from '@/lib/extensions-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';
import {
  EXT_GOALS,
  OFFICIAL_EXTENSIONS,
  extensionManifest,
  resolveEnabled,
} from '@/lib/extension-registry';
import {
  ALL_PANES,
  extensionPaneId,
  isPaneId,
  settingsForPane,
  DESTINATIONS,
} from '@/lib/settings/manifest';
import {
  STATIC_COMMANDS,
  isAvailable,
  resolveCommands,
  type CommandContext,
} from '@/lib/commands';
import { enableExtensions, disableExtensions } from './support/extensions';
import type { DayItems } from '@/lib/day-items';
import type { Goal, Item } from '@/lib/planner-types';

beforeAll(() => {
  if (!('PointerEvent' in globalThis)) {
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = MouseEvent;
  }
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const ctx: CommandContext = {
  theme: { resolved: 'light', value: 'light', set: () => {} },
  openChat: () => {},
  userId: 'user-1',
  isMobile: false,
};

const DAY = [new Date('2026-07-15T12:00:00Z')];

const MEMBER: Item = {
  type: 'task',
  id: 't-member',
  title: 'Study characters',
  status: 'pending',
  isScheduled: false,
  order: 0,
  startDate: '2026-07-15',
  timeBucket: 'morning',
} as unknown as Item;

const OUTSIDER: Item = {
  type: 'task',
  id: 't-outsider',
  title: 'Unrelated errand',
  status: 'pending',
  isScheduled: false,
  order: 1,
  startDate: '2026-07-15',
  timeBucket: 'morning',
} as unknown as Item;

const GOAL: Goal = {
  id: 'g1',
  name: 'Learn Chinese',
  state: 'active',
  memberIds: ['t-member'],
  milestoneIds: [],
  checkinIds: [],
} as unknown as Goal;

/** Every id a column shows, whatever bucket or kind it landed in. */
const idsOf = (d: DayItems): string[] => [
  ...Object.values(d.tasksByBucket).flat().map((t) => t.id),
  ...Object.values(d.habitsByBucket).flat().map((h) => h.id),
];

function seed({ goalFilter = false }: { goalFilter?: boolean } = {}) {
  const items = [MEMBER, OUTSIDER];
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: 'UTC',
    isLoading: false,
    selectedDate: DAY[0],
    items,
    tasks: items as never,
    habits: [] as never,
    projects: [],
    habitGroups: [],
    routines: [],
    programs: [],
    goals: [GOAL],
    goalsAvailable: true,
    showCompletedTasks: true,
    showPausedOnGrid: false,
  } as never);
  useViewStore.setState({
    scope: 'day',
    layout: 'list',
    typeFilter: 'all',
    canvasGroupBy: 'none',
    braindumpGroupBy: 'none',
    canvasSortBy: 'default',
    braindumpSortBy: 'default',
    canvasFilters: goalFilter ? { ...EMPTY_VIEW_FILTERS, goals: ['g1'] } : EMPTY_VIEW_FILTERS,
    braindumpFilters: EMPTY_VIEW_FILTERS,
  });
}

const day = () => renderHook(() => useDayItemsForDates(DAY)).result.current[0];

/** Radix's DropdownMenuTrigger opens on pointerdown, not click. */
const openMenu = () =>
  fireEvent.pointerDown(screen.getByTestId('display-trigger-canvas'), {
    button: 0,
    ctrlKey: false,
  });

beforeEach(() => {
  useExtensionsStore.setState({ enabled: {} });
  seed();
});
afterEach(cleanup);

/* ── it must stop ACTING ───────────────────────────────────────────────────*/

describe('Goals switched off — the behaviour stops', () => {
  it('does not offer the Goal filter section', async () => {
    disableExtensions(EXT_GOALS);
    render(<DisplayMenu surface="canvas" />);
    openMenu();

    expect(await screen.findByRole('menuitem', { name: /Priority/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Goal/ })).toBeNull();
  });

  it('does not offer Goal as a grouping value', async () => {
    disableExtensions(EXT_GOALS);
    render(<DisplayMenu surface="canvas" />);
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Grouping/ }));

    // The neighbouring values are still there, so this is the Goal row missing
    // rather than the submenu failing to open.
    expect(await screen.findByRole('menuitemradio', { name: /Project/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: /Goal/ })).toBeNull();
  });

  it('resolves a stored "group by goal" to none, without rewriting the store', () => {
    useViewStore.setState({ canvasGroupBy: 'goal' });

    disableExtensions(EXT_GOALS);
    expect(renderHook(() => useCanvasGroupBy()).result.current).toBe('none');
    // The user's choice survives the switch — flipping it back restores the
    // grouping rather than silently leaving them on 'none'.
    expect(useViewStore.getState().canvasGroupBy).toBe('goal');

    cleanup();
    enableExtensions(EXT_GOALS);
    expect(renderHook(() => useCanvasGroupBy()).result.current).toBe('goal');
  });

  it('stops resolving goal membership for the canvas', () => {
    seed({ goalFilter: true });

    disableExtensions(EXT_GOALS);
    expect(renderHook(() => useGoalFilterIds([GOAL], ['g1'])).result.current).toBeNull();

    cleanup();
    enableExtensions(EXT_GOALS);
    expect([...(renderHook(() => useGoalFilterIds([GOAL], ['g1'])).result.current ?? [])]).toEqual([
      't-member',
    ]);
  });

  it('says the extension is off on /goal/[id], rather than "not found"', () => {
    disableExtensions(EXT_GOALS);
    render(<GoalPage />);

    expect(screen.getByTestId('goal-page-extension-off')).toBeInTheDocument();
    // Not the not-found state — the goal is right there in the store, and
    // telling the user it is gone would be a lie about their data.
    expect(screen.queryByText('Goal not found')).toBeNull();
    expect(screen.queryByText('Learn Chinese')).toBeNull();
  });

  it('withdraws the per-goal palette rows, which are data rather than catalogue', () => {
    disableExtensions(EXT_GOALS);
    expect(resolveCommands(ctx).some((c) => c.id === 'goal.open.g1')).toBe(false);

    enableExtensions(EXT_GOALS);
    expect(resolveCommands(ctx).some((c) => c.id === 'goal.open.g1')).toBe(true);
  });
});

/* ── it must not take anyone's WORK with it ────────────────────────────────*/

describe('Goals switched off — no item disappears', () => {
  it('shows every item it showed before, with no goal clause set', () => {
    enableExtensions(EXT_GOALS);
    const on = idsOf(day()).sort();
    cleanup();

    disableExtensions(EXT_GOALS);
    const off = idsOf(day()).sort();

    expect(off).toEqual(on);
    expect(off).toEqual(['t-member', 't-outsider']);
  });

  it('goes INERT on a stranded goal filter rather than emptying the surface', () => {
    // The failure this whole gate is written around. With Goals on, the clause
    // narrows to the goal's one member; with Goals off it must narrow NOTHING —
    // not narrow to zero, which would blank the canvas with no row left in the
    // Display menu to explain or clear it.
    seed({ goalFilter: true });

    enableExtensions(EXT_GOALS);
    expect(idsOf(day())).toEqual(['t-member']);
    cleanup();

    disableExtensions(EXT_GOALS);
    expect(idsOf(day()).sort()).toEqual(['t-member', 't-outsider']);
    // And the selection is still on disk, so switching back on restores it
    // rather than making the user rebuild the filter.
    expect(useViewStore.getState().canvasFilters.goals).toEqual(['g1']);
  });

  it('leaves goals, memberships and roles untouched — off writes nothing', () => {
    seed({ goalFilter: true });
    disableExtensions(EXT_GOALS);
    day();
    render(<DisplayMenu surface="canvas" />);
    openMenu();

    expect(usePlannerStore.getState().goals).toEqual([GOAL]);
    expect(usePlannerStore.getState().items.map((i) => i.id)).toEqual([
      't-member',
      't-outsider',
    ]);
  });

  it('does not count the stranded clause in the trigger, which has no row for it', () => {
    seed({ goalFilter: true });

    disableExtensions(EXT_GOALS);
    render(<DisplayMenu surface="canvas" />);
    // A count with no row behind it is the "Display (1 active)" over an empty
    // panel that lib/view-options.ts already argues against for a stranded
    // group-by. Same rule, same reason.
    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'aria-label',
      'Display'
    );
    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});

/* ── and it must stay findable ─────────────────────────────────────────────*/

describe('Goals switched off — still in the catalogue', () => {
  beforeEach(() => disableExtensions(EXT_GOALS));

  it('keeps its manifest row, which is what generates every way of finding it', () => {
    expect(OFFICIAL_EXTENSIONS.map((e) => e.slug)).toContain(EXT_GOALS);
    const manifest = extensionManifest(EXT_GOALS);
    expect(manifest?.name).toBe('Goals');
    expect(manifest?.description).toBeTruthy();
    // Ships off per the weight ledger — and that is the default the rest of
    // this file is testing against.
    expect(manifest?.defaultEnabled).toBe(false);
    expect(resolveEnabled({}, EXT_GOALS)).toBe(false);
  });

  it('keeps its settings pane and the one switch that turns it back on', () => {
    const pane = extensionPaneId(EXT_GOALS);
    expect(isPaneId(pane)).toBe(true);
    expect(ALL_PANES.map((p) => p.id)).toContain(pane);

    const records = settingsForPane(pane);
    const toggle = records.find((r) => r.control === 'switch' && !r.dependsOn);
    expect(toggle).toBeDefined();
    // Reads OFF and is still rendered, which is the whole "inert but findable"
    // promise: a row that vanished with the feature could never switch it back.
    expect(toggle!.read({} as never)).toBe(false);
  });

  it('keeps its search hits — the destination and the toggle keywords', () => {
    expect(DESTINATIONS.some((d) => d.id === 'dest.goals')).toBe(true);
    const toggle = settingsForPane(extensionPaneId(EXT_GOALS)).find(
      (r) => r.control === 'switch'
    );
    expect(toggle?.keywords).toEqual(expect.arrayContaining(['goal', 'milestone']));
  });

  it('keeps the Organize goals command, greyed rather than deleted', () => {
    // Deleting the row would make the palette the one place the feature stops
    // existing; `availableWhen` renders it and blocks the run instead.
    const command = STATIC_COMMANDS.find((c) => c.id === 'app.goals');
    expect(command).toBeDefined();
    expect(isAvailable(command!, ctx)).toBe(false);

    enableExtensions(EXT_GOALS);
    expect(isAvailable(command!, ctx)).toBe(true);
  });
});
