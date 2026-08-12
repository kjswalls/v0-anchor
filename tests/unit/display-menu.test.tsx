import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';

/**
 * The Display menu — what it writes, and what it refuses to render.
 *
 * These are render tests rather than logic tests because the defects this menu
 * replaces were all in the wiring, not the arithmetic: a Clear row that reset
 * filters but not the grouping its own dot counted, a type control living in a
 * different component from the filters it belongs with, and two popovers whose
 * bodies had drifted apart. Every case below asserts a STORE WRITE or a rendered
 * absence, which is where that class of bug lives.
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

import { DisplayMenu } from '@/components/primitives/display-menu';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { EMPTY_VIEW_FILTERS } from '@/lib/filters';

/**
 * jsdom implements neither PointerEvent nor pointer capture, and Radix's menus
 * open on pointerdown and call hasPointerCapture on the way. Shimmed locally
 * rather than in tests/unit/setup.ts so this file carries its own requirements.
 */
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

const view = () => useViewStore.getState();

function seed(viewOverrides: Partial<ReturnType<typeof view>> = {}) {
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: 'UTC',
    items: [],
    projects: [
      { id: 'p1', name: 'Work', emoji: '💼' },
      { id: 'p2', name: 'Home', emoji: '🏠' },
    ],
    habitGroups: [{ id: 'g1', name: 'Health', emoji: '🌱' }],
    showPausedOnGrid: false,
  });
  useViewStore.setState({
    scope: 'day',
    layout: 'list',
    typeFilter: 'all',
    canvasGroupBy: 'none',
    braindumpGroupBy: 'none',
    canvasFilters: EMPTY_VIEW_FILTERS,
    braindumpFilters: EMPTY_VIEW_FILTERS,
    ...viewOverrides,
  });
}

/**
 * Radix's DropdownMenuTrigger opens on POINTERDOWN, not click — a click alone
 * leaves the menu shut and every query below it fails for the wrong reason.
 * Sub-triggers and items do respond to click.
 */
const openMenu = (surface: 'canvas' | 'braindump' = 'canvas') =>
  fireEvent.pointerDown(screen.getByTestId(`display-trigger-${surface}`), {
    button: 0,
    ctrlKey: false,
  });

/** Open the menu, then a named submenu. */
async function openSub(section: string) {
  openMenu();
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(section) }));
}

beforeEach(() => seed());
afterEach(cleanup);

describe('what the Display menu writes', () => {
  it('toggles a priority into the surface it belongs to, and leaves the other alone', async () => {
    render(<DisplayMenu surface="canvas" />);

    await openSub('Priority');
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /High/ }));

    expect(view().canvasFilters.priorities).toEqual(['high']);
    // The two surfaces share a SHAPE, never an object. EMPTY_VIEW_FILTERS is a
    // module-level constant handed to both at init; a `patch` that mutated it in
    // place instead of spreading would show up right here.
    expect(view().braindumpFilters.priorities).toEqual([]);
  });

  it('writes a habit group as a prefixed container ref, not a bare name', async () => {
    render(<DisplayMenu surface="canvas" />);

    await openSub('Project / Group');
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Health/ }));

    // Prefixed because the seeds collide: DEFAULT_PROJECTS and
    // DEFAULT_HABIT_GROUPS both ship Work, so a bare name cannot say which.
    expect(view().canvasFilters.containers).toEqual(['group:Health']);
  });

  it('offers the unset value on both halves of the container axis', async () => {
    render(<DisplayMenu surface="canvas" />);

    await openSub('Project / Group');
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /No project or group/ }));

    expect(view().canvasFilters.containers).toEqual(['none:']);
  });
});

describe('multi-select keeps the menu open; single-select closes it', () => {
  it('lets three container picks be three clicks rather than three re-opens', async () => {
    render(<DisplayMenu surface="canvas" />);

    await openSub('Project / Group');
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Work/ }));
    // Still open — no re-opening between clicks.
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Home/ }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Health/ }));

    expect(view().canvasFilters.containers).toEqual(['project:Work', 'project:Home', 'group:Health']);
  });

  it('closes on a grouping pick, because the choice is complete', async () => {
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Priority/ }));

    expect(view().canvasGroupBy).toBe('priority');
    expect(screen.queryByTestId('display-menu')).toBeNull();
  });
});

