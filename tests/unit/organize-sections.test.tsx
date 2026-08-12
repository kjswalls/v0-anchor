import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { OrganizeConsole } from '@/components/planner/organize/organize-console';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import type { Item, Program, Routine } from '@/lib/planner-types';

/**
 * The Organize console's SECTION BODIES (memory/plans/organize-console.md,
 * Phase 2). The frame's own contracts live in organize-console.test.tsx.
 *
 * What these are for: every sentence this console shows before a destructive or
 * non-obvious write is computed, and each one is wrong in a different way if its
 * expression drifts from the store action it describes. The delete copy in the
 * dialogs this replaces was wrong three separate ways for a year — silently,
 * because nothing asserted it. So the copy is pinned here, not just the wiring.
 */

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: () => null,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Close: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    Handle: () => null,
  },
}));

/* ── fixtures ─────────────────────────────────────────────────────────── */

const TODAY = '2026-08-12';

const habit = (id: string, title: string, extra: Partial<Item> = {}): Item =>
  ({
    id,
    type: 'habit',
    title,
    status: 'pending',
    repeatFrequency: 'daily',
    completedDates: [],
    skippedDates: [],
    streak: 0,
    group: 'Personal',
    order: 0,
    isScheduled: false,
    ...extra,
  }) as Item;

const task = (id: string, title: string, extra: Partial<Item> = {}): Item =>
  ({ id, type: 'task', title, status: 'pending', order: 0, isScheduled: false, ...extra }) as Item;

const routine = (id: string, name: string, extra: Partial<Routine> = {}): Routine => ({
  id,
  name,
  itemIds: [],
  ...extra,
});

const program = (id: string, name: string, extra: Partial<Program> = {}): Program => ({
  id,
  name,
  state: 'auto',
  itemIds: [],
  routineIds: [],
  ...extra,
});

/** A pause that started yesterday, so isPausedOn's lower bound is satisfied. */
const PAUSED_AT = '2026-08-11T09:00:00.000Z';

type StoreState = ReturnType<typeof usePlannerStore.getState>;

function seed(state: Partial<StoreState>) {
  usePlannerStore.setState({
    items: [],
    routines: [],
    programs: [],
    projects: [],
    habitGroups: [],
    itemTypes: [],
    collectionsAvailable: true,
    itemTypesAvailable: true,
    isLoading: false,
    userId: 'u1',
    userTimezone: 'UTC',
    ...state,
  });
}

const open = (section: string) =>
  render(<OrganizeConsole open onOpenChange={() => {}} section={section} />);

