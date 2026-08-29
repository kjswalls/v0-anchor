// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * THE BANDS — the item surface stops rendering four questions as one row.
 *
 * Ticket D4. Every chip on the edit surface already asked lib/item-registry.ts
 * whether it may exist; nothing asked about order or grouping, so Project
 * (classify), Routine and Program (gate) and Goal (aspire) rendered as five
 * identical pills in source order and the three container ROLES that
 * lib/container-registry.ts spends four screens distinguishing reached the user
 * as no distinction at all.
 *
 * Three claims are load-bearing here, and each one is a thing a later edit could
 * quietly undo:
 *
 *  1. THE ORDER AND THE SET ARE DERIVED. `CONTAINER_BANDS` iterates the
 *     registry and sorts by ROLE. Hand-listing the four kinds would look
 *     identical today and would silently drop the fifth.
 *  2. THE LABEL IS THE REGISTRY'S NOUN. CLAUDE.md: the user-facing noun lives
 *     only in `CONTAINER_KINDS[kind].label`. A literal 'Project' in a component
 *     turns a rename from a string edit into a hunt.
 *  3. AN EMPTY BAND STILL RENDERS, and its affordance is actionable. That is
 *     the whole point of the layout not jumping as you fill an item in — with
 *     ONE exception (a gate with nothing to join and no console to open), which
 *     is asserted just as hard so it cannot be "fixed" by accident.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useParams: () => ({}),
}));

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  fetchTrashedNames: vi.fn(async () => []),
  fetchItemEvents: vi.fn(async () => []),
  getItemEventsAvailable: () => false,
}));

import { ItemDialog } from '@/components/planner/item-dialog';
import { ContainerBandsReadout } from '@/components/planner/item-bands';
import {
  CONTAINER_BANDS,
  CONTAINER_ROLE_ORDER,
  bandTestId,
  membershipSummary,
  visibleContainerBands,
  type ContainerBandContext,
} from '@/lib/item-bands';
import { CONTAINER_KINDS } from '@/lib/container-registry';
import { usePlannerStore } from '@/lib/planner-store';
import { EXT_GOALS, EXT_ORGANIZE } from '@/lib/extension-registry';
import { disableExtensions, enableExtensions } from './support/extensions';
import type { Goal, Item, Program, Routine, TaskItem } from '@/lib/planner-types';

/* ── the pure module ────────────────────────────────────────────────────── */

describe('the band list is derived from the container registry', () => {
  it('holds every kind exactly once — nothing hand-listed, nothing dropped', () => {
    expect([...CONTAINER_BANDS].map((b) => b.kind).sort()).toEqual(
      Object.keys(CONTAINER_KINDS).sort()
    );
  });

  it('orders by ROLE: what it is about, what switches it off, what it is for', () => {
    const roleIndex = CONTAINER_BANDS.map((b) => CONTAINER_ROLE_ORDER.indexOf(b.role));
    expect(roleIndex).toEqual([...roleIndex].sort((a, b) => a - b));
    // Not vacuous: the three roles are all actually present in that order.
    expect([...new Set(CONTAINER_BANDS.map((b) => b.role))]).toEqual([...CONTAINER_ROLE_ORDER]);
  });

  it('labels every band with the registry noun and nothing else', () => {
    for (const band of CONTAINER_BANDS) {
      expect(band.label).toBe(CONTAINER_KINDS[band.kind].label);
      expect(band.labelPlural).toBe(CONTAINER_KINDS[band.kind].labelPlural);
    }
  });

  it('keeps the two GATE kinds as two bands — a merged one could not be named', () => {
    // Kirby's rule is nouns, and the registry supplies a noun per KIND. A single
    // gate band would have to invent one, which is the literal this whole module
    // exists to avoid.
    const gates = CONTAINER_BANDS.filter((b) => b.role === 'gate');
    expect(gates.map((b) => b.kind)).toEqual(['routine', 'program']);
  });
});