describe('Reset display', () => {
  it('clears the grouping and the type filter its own count includes', async () => {
    // The live defect: today's Clear row resets filters only, while the trigger
    // dot counts grouping as active — so the dot stays lit after clearing, with
    // no way to put it out from the panel that lit it.
    seed({
      canvasGroupBy: 'priority',
      typeFilter: 'habits',
      canvasFilters: { ...EMPTY_VIEW_FILTERS, priorities: ['high'], hideFinished: true },
    });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    fireEvent.click(await screen.findByTestId('display-reset'));

    expect(view().canvasGroupBy).toBe('none');
    expect(view().typeFilter).toBe('all');
    expect(view().canvasFilters).toEqual(EMPTY_VIEW_FILTERS);
  });

  it('leaves Show paused alone — it is app-wide, not this surface s preference', async () => {
    // Captioned "Everywhere" for exactly this reason. Resetting one surface must
    // not silently change what the other five show.
    seed({ canvasFilters: { ...EMPTY_VIEW_FILTERS, hideFinished: true } });
    usePlannerStore.setState({ showPausedOnGrid: true });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    fireEvent.click(await screen.findByTestId('display-reset'));

    expect(usePlannerStore.getState().showPausedOnGrid).toBe(true);
  });

  it('is mounted and disabled at rest, so the panel cannot jump height', async () => {
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    const reset = await screen.findByTestId('display-reset');

    // Present, not absent — today's conditionally-mounted Clear row is what
    // makes the panel resize on the first tick.
    expect(reset).toBeInTheDocument();
    expect(reset).toHaveAttribute('data-disabled');
  });

  it('counts grouping and type alongside the filter clauses', async () => {
    seed({
      canvasGroupBy: 'priority',
      typeFilter: 'habits',
      canvasFilters: { ...EMPTY_VIEW_FILTERS, priorities: ['high'], hideFinished: true },
    });
    render(<DisplayMenu surface="canvas" />);

    // grouping + type + one priority + hideFinished
    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'aria-label',
      'Display (4 active)'
    );
  });
});

describe('each surface renders only what it can honour', () => {
  it('withholds Type and Show paused from the braindump', async () => {
    render(<DisplayMenu surface="braindump" trigger="icon" align="start" />);

    openMenu('braindump');
    const menu = await screen.findByTestId('display-menu');

    // Type: the braindump's corpus is single-type today, and grouping by Type
    // already answers "what is in here" at that size.
    expect(within(menu).queryByRole('menuitem', { name: /Type/ })).toBeNull();
    // Show paused is a canvas-grid preference; the braindump is dateless.
    expect(within(menu).queryByRole('menuitemcheckbox', { name: /Show paused/ })).toBeNull();
    // But the two axes it CAN answer are both there.
    expect(within(menu).getByRole('menuitem', { name: /Priority/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Project \/ Group/ })).toBeInTheDocument();
  });

  it('drops Grouping entirely on Schedule, where y position is already time', async () => {
    seed({ layout: 'schedule' });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    const menu = await screen.findByTestId('display-menu');

    expect(within(menu).queryByRole('menuitem', { name: /Grouping/ })).toBeNull();
    // The filters still render — only the axis Schedule has spent is gone.
    expect(within(menu).getByRole('menuitem', { name: /Priority/ })).toBeInTheDocument();
  });

  it('drops Grouping on week, where seven columns already spend the axis', async () => {
    seed({ scope: 'week', layout: 'list' });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    const menu = await screen.findByTestId('display-menu');

    expect(within(menu).queryByRole('menuitem', { name: /Grouping/ })).toBeNull();
  });

  it('keeps a value Buckets cannot honour visible, disabled, and explained', async () => {
    // day-buckets.tsx:112 tests `=== 'project'` and nothing else, so Priority
    // there renders identically to None. Hiding the row would make the menu
    // change shape as you switch layouts; disabling it with the reason states
    // the truth instead.
    seed({ layout: 'buckets' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');

    const priority = await screen.findByRole('menuitemradio', { name: /Priority/ });
    expect(priority).toHaveAttribute('data-disabled');
    expect(priority).toHaveTextContent('List only');

    // Project IS honoured there, so it stays live.
    expect(screen.getByRole('menuitemradio', { name: /^Project/ })).not.toHaveAttribute(
      'data-disabled'
    );
  });

  it('offers the one-click escape from a layout that cannot honour the value', async () => {
    seed({ layout: 'buckets' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Switch to List/ }));

    expect(view().layout).toBe('list');
  });
});
