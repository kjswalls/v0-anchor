// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase A′ — the case policy stops being read-time patchwork.
 *
 * Phase A gave `caseFold` one home. It did not change what the STORE does, and
 * the store is where the asymmetry actually bit: three lookups folded by hand
 * (`getHabitGroupColor`, `getHabitGroupEmoji`, `addHabitGroup`'s duplicate
 * check) and the two verbs that REPAIR references compared exactly. So a habit
 * stored as 'personal' — which `makeAddDraft` writes against the seeded
 * 'Personal' whenever the groups list has not loaded yet — took the folded
 * colour and the folded emoji, and then survived the deletion of its own group
 * pointing at a row that no longer existed.
 *
 * These pin both halves of the policy. Habit groups fold; PROJECTS DO NOT, and
 * that is asserted just as hard — a well-meaning "make it symmetric" is the
 * likeliest way this regresses, and it would silently merge two projects a user
 * deliberately named `Work` and `work`.
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

import { render, cleanup } from '@testing-library/react';
import { usePlannerStore } from '@/lib/planner-store';
import { GroupSection } from '@/components/primitives/group-section';
import type { HabitGroupType, Item, Project } from '@/lib/planner-types';

const PROJECTS: Project[] = [
  { id: 'p-work', name: 'Work', emoji: '💼' },
  { id: 'p-side', name: 'Side', emoji: '📐' },
];

const GROUPS: HabitGroupType[] = [
  { id: 'g-personal', name: 'Personal', emoji: '⭐' },
  { id: 'g-health', name: 'Health', emoji: '💚' },
];

const task = (id: string, project?: string): Item =>
  ({ type: 'task', id, title: id, status: 'pending', isScheduled: false, order: 0, project }) as Item;

const habit = (id: string, group: string): Item =>
  ({
    type: 'habit',
    id,
    title: id,
    status: 'pending',
    repeatFrequency: 'daily',
    completedDates: [],
    skippedDates: [],
    streak: 0,
    group,
  }) as unknown as Item;

function seed(items: Item[]) {
  usePlannerStore.setState({
    userId: 'user-1',
    userTimezone: 'UTC',
    items,
    projects: PROJECTS,
    habitGroups: GROUPS,
  });
}

const store = () => usePlannerStore.getState();
const containerOf = (id: string) =>
  store().items.find((i) => i.id === id) as unknown as { project?: string; group?: string };

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('removeHabitGroup reassigns every spelling of the deleted group', () => {
  it('catches a habit stored in a different case', () => {
    // The exact case makeAddDraft produces: lowercase 'personal' written against
    // the seeded 'Personal'. Before A′ this habit kept pointing at a group that
    // no longer existed — the orphan the reassignment exists to prevent.
    // Three spellings, for the same reason the orphan sweep below takes two:
    // a one-sided fold passes whichever case happens to match already.
    seed([
      habit('h1', 'personal'),
      habit('h2', 'PERSONAL'),
      habit('h3', 'Personal'),
      habit('h4', 'Health'),
    ]);

    store().removeHabitGroup('g-personal');

    expect(containerOf('h1').group).toBe('Health');
    expect(containerOf('h2').group).toBe('Health');
    expect(containerOf('h3').group).toBe('Health');
  });

  it('leaves habits in other groups alone', () => {
    seed([habit('h1', 'personal'), habit('h3', 'Health')]);
    store().removeHabitGroup('g-personal');
    expect(containerOf('h3').group).toBe('Health');
  });
});

describe('removeProject does NOT fold — projects are compared exactly', () => {
  it('clears the exact name and leaves a case variant standing', () => {
    // Deliberate asymmetry. A project name is typed once by the user and is
    // compared exactly everywhere else; `work` and `Work` are two projects, and
    // deleting one must not silently empty the other's items.
    seed([task('t1', 'Work'), task('t2', 'work')]);

    store().removeProject('p-work');

    expect(containerOf('t1').project).toBeUndefined();
    expect(containerOf('t2').project).toBe('work');
  });
});

describe('cleanupOrphanedReferences asks the same question the rest of the app does', () => {
  /**
   * BOTH spellings, deliberately. The sweep folds twice — once building the set
   * of live names, once asking about the item — and a fixture that only differs
   * on one side pins only one of them. 'personal' against the stored 'Personal'
   * catches an unfolded SET; 'PERSONAL' catches an unfolded LOOKUP, which the
   * lowercase case cannot, because it already equals its own folded form.
   */
  it('does not call a case-variant habit group an orphan, in either direction', () => {
    seed([habit('h1', 'personal'), habit('h2', 'PERSONAL')]);
    store().cleanupOrphanedReferences();
    expect(containerOf('h1').group).toBe('personal');
    expect(containerOf('h2').group).toBe('PERSONAL');
  });

  it('still repairs a habit whose group is genuinely gone', () => {
    seed([habit('h1', 'ghost')]);
    store().cleanupOrphanedReferences();
    expect(containerOf('h1').group).toBe('Personal');
  });

  it('DOES call a case-variant project an orphan, because projects do not fold', () => {
    seed([task('t1', 'work')]);
    store().cleanupOrphanedReferences();
    expect(containerOf('t1').project).toBeUndefined();
  });
});