const ctx = (over: Partial<ContainerBandContext> = {}): ContainerBandContext => ({
  classifyKind: 'project',
  collectible: true,
  collectionsAvailable: true,
  goalsAvailable: true,
  goalsEnabled: true,
  organizeEnabled: true,
  counts: { project: 0, routine: 0, program: 0, goal: 0 },
  ...over,
});

const kindsFor = (over: Partial<ContainerBandContext> = {}) =>
  visibleContainerBands(ctx(over)).map((b) => b.kind);

describe('which bands render', () => {
  it('renders every band EMPTY — the layout is what the item can be', () => {
    expect(kindsFor()).toEqual(['project', 'routine', 'program', 'goal']);
  });

  it('gives the classify band only to a type that answers with that kind', () => {
    expect(kindsFor({ classifyKind: null })).not.toContain('project');
    expect(kindsFor({ classifyKind: null })).toEqual(['routine', 'program', 'goal']);
  });

  it('drops a gate band with nothing to join AND no console to open', () => {
    // The one exception to the empty-band rule, inherited from the chip it
    // replaced: the band's only content would be a door, and the door is gone
    // while Organize is off.
    expect(kindsFor({ organizeEnabled: false })).toEqual(['project', 'goal']);
    // …and it comes straight back as soon as there is a container to name.
    expect(kindsFor({ organizeEnabled: false, counts: { routine: 1 } })).toEqual([
      'project',
      'routine',
      'goal',
    ]);
  });

  it('drops the gates for an item that cannot join one, and when the tables are gone', () => {
    expect(kindsFor({ collectible: false })).toEqual(['project']);
    expect(kindsFor({ collectionsAvailable: false })).toEqual(['project', 'goal']);
  });

  it('renders the aspire band from zero, and never consults the console', () => {
    expect(kindsFor({ organizeEnabled: false, counts: { goal: 0 } })).toContain('goal');
    expect(kindsFor({ goalsEnabled: false })).not.toContain('goal');
    expect(kindsFor({ goalsAvailable: false })).not.toContain('goal');
  });
});

describe('membershipSummary', () => {
  it('is undefined for none, the name for one, and name +n for many', () => {
    expect(membershipSummary([])).toBeUndefined();
    expect(membershipSummary(['Deep work'])).toBe('Deep work');
    expect(membershipSummary(['Deep work', 'Evening', 'Weekly'])).toBe('Deep work +2');
  });
});

/* ── the surfaces ───────────────────────────────────────────────────────── */

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  type: 'task',
  id: 't1',
  title: 'Draft the Q3 handoff note',
  status: 'pending',
  isScheduled: false,
  order: 0,
  ...over,
});

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: 'Deep work',
  itemIds: [],
  ...over,
});

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p1',
  name: 'Autumn term',
  state: 'auto',
  itemIds: [],
  routineIds: [],
  ...over,
});

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Ship v2',
  state: 'active',
  memberIds: [],
  milestoneIds: [],
  checkinIds: [],
  ...over,
});

const seed = (over: Record<string, unknown> = {}) =>
  usePlannerStore.setState({
    items: [task()],
    projects: [{ name: 'Onboarding' }],
    routines: [routine()],
    programs: [program()],
    goals: [goal()],
    itemTypes: [],
    collectionsAvailable: true,
    goalsAvailable: true,
    itemTypesAvailable: true,
    userTimezone: 'UTC',
    isLoading: false,
    userId: 'u1',
    ...over,
  } as never);

beforeEach(() => {
  enableExtensions(EXT_GOALS, EXT_ORGANIZE);
  seed();
});
afterEach(cleanup);

const panel = (item: Item = task()) =>
  render(
    <ItemDialog
      presentation="panel"
      state={{ mode: 'edit', item }}
      onOpenChange={() => {}}
      withDetailSections={false}
    />
  );

