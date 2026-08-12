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
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  })),
}));
// MobileHeader renders UserProfileDropdown, which calls useRouter — outside a
// Next tree that throws "invariant expected app router to be mounted".
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { DisplayMenu } from '@/components/primitives/display-menu';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { usePlannerStore } from '@/lib/planner-store';
import { useMobileNavStore } from '@/lib/mobile-nav-store';
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
    canvasSortBy: 'default',
    braindumpSortBy: 'default',
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

  it('counts grouping, ordering and type alongside the filter clauses', async () => {
    seed({
      canvasGroupBy: 'priority',
      canvasSortBy: 'title',
      typeFilter: 'habits',
      canvasFilters: { ...EMPTY_VIEW_FILTERS, priorities: ['high'], hideFinished: true },
    });
    render(<DisplayMenu surface="canvas" />);

    // grouping + ordering + type + one priority + hideFinished
    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'aria-label',
      'Display (5 active)'
    );
  });

  it('clears the ordering too', async () => {
    seed({ canvasSortBy: 'priority', braindumpSortBy: 'title' });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    fireEvent.click(await screen.findByTestId('display-reset'));

    expect(view().canvasSortBy).toBe('default');
    // Not the other surface's — Reset is per-surface.
    expect(view().braindumpSortBy).toBe('title');
  });
});