const id = (testId: string) => screen.getByTestId(testId);
const maybe = (testId: string) => screen.queryByTestId(testId);
const click = (testId: string) => fireEvent.click(id(testId));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
  useUIStore.setState({ confirmRequest: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ── routines ─────────────────────────────────────────────────────────── */

describe('the routines section', () => {
  it('counts only members that still resolve', () => {
    // Member ids may name a TRASHED item — join rows outlive a soft delete by
    // design — so a raw `.length` would put "3" on the row and "1" in the detail
    // one click away, and the console would disagree with itself permanently.
    seed({
      items: [habit('i1', 'Stretch')],
      routines: [routine('r1', 'Morning', { itemIds: ['i1', 'gone-1', 'gone-2'] })],
    });
    open('routines');
    expect(within(id('routine-row')).getByText('1')).toBeInTheDocument();
  });

  it('labels a paused routine with its return date, and nothing when it is live', () => {
    seed({
      routines: [
        routine('r1', 'Morning', { pausedAt: PAUSED_AT, pausedUntil: '2026-09-01' }),
        routine('r2', 'Evening'),
      ],
    });
    open('routines');
    // Only the exception is labelled — a live container wears no marker at all.
    expect(screen.getAllByTestId('routine-paused-pill')).toHaveLength(1);
    expect(screen.getByTestId('routine-paused-pill')).toHaveTextContent('Until Sep 1');
  });

  it('offers the resume date only while paused', () => {
    seed({ routines: [routine('r1', 'Morning')] });
    open('routines');
    click('routine-row');

    // Live: no resume field, because a return date on something that is on is a
    // control with nothing to do.
    expect(maybe('routine-resume')).toBeNull();

    click('routine-state-paused');
    expect(usePlannerStore.getState().routines[0].pausedAt).toBeTruthy();
    expect(id('routine-resume')).toBeInTheDocument();
  });

  /**
   * Driven against the REAL store action, deliberately.
   *
   * The first version of this test replaced setRoutinePaused with a vi.fn() and
   * asserted the call — which passed while the control wrote nothing at all,
   * because the store's idempotence guard rejected every call the field could
   * make. A spy proves the button is wired to a name; only the real action
   * proves the column moved.
   */
  it('clears the resume date through the store, not just the spy', () => {
    seed({
      routines: [routine('r1', 'Morning', { pausedAt: PAUSED_AT, pausedUntil: '2026-09-01' })],
    });
    open('routines');
    click('routine-row');
    expect(id('routine-resume')).toHaveTextContent('Sep 1');

    click('routine-resume-clear');
    expect(usePlannerStore.getState().routines[0].pausedUntil).toBeUndefined();
    // Still paused — clearing the return date is not a resume.
    expect(usePlannerStore.getState().routines[0].pausedAt).toBe(PAUSED_AT);
    expect(id('routine-paused-note')).toHaveTextContent('hidden until you resume');
  });

  it('shows the resume field and its note once the routine is paused', () => {
    seed({
      routines: [routine('r1', 'Morning', { pausedAt: PAUSED_AT, pausedUntil: '2026-09-01' })],
    });
    open('routines');
    click('routine-row');
    expect(id('routine-resume')).toHaveTextContent('Sep 1');
    expect(id('routine-paused-note')).toHaveTextContent(
      'Its items come back on Sep 1, on their own.'
    );
    // Streaks and history are untouched by a pause, and the note has to say so —
    // it is the single most common reason people refuse to pause anything.
    expect(id('routine-paused-note')).toHaveTextContent('Streaks and history stay exactly as they are');
  });

  it('says a paused routine’s items come back when it is deleted', () => {
    // "Delete" reads as subtraction, and here it ADDS rows back to the grid.
    seed({
      items: [habit('i1', 'Stretch'), habit('i2', 'Read')],
      routines: [
        routine('r1', 'Morning', { itemIds: ['i1', 'i2'], pausedAt: PAUSED_AT }),
      ],
    });
    open('routines');
    click('routine-row');
    const zone = id('routine-delete').closest('div')?.parentElement;
    expect(zone).toHaveTextContent('its 2 items stay exactly as they are');
    expect(zone).toHaveTextContent('they come back into view');
  });

  it('drops the come-back clause when the routine was never hiding anything', () => {
    seed({
      items: [habit('i1', 'Stretch')],
      routines: [routine('r1', 'Morning', { itemIds: ['i1'] })],
    });
    open('routines');
    click('routine-row');
    const zone = id('routine-delete').closest('div')?.parentElement;
    expect(zone).toHaveTextContent('its 1 item stays exactly as it is');
    expect(zone).not.toHaveTextContent('come back into view');
  });
});

/* ── programs ─────────────────────────────────────────────────────────── */

describe('the programs section', () => {
  it('counts routines as well as items', () => {
    // A program is usually built out of routines; counting only itemIds would
    // read as empty for the most common shape there is.
    seed({
      items: [task('i1', 'Plan')],
      routines: [routine('r1', 'Morning')],
      programs: [program('p1', 'Term', { itemIds: ['i1'], routineIds: ['r1'] })],
    });
    open('programs');
    expect(within(id('program-row')).getByText('2')).toBeInTheDocument();
  });

  it('renders the date range under Dates and nowhere else', () => {
    seed({ programs: [program('p1', 'Term', { state: 'active' })] });
    open('programs');
    click('program-row');
    // On and Off are manual overrides that always win, so pickers beside them
    // would be controls with no effect.
    expect(maybe('program-starts-on')).toBeNull();

    click('program-state-auto');
    expect(id('program-starts-on')).toBeInTheDocument();
    expect(id('program-ends-on')).toBeInTheDocument();
  });

  it.each([
    ['active' as const, {}, 'On until you say otherwise'],
    ['paused' as const, {}, 'Off. Everything it holds is hidden'],
    ['auto' as const, {}, 'Always on. Give it a start or an end'],
    ['auto' as const, { startsOn: '2026-06-01', endsOn: '2026-08-31' }, 'Runs Jun 1 to Aug 31, inclusive. On now.'],
    ['auto' as const, { startsOn: '2026-09-01' }, 'Runs from Sep 1, inclusive. Off right now'],
  ])('states what %s with %o actually means', (state, dates, expected) => {
    seed({ programs: [program('p1', 'Term', { state, ...dates })] });
    open('programs');
    click('program-row');
    expect(id('program-state-note')).toHaveTextContent(expected);
  });

  it('hides the swap verb when no other program is on', () => {
    // With nothing to switch away FROM, "Switch to this" and "On" would be the
    // same button wearing two labels.
    seed({ programs: [program('p1', 'Term', { state: 'paused' })] });
    open('programs');
    click('program-row');
    expect(maybe('program-swap')).toBeNull();
  });

  it('names what the swap would turn off', () => {
    seed({
      programs: [
        program('p1', 'Term', { state: 'paused' }),
        program('p2', 'Summer', { state: 'active' }),
      ],
    });
    open('programs');
    fireEvent.click(screen.getAllByTestId('program-row')[0]);
    expect(id('program-swap')).toHaveTextContent('Turns off Summer');
    // One gesture, one undo — swapToProgram writes every program in a single
    // set() precisely so this promise is true.
    expect(id('program-swap')).toHaveTextContent('One undo puts it all back');
  });

  it('confirms an attach only when it would really hide something', () => {
    // The count comes from a resolver DELTA, not from member arrays: an item
    // already hidden, or held by a second live path, must not be counted toward
    // a warning about work that will vanish.
    seed({
      items: [habit('i1', 'Stretch')],
      routines: [routine('r1', 'Morning', { itemIds: ['i1'] })],
      programs: [program('p1', 'Term', { state: 'paused' })],
    });
    open('programs');
    click('program-row');
    click('program-routine-add');
    click('program-routine-candidate');

    const request = useUIStore.getState().confirmRequest;
    expect(request?.title).toBe('This will hide 1 item for now');
    expect(request?.testId).toBe('program-routine-attach-confirm');
    // Nothing is written until it is answered.
    expect(usePlannerStore.getState().programs[0].routineIds).toEqual([]);
  });

  it('attaches straight through when the program is already on', () => {
    seed({
      items: [habit('i1', 'Stretch')],
      routines: [routine('r1', 'Morning', { itemIds: ['i1'] })],
      programs: [program('p1', 'Term', { state: 'active' })],
    });
    open('programs');
    click('program-row');
    click('program-routine-add');
    click('program-routine-candidate');

    expect(useUIStore.getState().confirmRequest).toBeNull();
    expect(usePlannerStore.getState().programs[0].routineIds).toEqual(['r1']);
  });

  it('never offers reorder controls on a program’s items', () => {
    // `program_items` has no sort_order column, so an order arranged here would
    // survive until the next fetch and then silently reshuffle.
    seed({
      items: [task('i1', 'Plan'), task('i2', 'Book')],
      programs: [program('p1', 'Term', { itemIds: ['i1', 'i2'] })],
    });
    open('programs');
    click('program-row');
    expect(screen.getAllByTestId('program-member')).toHaveLength(2);
    expect(maybe('program-member-up')).toBeNull();
    expect(maybe('program-member-down')).toBeNull();
  });
});

/* ── labels ───────────────────────────────────────────────────────────── */

describe('the label sections', () => {
  it('counts a project’s items, not its tasks', () => {
    // removeProject unfiles everything that is not a habit, so a Goal under a
    // project must not be reported as a task — the noun and the write agree.
    seed({
      items: [
        task('i1', 'Plan', { project: 'Work' }),
        { ...task('i2', 'Ship'), type: 'custom', customType: 'goal', project: 'Work' } as Item,
        habit('i3', 'Stretch', { group: 'Work' }),
      ],
      projects: [{ id: 'pr1', name: 'Work', emoji: 'icon:Briefcase' }],
    });
    open('projects');
    expect(within(id('project-row')).getByText('2')).toBeInTheDocument();
    click('project-row');
    expect(id('project-meta')).toHaveTextContent('Project · 2 items');
  });

  it('names the group habits will actually land in', () => {
    // The old copy claimed deleting "unassigns it from all habits". It does not:
    // removeHabitGroup REASSIGNS them to the first remaining group, and the user
    // was never told where.
    seed({
      items: [habit('i1', 'Stretch', { group: 'Morning' })],
      habitGroups: [
        { id: 'g1', name: 'Morning', emoji: 'icon:Sun' },
        { id: 'g2', name: 'Evening', emoji: 'icon:Moon' },
      ],
    });
    open('groups');
    fireEvent.click(screen.getAllByTestId('group-row')[0]);
    const zone = id('group-delete').closest('div')?.parentElement;
    expect(zone).toHaveTextContent('Its 1 habit moves to “Evening”');
    expect(zone).toHaveTextContent('⌘Z brings the group back');
  });

  it('falls back to Personal when there is no other group, exactly as the store does', () => {
    seed({
      items: [habit('i1', 'Stretch', { group: 'Morning' }), habit('i2', 'Read', { group: 'Morning' })],
      habitGroups: [{ id: 'g1', name: 'Morning', emoji: 'icon:Sun' }],
    });
    open('groups');
    click('group-row');
    expect(id('group-delete').closest('div')?.parentElement).toHaveTextContent(
      'Its 2 habits move to “Personal”'
    );
  });

  it('warns that an item type is the one delete with no way back', () => {
    seed({
      items: [{ ...task('i1', 'Ship'), type: 'custom', customType: 'goal' } as Item],
      itemTypes: [{ id: 't1', name: 'goal', label: 'Goal', labelPlural: 'Goals' }],
    });
    open('types');
    click('type-row');
    const zone = id('type-delete').closest('div')?.parentElement;
    expect(zone).toHaveTextContent('Your one existing goal is kept');
    expect(zone).toHaveTextContent('isn’t undoable');
    // The filled destructive button is spent here and nowhere else in the
    // console. Dressing all five the same way is what taught users to read none.
    expect(id('type-delete').className).toContain('bg-destructive text-destructive-foreground');
  });

  it('keeps the other four delete buttons quiet', () => {
    seed({ projects: [{ id: 'pr1', name: 'Work', emoji: 'icon:Briefcase' }] });
    open('projects');
    click('project-row');
    // An outline, not a fill. `hover:bg-destructive/10` is in there, so the
    // assertion has to name the filled pair rather than the substring.
    expect(id('project-delete').className).not.toContain('bg-destructive text-destructive-foreground');
    expect(id('project-delete').className).toContain('border-destructive/40');
  });

  it('lets a colour be set AND put back to Auto', () => {
    // Auto is ColorSwatchPicker's "clear the stored colour", and it says so by
    // calling onSelect(undefined) — so a patch filtered on `!== undefined`
    // drops exactly the case that matters and the swatch becomes one-way.
    seed({ projects: [{ id: 'pr1', name: 'Work', emoji: 'icon:Briefcase', color: 'var(--accent-3)' }] });
    open('projects');
    click('project-row');

    fireEvent.click(screen.getByRole('button', { name: /Project color/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Auto$/i }));
    expect(usePlannerStore.getState().projects[0].color).toBeUndefined();
  });

  it('selects the group that already had the name, whatever its case', () => {
    // addHabitGroup de-duplicates case-insensitively, so "personal" against an
    // existing "Personal" creates nothing. An exact-only lookup would then wipe
    // the selection and leave no group, no selection and no explanation.
    seed({ habitGroups: [{ id: 'g1', name: 'Personal', emoji: 'icon:Star' }] });
    open('groups');
    fireEvent.change(id('group-new-name'), { target: { value: 'personal' } });
    fireEvent.click(id('group-add'));

    expect(usePlannerStore.getState().habitGroups).toHaveLength(1);
    expect(id('group-detail')).toHaveAttribute('data-group-id', 'g1');
  });

  it('says why a project cannot be renamed yet, instead of showing a dead input', () => {
    seed({
      items: [task('i1', 'Plan', { project: 'Work' })],
      projects: [{ id: 'pr1', name: 'Work', emoji: 'icon:Briefcase' }],
    });
    open('projects');
    click('project-row');
    // A disabled input reads as a bug; a sentence reads as a decision.
    expect(maybe('project-name-input')).toBeNull();
    expect(id('project-name')).toHaveTextContent('Work');
    expect(screen.getByText(/Renaming is parked/)).toBeInTheDocument();
  });

  it('refuses a reserved or duplicate item-type slug', () => {
    seed({ itemTypes: [{ id: 't1', name: 'goal', label: 'Goal', labelPlural: 'Goals' }] });
    open('types');
    const field = id('type-new-name');

    fireEvent.change(field, { target: { value: 'Task' } });
    expect(id('type-add')).toBeDisabled();

    fireEvent.change(field, { target: { value: 'Goal' } });
    expect(id('type-add')).toBeDisabled();

    fireEvent.change(field, { target: { value: 'Side Quest' } });
    expect(id('type-add')).not.toBeDisabled();
  });
});

/* ── the section filter ───────────────────────────────────────────────── */

describe('the section filter', () => {
  const three = () =>
    seed({
      routines: [routine('r1', 'Morning'), routine('r2', 'Evening'), routine('r3', 'Weekend')],
    });

  it('filters the current section and reports the match count', () => {
    three();
    open('routines');
    fireEvent.change(id('routine-filter'), { target: { value: 'en' } });
    // Evening and Weekend, not Morning.
    expect(screen.getAllByTestId('routine-row')).toHaveLength(2);
  });

  it('says nothing matches rather than "no routines yet"', () => {
    three();
    open('routines');
    fireEvent.change(id('routine-filter'), { target: { value: 'zzz' } });
    expect(screen.queryAllByTestId('routine-row')).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    expect(screen.queryByText('No routines yet.')).toBeNull();
  });

  it('clears on Escape without closing the plate', () => {
    three();
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} section="routines" />);
    const field = id('routine-filter') as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'zzz' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(field.value).toBe('');
    expect(screen.getAllByTestId('routine-row')).toHaveLength(3);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('lets the next Escape leave, once there is nothing left to clear', () => {
    // The rung is claimed only when it has work to do. A rung that swallowed
    // every press would strand the keyboard user inside the plate — and would
    // exhaust the e2e closeManager helpers' four-press budget.
    three();
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} section="routines" />);
    const field = id('routine-filter') as HTMLInputElement;
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('is focused by / from anywhere on the plate', () => {
    three();
    open('routines');
    fireEvent.keyDown(id('organize-console'), { key: '/' });
    expect(document.activeElement).toBe(id('routine-filter'));
  });

  it('lets a slash be typed into a text field', () => {
    three();
    open('routines');
    const draft = id('routine-new-name');
    draft.focus();
    fireEvent.keyDown(draft, { key: '/' });
    expect(document.activeElement).toBe(draft);
  });

  it('clears a half-typed new name before it leaves', () => {
    three();
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} section="routines" />);
    const draft = id('routine-new-name') as HTMLInputElement;
    draft.focus();
    fireEvent.change(draft, { target: { value: 'Half typ' } });
    fireEvent.keyDown(draft, { key: 'Escape' });

    expect(draft.value).toBe('');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('puts a dirty rename back before it leaves', () => {
    seed({ routines: [routine('r1', 'Morning')] });
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} section="routines" />);
    click('routine-row');
    const field = id('routine-name-input') as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'Mornin' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(field.value).toBe('Morning');
    expect(onOpenChange).not.toHaveBeenCalled();
    // And the reset must not have written — Escape is a cancel, not a save.
    expect(usePlannerStore.getState().routines[0].name).toBe('Morning');
  });

  it('closes an open member search before it leaves', () => {
    seed({
      items: [habit('i1', 'Stretch')],
      routines: [routine('r1', 'Morning')],
    });
    const onOpenChange = vi.fn();
    render(<OrganizeConsole open onOpenChange={onOpenChange} section="routines" />);
    click('routine-row');
    click('routine-member-add');
    expect(id('routine-member-search')).toBeInTheDocument();

    fireEvent.keyDown(id('routine-member-search'), { key: 'Escape' });
    expect(maybe('routine-member-search')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('steps down into the first match', () => {
    three();
    open('routines');
    const field = id('routine-filter');
    fireEvent.change(field, { target: { value: 'week' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveAttribute('data-routine-id', 'r3');
  });
});