/** The band rows on screen, top to bottom, by their label text. */
const bandLabels = () =>
  Array.from(document.querySelectorAll('[data-testid^="item-band-"]')).map(
    (row) => row.querySelector('p')?.textContent ?? ''
  );

describe('the edit panel renders the Clearing field, not bands', () => {
  it('drops the labelled band stack for one label-less field', () => {
    panel();
    expect(screen.getByTestId('item-clearing-field')).toBeTruthy();
    // The band grammar belongs to the /item readout and the capture modal now;
    // the editing panel shows only what the item actually carries.
    expect(document.querySelectorAll('[data-testid^="item-band-"]').length).toBe(0);
  });

  it('shows only SET properties, folding the rest behind one "+ Add property" seed', () => {
    // A bare task carries nothing but a title, so the field is just the seed —
    // none of the four containers render a chip while empty.
    panel();
    const field = screen.getByTestId('item-clearing-field');
    expect(field.querySelector('[data-testid="item-clearing-seed"]')).toBeTruthy();
    for (const kind of ['project', 'routine', 'program', 'goal'] as const) {
      expect(field.textContent).not.toContain(CONTAINER_KINDS[kind].label);
    }
  });

  it('renders a set membership as its value chip, the noun kept in the a11y name', () => {
    seed({ routines: [routine({ itemIds: ['t1'] })] });
    panel();
    const field = screen.getByTestId('item-clearing-field');
    expect(field.textContent).toContain('Deep work');
    const chip = Array.from(field.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Deep work')
    );
    expect(chip?.getAttribute('aria-label')).toBe(`${CONTAINER_KINDS.routine.label}: Deep work`);
  });

  it('moves Priority into the field — a value when set, in the seed when not', () => {
    panel(); // unset (the seeded t1 has no priority)
    expect(screen.getByTestId('item-clearing-field').textContent).not.toContain('Medium');
    cleanup();
    // editItem re-resolves against the store, so the priority must live there.
    seed({ items: [task({ priority: 'medium' })] });
    panel();
    expect(screen.getByTestId('item-clearing-field').textContent).toContain('Medium');
  });

  it('offers every unset property by its registry noun in the seed, and a revealed container keeps that noun', () => {
    panel();
    fireEvent.click(screen.getByTestId('item-clearing-seed'));
    const optionText = () =>
      Array.from(document.querySelectorAll('[data-testid="item-clearing-seed-option"]')).map(
        (o) => o.textContent ?? ''
      );
    // The container nouns and Priority are all reachable from the seed.
    expect(optionText().some((t) => t.includes(CONTAINER_KINDS.routine.label))).toBe(true);
    expect(optionText().some((t) => t.includes('Priority'))).toBe(true);
    // Revealing a container gives it a chip that carries its kind noun — not a
    // bare "Add" (the band label that used to sit beside it is gone).
    const routineOption = Array.from(
      document.querySelectorAll('[data-testid="item-clearing-seed-option"]')
    ).find((o) => o.textContent?.includes(CONTAINER_KINDS.routine.label));
    fireEvent.click(routineOption!);
    const revealed = Array.from(
      screen.getByTestId('item-clearing-field').querySelectorAll('button')
    ).find((b) => b.getAttribute('aria-label') === CONTAINER_KINDS.routine.label);
    expect(revealed?.textContent).toContain(CONTAINER_KINDS.routine.label);
  });
});

describe('the capture surface keeps its bands too', () => {
  it('renders the modal in add mode with the same rows, and a Priority chip', () => {
    render(
      <ItemDialog state={{ mode: 'add', type: 'task' }} onOpenChange={() => {}} />
    );
    expect(bandLabels()).toEqual([
      'When',
      CONTAINER_KINDS.project.label,
      CONTAINER_KINDS.routine.label,
      CONTAINER_KINDS.program.label,
      CONTAINER_KINDS.goal.label,
    ]);
    // Add is where an item's shape is decided, so the identity line carries the
    // same priority control the panel does.
    expect(screen.getByText('Priority')).toBeTruthy();
  });
});

