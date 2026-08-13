import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase B — `container_id` and `items.project` / `items."group"` are two
 * spellings of one fact, and every write has to move both.
 *
 * The failure this guards against is not "the id is missing" — a null id is
 * legitimate and the app reads through the name. It is a row whose NAME says
 * Work and whose ID says Wellness: nothing on any surface renders the id, so
 * the disagreement is invisible until the names are dropped, at which point
 * every such item silently changes container.
 *
 * That is why the stamp lives at the single update funnel rather than at the
 * sites that build patches, and why these tests assert the DB PATCH as well as
 * the store — an optimistic update that never reaches `container_id` looks
 * correct until reload.
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

import { usePlannerStore } from '@/lib/planner-store';
import * as db from '@/lib/db';
import type { HabitGroupType, Item, Project } from '@/lib/planner-types';

const PROJECTS: Project[] = [
  { id: 'p-work', name: 'Work', emoji: '💼' },
  { id: 'p-side', name: 'Side', emoji: '📐' },
];
const GROUPS: HabitGroupType[] = [
  { id: 'g-personal', name: 'Personal', emoji: '⭐' },
  { id: 'g-health', name: 'Health', emoji: '💚' },
];

const task = (id: string, over: Partial<Item> = {}): Item =>
  ({ type: 'task', id, title: id, status: 'pending', isScheduled: false, order: 0, ...over }) as Item;

const habit = (id: string, over: Record<string, unknown> = {}): Item =>
  ({
    type: 'habit',
    id,
    title: id,
    status: 'pending',
    repeatFrequency: 'daily',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    streak: 0,
    group: 'Personal',
    ...over,
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
const view = (id: string) =>
  store().items.find((i) => i.id === id) as unknown as {
    project?: string;
    group?: string;
    containerId?: string;
  };

/** The patch the LAST updateItem call carried. */
const lastPatch = () => {
  const calls = vi.mocked(db.updateItem).mock.calls;
  return calls[calls.length - 1]?.[2] as Record<string, unknown> | undefined;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateTask moves both halves', () => {
  it('resolves the id from the name and sends both to the DB', () => {
    seed([task('t1')]);

    store().updateTask('t1', { project: 'Work' });

    expect(view('t1').containerId).toBe('p-work');
    // The DB half, which the optimistic update cannot vouch for.
    expect(lastPatch()).toMatchObject({ project: 'Work', containerId: 'p-work' });
  });

  it('clears the id when the container is cleared', () => {
    // `'project' in updates` rather than a truthiness test — clearing is a real
    // gesture, and a truthy check would leave the old id behind.
    seed([task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>)]);

    store().updateTask('t1', { project: undefined });

    expect(view('t1').containerId).toBeUndefined();
    expect(lastPatch()).toHaveProperty('containerId', undefined);
  });

  it('leaves the id alone when the patch says nothing about the container', () => {
    seed([task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>)]);

    store().updateTask('t1', { title: 'renamed' });

    expect(view('t1').containerId).toBe('p-work');
    expect(lastPatch()).not.toHaveProperty('containerId');
  });

  it('drops the id for a name no container answers to', () => {
    // Rather than leaving the previous id in place, which would invent a
    // reference the name never had.
    seed([task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>)]);

    store().updateTask('t1', { project: 'Ghost' });

    expect(view('t1').project).toBe('Ghost');
    expect(view('t1').containerId).toBeUndefined();
  });
});

describe('updateHabit resolves through the case policy', () => {
  it('matches a lowercase group against the stored spelling', () => {
    // makeAddDraft writes 'personal' against the seeded 'Personal'. If the
    // resolution here did not fold, exactly those habits would carry a name
    // with no id — and the backfill, which DOES fold, would disagree.
    seed([habit('h1')]);

    store().updateHabit('h1', { group: 'personal' });

    expect(view('h1').containerId).toBe('g-personal');
    expect(lastPatch()).toMatchObject({ group: 'personal', containerId: 'g-personal' });
  });

  it('does not fold a project name the same way', () => {
    seed([task('t1')]);
    store().updateTask('t1', { project: 'work' });
    expect(view('t1').containerId).toBeUndefined();
  });
});

describe('creation stamps the id too', () => {
  it('resolves a project at add time', () => {
    // Not after the set(): the optimistic item and the row createItem writes are
    // the same object.
    seed([]);

    store().addTask({ title: 'new', project: 'Work' } as never);

    const created = store().items.find((i) => i.title === 'new') as unknown as {
      containerId?: string;
    };
    expect(created.containerId).toBe('p-work');
    expect(vi.mocked(db.createItem).mock.calls[0]?.[1]).toMatchObject({ containerId: 'p-work' });
  });

  it('resolves a habit group at add time, folded', () => {
    seed([]);
    store().addHabit({ title: 'newh', group: 'personal', repeatFrequency: 'daily' } as never);
    const created = store().items.find((i) => i.title === 'newh') as unknown as {
      containerId?: string;
    };
    expect(created.containerId).toBe('g-personal');
  });
});