describe('the folded lookups still fold after moving to the registry', () => {
  it('rejects a case-variant habit group as a duplicate', () => {
    seed([]);
    store().addHabitGroup('personal', '⭐');
    expect(store().habitGroups.filter((g) => g.name.toLowerCase() === 'personal')).toHaveLength(1);
  });

  it('accepts a case-variant PROJECT as a new one', () => {
    seed([]);
    store().addProject('work', '💼');
    expect(store().projects.map((p) => p.name)).toContain('work');
  });

  it('resolves a stored group colour through any spelling', () => {
    usePlannerStore.setState({
      habitGroups: [{ id: 'g-x', name: 'Personal', emoji: '⭐', color: 'var(--picked)' }],
      projects: [{ id: 'p-x', name: 'Work', emoji: '💼', color: 'var(--picked-p)' }],
    });
    expect(store().getHabitGroupColor('personal')).toBe('var(--picked)');
    expect(store().getHabitGroupColor('PERSONAL')).toBe('var(--picked)');
    expect(store().getHabitGroupEmoji('PERSONAL')).toBe('⭐');
    // The project side does not resolve, and falls to the name-hash ramp.
    expect(store().getProjectColor('work')).not.toBe('var(--picked-p)');
  });
});

/**
 * The glyph is resolved from the group KEY, not from the label.
 *
 * A label has had its namespace thrown away, and a heading is not the only
 * thing that can be called "Morning". The live path is narrow but real: a
 * *picked* icon (`icon:Anchor`) on a project named like a priority or bucket
 * label put that icon on the grouping heading. A seeded emoji is not an icon
 * token, so it falls through to the name-derived icon either way — which is
 * why this went unnoticed and why the fixtures below pick icons explicitly.
 */
describe('GroupSection resolves its glyph from the key, not the label', () => {
  const iconOf = (el: HTMLElement) => el.querySelector('svg')?.getAttribute('class') ?? '';

  it('does not let a project named "High" decorate the Priority heading', () => {
    usePlannerStore.setState({
      projects: [{ id: 'p-high', name: 'High', emoji: 'icon:Anchor' }],
      habitGroups: [],
    });

    const { container } = render(
      <GroupSection label="High" groupKey="priority:high">
        <div />
      </GroupSection>
    );

    expect(iconOf(container)).not.toContain('lucide-anchor');
  });

  it('uses the habit group\'s icon for a group section, not a same-named project\'s', () => {
    usePlannerStore.setState({
      projects: [{ id: 'p-personal', name: 'Personal', emoji: 'icon:Anchor' }],
      habitGroups: [{ id: 'g-personal', name: 'Personal', emoji: 'icon:Star' }],
    });

    const { container } = render(
      <GroupSection label="Personal" groupKey="group:personal">
        <div />
      </GroupSection>
    );

    expect(iconOf(container)).toContain('lucide-star');
  });

  it('resolves a project section through the project namespace', () => {
    usePlannerStore.setState({
      projects: [{ id: 'p-personal', name: 'Personal', emoji: 'icon:Anchor' }],
      habitGroups: [{ id: 'g-personal', name: 'Personal', emoji: 'icon:Star' }],
    });

    const { container } = render(
      <GroupSection label="Personal" groupKey="project:Personal">
        <div />
      </GroupSection>
    );

    expect(iconOf(container)).toContain('lucide-anchor');
  });

  it('folds the group key when looking the group up', () => {
    // groupRows emits a FOLDED key (`group:personal`) while the store holds the
    // stored spelling ('Personal'), so the lookup has to fold too or every habit
    // group heading loses its picked icon.
    usePlannerStore.setState({
      projects: [],
      habitGroups: [{ id: 'g-personal', name: 'Personal', emoji: 'icon:Star' }],
    });

    const { container } = render(
      <GroupSection label="Personal" groupKey="group:personal">
        <div />
      </GroupSection>
    );

    expect(iconOf(container)).toContain('lucide-star');
  });

  it('makes no container lookup at all for a section that is not one', () => {
    // 'Habits' / 'Tasks' / 'Projects' are Day × List's own type sections, and a
    // project literally called "Tasks" must not decorate them.
    usePlannerStore.setState({
      projects: [{ id: 'p-tasks', name: 'Tasks', emoji: 'icon:Anchor' }],
      habitGroups: [],
    });

    const { container } = render(
      <GroupSection label="Tasks" groupKey="Tasks">
        <div />
      </GroupSection>
    );

    expect(iconOf(container)).not.toContain('lucide-anchor');
  });
});