describe('the /item/[id] readout', () => {
  const readout = (item: Item, onAdd = vi.fn()) => {
    render(<ContainerBandsReadout item={item} onAdd={onAdd} />);
    return onAdd;
  };

  it('finally says which routines, programs and goals an item serves', () => {
    // The page showed a project and nothing else: an item could sit in a
    // routine, a program and a goal and its own page never said so.
    seed({
      routines: [routine({ itemIds: ['t1'] })],
      programs: [program({ itemIds: ['t1'] })],
      goals: [goal({ memberIds: ['t1'] })],
    });
    readout(task({ project: 'Onboarding' }));
    expect(screen.getByTestId(bandTestId('project')).textContent).toContain('Onboarding');
    expect(screen.getByTestId(bandTestId('routine')).textContent).toContain('Deep work');
    expect(screen.getByTestId(bandTestId('program')).textContent).toContain('Autumn term');
    expect(screen.getByTestId(bandTestId('goal')).textContent).toContain('Ship v2');
  });

  it('renders an empty band as a way in rather than a blank, and hands editing back', () => {
    const onAdd = readout(task());
    const add = screen.getByTestId('band-add-program');
    fireEvent.click(add);
    // One write path, still: the readout opens the editor, it does not grow a
    // second way to change a membership.
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].kind).toBe('program');
  });

  it('counts an achieved goal out — the same wind-down the chip does', () => {
    seed({ goals: [goal({ state: 'achieved', memberIds: ['t1'] })] });
    readout(task());
    expect(screen.getByTestId(bandTestId('goal')).textContent).not.toContain('Ship v2');
  });
});

/* ── focus return (item-surface-growth "Open after Phase 8") ─────────────── */

describe('closing the panel gives the cursor back', () => {
  const Harness = ({ open, item = task() }: { open: boolean; item?: Item }) => (
    <>
      <button data-testid="opener">Row</button>
      <button data-testid="elsewhere">Elsewhere</button>
      <ItemDialog
        presentation="panel"
        state={open ? { mode: 'edit', item } : null}
        onOpenChange={() => {}}
        withDetailSections={false}
      />
    </>
  );

  it('returns it to whatever opened the panel, not to <body>', () => {
    const view = render(<Harness open={false} />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    view.rerender(<Harness open />);

    // THE CASE THAT MATTERS is focus INSIDE the panel. The panel never steals
    // it, so a cursor left on the opener stays there whatever happens — the
    // first version of this test asserted exactly that and proved nothing (it
    // stayed green with the restore deleted). Tab in, or press the panel's own
    // close button, and the subtree that holds the cursor is about to vanish:
    // Radix's FocusScope returned focus for the modal, and the bare <aside>
    // (Phase 8) has nothing that does, so the cursor landed on <body> and the
    // next Tab restarted at the top of the document.
    // Clearing dropped the close-X; "Done" is the in-panel focusable now.
    const inside = screen.getByTestId('item-dialog-submit');
    inside.focus();
    expect(document.activeElement).toBe(inside);

    view.rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it('leaves the cursor alone when something else has already claimed it', () => {
    const view = render(<Harness open={false} />);
    screen.getByTestId('opener').focus();
    view.rerender(<Harness open />);
    const elsewhere = screen.getByTestId('elsewhere');
    elsewhere.focus();
    view.rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('remembers where the SESSION started, not the last row it retargeted to', () => {
    // The panel retargets to another item without ever closing — the ui-store's
    // dialog slot is the selection. Re-capturing on each payload would hand the
    // cursor to whatever happened to hold it at the third click.
    const view = render(<Harness open={false} />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    view.rerender(<Harness open />);

    screen.getByTestId('elsewhere').focus();
    view.rerender(<Harness open item={task({ id: 't2', title: 'Another' })} />);
    screen.getByTestId('item-dialog-submit').focus();

    view.rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });
});