describe('Ordering', () => {
  it('writes to the surface it is mounted on', async () => {
    render(<DisplayMenu surface="braindump" trigger="icon" align="start" />);

    openMenu('braindump');
    fireEvent.click(await screen.findByRole('menuitem', { name: /Ordering/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Title/ }));

    expect(view().braindumpSortBy).toBe('title');
    expect(view().canvasSortBy).toBe('default');
  });

  it('is blocked on Buckets, where the timed spine has to stay in time order', async () => {
    // inferDropTime resolves a drop as +-30 min from its NEIGHBOUR's time, so
    // re-sorting the spine would assign a time contradicting where the row
    // visibly landed.
    seed({ layout: 'buckets' });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Ordering/ }));

    const byTitle = await screen.findByRole('menuitemradio', { name: /Title/ });
    expect(byTitle).toHaveAttribute('data-disabled');
    expect(byTitle).toHaveTextContent('List only');
    // Default stays live — it is how you turn an ordering off from here.
    expect(screen.getByRole('menuitemradio', { name: /Default/ })).not.toHaveAttribute(
      'data-disabled'
    );
  });

  it('stays available on Week x List, where each day section is its own list', async () => {
    // Scope does not block ordering, unlike grouping.
    seed({ scope: 'week', layout: 'list' });
    render(<DisplayMenu surface="canvas" />);

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Ordering/ }));

    expect(await screen.findByRole('menuitemradio', { name: /Title/ })).not.toHaveAttribute(
      'data-disabled'
    );
  });

  it('keeps its row mounted on Schedule so the count has somewhere to live', async () => {
    // Same rule as Grouping: nothing clears canvasSortBy on a layout change.
    seed({ layout: 'schedule', canvasSortBy: 'title' });
    render(<DisplayMenu surface="canvas" />);

    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'aria-label',
      'Display (1 active)'
    );

    openMenu();
    const row = within(await screen.findByTestId('display-menu')).getByRole('menuitem', {
      name: /Ordering/,
    });
    expect(row).toHaveTextContent('Title');
    expect(row).toHaveTextContent('List only');
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

  it('says which PART of Schedule a grouping reaches, and keeps the row live', async () => {
    // Phase 5a: the hour grid still cannot take headings — a row's y position IS
    // its time — but the Anytime strip above it is an ordinary row list and now
    // groups. So the value is honoured, partly, and a disabled row would be a
    // lie in the other direction.
    seed({ layout: 'schedule' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');

    const priority = await screen.findByRole('menuitemradio', { name: /Priority/ });
    expect(priority).not.toHaveAttribute('data-disabled');
    expect(priority).toHaveTextContent('Anytime only');
    expect(screen.getByRole('menuitemradio', { name: /^Project/ })).not.toHaveAttribute(
      'data-disabled'
    );
  });

  it('honours grouping on week now that the week surfaces section their own rows', async () => {
    // It used to answer 'Day only' for every value on every week layout. Week x
    // List is seven independent lists and Week x Buckets is 28 independent
    // cells; both partition per unit, so there was nothing the axis could not
    // reach — only a rule saying it could not.
    seed({ scope: 'week', layout: 'list' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');

    const priority = await screen.findByRole('menuitemradio', { name: /Priority/ });
    expect(priority).not.toHaveAttribute('data-disabled');
    expect(priority).not.toHaveTextContent('Day only');
    // Nothing is blocked here, so no escape row is offered — it would resolve
    // nothing, and an action that does nothing is worse than no action.
    expect(screen.queryByRole('menuitem', { name: /Switch to/ })).toBeNull();
  });

  it('keeps the Grouping row mounted where the count still includes it', async () => {
    // Neither setScope nor setLayout clears canvasGroupBy, so grouping on
    // Day x List and switching to Buckets leaves a clause set. Hiding the
    // section left the trigger reading "Display (1 active)" over a panel where
    // nothing was set and nothing could unset it.
    //
    // Time bucket on Buckets is the one combination left that is genuinely
    // inert, which is what makes it the case to pin.
    seed({ layout: 'buckets', canvasGroupBy: 'bucket' });
    render(<DisplayMenu surface="canvas" />);

    expect(screen.getByTestId('display-trigger-canvas')).toHaveAttribute(
      'aria-label',
      'Display (1 active)'
    );

    openMenu();
    const row = within(await screen.findByTestId('display-menu')).getByRole('menuitem', {
      name: /Grouping/,
    });
    // The row accounts for the clause AND says why it is doing nothing.
    expect(row).toHaveTextContent('Time bucket');
    expect(row).toHaveTextContent('Already by bucket');
  });

  it('states the phone s own scope rather than inheriting one it never renders by', async () => {
    // Mobile is day-only by construction, but `scope` persists across the 768px
    // breakpoint. Without the prop a stale 'week' would report Grouping as
    // unavailable on a surface that honours it, with no way to correct it — the
    // only writers of scope are the desktop capsule and two mobile-hidden
    // palette commands.
    seed({ scope: 'week', layout: 'list' });
    render(<DisplayMenu surface="canvas" trigger="icon" scope="day" />);

    await openSub('Grouping');

    expect(await screen.findByRole('menuitemradio', { name: /Priority/ })).not.toHaveAttribute(
      'data-disabled'
    );
    // And it does not offer a scope switch the phone cannot honour.
    expect(screen.queryByRole('menuitem', { name: /Switch to Day/ })).toBeNull();
  });

  it('announces the escape row as an action, not as an unselected option', async () => {
    // Deriving the role from close-behaviour made "Switch to List" an extra,
    // unselected radio in a set of five real grouping values. The Ordering
    // submenu still carries one on every non-List layout, so this is the set a
    // screen reader meets in the default view.
    seed({ layout: 'buckets' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Ordering');
    const escape = await screen.findByRole('menuitem', { name: /Switch to List/ });

    expect(escape).not.toHaveAttribute('aria-checked');
  });

  it('keeps the one value Buckets cannot honour visible, disabled, and explained', async () => {
    // Four cards of one bucket each, sectioned by bucket, is four cards holding
    // one section apiece — the view IS the partition. Hiding the row would make
    // the menu change shape as you switch layouts; disabling it with the reason
    // states the truth instead.
    seed({ layout: 'buckets' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');

    const bucket = await screen.findByRole('menuitemradio', { name: /Time bucket/ });
    expect(bucket).toHaveAttribute('data-disabled');
    expect(bucket).toHaveTextContent('Already by bucket');

    // Priority is honoured there now — in the untimed section, which the rail
    // says. It used to be disabled with 'List only'.
    const priority = screen.getByRole('menuitemradio', { name: /Priority/ });
    expect(priority).not.toHaveAttribute('data-disabled');
    expect(priority).toHaveTextContent('Untimed rows only');
  });

  it('offers the one-click escape only while the current value is inert', async () => {
    // It used to ride every non-List layout, where it resolved nothing because
    // nothing was blocked. Now it appears exactly when it fixes something.
    seed({ layout: 'buckets', canvasGroupBy: 'project' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');
    expect(await screen.findByRole('menuitemradio', { name: /Priority/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Switch to List/ })).toBeNull();

    cleanup();
    seed({ layout: 'buckets', canvasGroupBy: 'bucket' });
    render(<DisplayMenu surface="canvas" />);

    await openSub('Grouping');
    // menuitem, not menuitemradio — it is an action, not a value in the set.
    fireEvent.click(await screen.findByRole('menuitem', { name: /Switch to List/ }));

    expect(view().layout).toBe('list');
  });
});

/**
 * The mobile mount, tested through MobileHeader rather than through DisplayMenu.
 *
 * Both defects here were in the MOUNT, not the component, and a props-level test
 * passes with the mount wrong — which is exactly what happened. Reverting
 * mobile-header.tsx to the shipped `<DisplayMenu surface="canvas"
 * trigger="icon" />` leaves every other case in this file green and fails these.
 */
describe('the mobile header mount', () => {
  const renderHeader = () =>
    render(<MobileHeader onOpenSettings={() => {}} onOpenBugReport={() => {}} />);

  afterEach(() => useMobileNavStore.setState({ activeTab: 'today' }));

  it('does not ride the Braindump tab, where a second identical trigger already sits', () => {
    // MobileShell renders MobileHeader above every activeTab guard
    // (mobile-shell.tsx:55), so an ungated mount appears on all three tabs. On
    // Braindump that is two pixel-identical triggers with the same accessible
    // name, the header one writing canvasFilters while the list below reads
    // braindumpFilters — "Hide finished" would move nothing.
    useMobileNavStore.setState({ activeTab: 'braindump' });
    renderHeader();

    expect(screen.queryByTestId('display-trigger-canvas')).toBeNull();
  });

  it('does not ride the Chat tab, which reads no view store at all', () => {
    useMobileNavStore.setState({ activeTab: 'chat' });
    renderHeader();

    expect(screen.queryByTestId('display-trigger-canvas')).toBeNull();
  });

  it('mounts on Today', () => {
    useMobileNavStore.setState({ activeTab: 'today' });
    renderHeader();

    expect(screen.getByTestId('display-trigger-canvas')).toBeInTheDocument();
  });

  it('keeps Grouping live under a stale week scope, because the phone is day-only', async () => {
    // `scope` persists across the 768px breakpoint, and useIsMobile is a live
    // matchMedia listener — a narrowed desktop window, a snapped half-screen or
    // a rotated tablet all reach the phone shell carrying whatever scope was
    // last set. MobileViewRouter ignores it and renders day either way, so the
    // menu must too, or Grouping reports unavailable on a surface that honours
    // it, with nothing on that surface able to correct it.
    seed({ scope: 'week', layout: 'list' });
    useMobileNavStore.setState({ activeTab: 'today' });
    renderHeader();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Grouping/ }));

    expect(await screen.findByRole('menuitemradio', { name: /Priority/ })).not.toHaveAttribute(
      'data-disabled'
    );
  });
});