describe('the repair sweeps move both halves', () => {
  it('removeProject clears the id as well as the name', () => {
    seed([task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>)]);

    store().removeProject('p-work');

    expect(view('t1').project).toBeUndefined();
    expect(view('t1').containerId).toBeUndefined();
  });

  it('removeHabitGroup takes the fallback row\'s id, not just its name', () => {
    seed([habit('h1', { group: 'personal', containerId: 'g-personal' })]);

    store().removeHabitGroup('g-personal');

    expect(view('h1').group).toBe('Health');
    expect(view('h1').containerId).toBe('g-health');
  });

  it('cleanupOrphanedReferences clears both for a dead project', () => {
    seed([task('t1', { project: 'Ghost', containerId: 'p-dead' } as Partial<Item>)]);
    store().cleanupOrphanedReferences();
    expect(view('t1').project).toBeUndefined();
    expect(view('t1').containerId).toBeUndefined();
  });
});

describe('renaming a container carries its items', () => {
  it('rewrites the name mirror and persists it', () => {
    // The parked limitation this phase unparks: before container_id, renaming
    // 'Work' left every task pointing at a string that named nothing.
    seed([
      task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>),
      task('t2', { project: 'Side', containerId: 'p-side' } as Partial<Item>),
    ]);

    store().updateProject('p-work', { name: 'Client Work' });

    expect(view('t1').project).toBe('Client Work');
    expect(view('t1').containerId).toBe('p-work');
    expect(view('t2').project).toBe('Side');
    // In-session is not enough — a reload re-reads the row.
    expect(vi.mocked(db.updateItem).mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['t1', { project: 'Client Work', containerId: 'p-work' }],
    ]);
  });

  it('catches an item the backfill has not reached, by name', () => {
    seed([task('t1', { project: 'Work' } as Partial<Item>)]);
    store().updateProject('p-work', { name: 'Client Work' });
    expect(view('t1').project).toBe('Client Work');
    // ...and gives it the id on the way through.
    expect(view('t1').containerId).toBe('p-work');
  });

  it('follows the ID when the name mirror has drifted', () => {
    // ID first, name second. This item's name is stale; the id is the truth.
    seed([task('t1', { project: 'Stale', containerId: 'p-work' } as Partial<Item>)]);
    store().updateProject('p-work', { name: 'Client Work' });
    expect(view('t1').project).toBe('Client Work');
  });

  it('does not sweep up another container\'s items when renaming ONTO its name', () => {
    // This pins the match against the OLD name, not the new one. Renaming
    // 'Work' to 'Side' must not collect the real Side's tasks — which is what
    // `sameContainerName(kind, held, newName)` would do, and it is an easy
    // slip because both strings are in scope. (The id-first ORDER is pinned by
    // the drifted-mirror case above, not by this one.)
    // t2 deliberately carries NO containerId: with one it takes the id branch
    // and never reaches the name comparison this is about, which is how the
    // first version of this test passed under the very mutation it names.
    seed([
      task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>),
      task('t2', { project: 'Side' } as Partial<Item>),
    ]);

    store().updateProject('p-work', { name: 'Side' });

    expect(view('t2').containerId).toBeUndefined();
    expect(vi.mocked(db.updateItem).mock.calls.map((c) => c[0])).toEqual(['t1']);
  });

  it('leaves items alone when the edit is not a rename', () => {
    seed([task('t1', { project: 'Work', containerId: 'p-work' } as Partial<Item>)]);
    store().updateProject('p-work', { emoji: 'icon:Star' });
    expect(vi.mocked(db.updateItem)).not.toHaveBeenCalled();
  });

  it('renames a habit group, folding the stale spelling', () => {
    // `group` is non-optional on the wire, so a stranded habit does not merely
    // lose a category — it names a group that does not exist.
    seed([habit('h1', { group: 'personal' }), habit('h2', { group: 'Health' })]);

    store().updateHabitGroup('g-personal', { name: 'Me Time' });

    expect(view('h1').group).toBe('Me Time');
    expect(view('h1').containerId).toBe('g-personal');
    expect(view('h2').group).toBe('Health');
  });

  it('does not cross the axis: a project rename never touches habits', () => {
    seed([habit('h1', { group: 'Work', containerId: 'g-x' })]);
    store().updateProject('p-work', { name: 'Client Work' });
    expect(view('h1').group).toBe('Work');
  });
});

// The containerId → container_id column mapping is pinned in
// tests/unit/db-allowlists.test.ts, which does not mock @/lib/db. It cannot live
// here: this file mocks the whole module to observe the writes.
