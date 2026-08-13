import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Container ids — migration 027, plan Phase 0
 * (memory/plans/organize-console.md).
 *
 * `items.project` / `items."group"` were NAME references, so renaming a
 * container silently emptied it: every member kept the old string with nothing
 * left to resolve it by. The id is what survives the rename; the name stays
 * authoritative for display, because the permanent legacy projection has to
 * emit a name and a uuid would still `safeParse` past it.
 *
 * These drive the REAL store against a mocked db layer, the same harness
 * undo-redo-store.test.ts uses — the fan-out has a store half and a DB half and
 * they can fail independently, so both are asserted.
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
  renameContainerMembers: vi.fn(async () => {}),
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

const USER = 'user-1';
const store = () => usePlannerStore.getState();

const PROJECT: Project = { id: 'pr-work', name: 'Work', emoji: 'icon:Briefcase' };
const GROUP: HabitGroupType = { id: 'gr-well', name: 'Wellness', emoji: '⭐' };

const items = (): Item[] => [
  {
    type: 'task',
    id: 'task-member',
    title: 'Filed under Work',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
    project: 'Work',
    projectId: 'pr-work',
  },
  {
    // Names the same project but carries no id — one of the 12 rows on the live
    // database that name a project with no row at all. It must NOT follow a
    // rename: it is not a member, it merely shares a string.
    type: 'task',
    id: 'task-stranger',
    title: 'Says Work, belongs to nothing',
    status: 'pending',
    isScheduled: false,
    order: 1,
    completedDates: [],
    project: 'Work',
  },
  {
    type: 'habit',
    id: 'habit-member',
    title: 'Stretch',
    group: 'Wellness',
    groupId: 'gr-well',
    streak: 0,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    repeatFrequency: 'daily',
  },
];

const find = (id: string) => store().items.find((i) => i.id === id)!;

type AddTaskArg = Parameters<ReturnType<typeof usePlannerStore.getState>['addTask']>[0];
type AddHabitArg = Parameters<ReturnType<typeof usePlannerStore.getState>['addHabit']>[0];

beforeEach(async () => {
  store().clearStore();
  vi.clearAllMocks();
  vi.mocked(db.fetchItems).mockResolvedValue(items());
  vi.mocked(db.fetchProjects).mockResolvedValue([PROJECT]);
  vi.mocked(db.fetchHabitGroups).mockResolvedValue([GROUP]);
  await store().initializeStore(USER);
});

describe('renaming a container fans the new name out to its members', () => {
  it('moves the name on members, keyed by id', async () => {
    store().updateProject('pr-work', { name: 'Deep Work' });
    expect((find('task-member') as { project?: string }).project).toBe('Deep Work');
    // Awaited, because the DB fan-out is CHAINED onto the container write
    // rather than fired beside it — a 23505 on the container (a rename onto a
    // trashed name, which takenBy cannot see) must not leave the members
    // rewritten. A synchronous assertion here would pass on either wiring.
    await Promise.resolve();
    expect(db.renameContainerMembers).toHaveBeenCalledWith(
      USER, 'project_id', 'pr-work', 'Deep Work'
    );
  });

  it('does NOT fan out when the container write fails', async () => {
    // The whole reason the two are chained. takenBy only sees live containers,
    // so a rename onto a soft-deleted project's name reaches the DB and raises
    // 23505 there; the member fan-out touches no unique index and would happily
    // succeed on its own, leaving the container named one thing and all of its
    // items another.
    vi.mocked(db.updateProject).mockRejectedValueOnce(new Error('23505'));
    store().updateProject('pr-work', { name: 'Trashed Name' });
    await Promise.resolve();
    await Promise.resolve();
    expect(db.renameContainerMembers).not.toHaveBeenCalled();
  });

  it('leaves a same-named non-member alone', () => {
    // The reason the fan-out is keyed on the id rather than the old name: a
    // name-keyed UPDATE would drag every unrelated row that happens to hold the
    // string into a project it was never in.
    store().updateProject('pr-work', { name: 'Deep Work' });
    expect((find('task-stranger') as { project?: string }).project).toBe('Work');
  });

  it('does not fan out when the name did not change', () => {
    // Emoji and colour edits arrive through the same action, and an unguarded
    // fan-out would issue a pointless full-table UPDATE on every one of them.
    store().updateProject('pr-work', { emoji: 'icon:Rocket' });
    expect(db.renameContainerMembers).not.toHaveBeenCalled();
    store().updateProject('pr-work', { name: 'Work' });
    expect(db.renameContainerMembers).not.toHaveBeenCalled();
  });

  it('does the same for habit groups', async () => {
    store().updateHabitGroup('gr-well', { name: 'Health' });
    expect((find('habit-member') as { group?: string }).group).toBe('Health');
    await Promise.resolve();
    expect(db.renameContainerMembers).toHaveBeenCalledWith(
      USER, 'group_id', 'gr-well', 'Health'
    );
  });

  it('undo puts the members back, not just the container', () => {
    // The fan-out shares ONE set() with the rename, so both halves land in a
    // single history snapshot. Split across two, undo would restore the old
    // container name while every member kept the new one — the orphaning bug
    // reintroduced through the back door.
    store().updateProject('pr-work', { name: 'Deep Work' });
    store().undo();
    expect(store().projects[0].name).toBe('Work');
    expect((find('task-member') as { project?: string }).project).toBe('Work');
  });
});

describe('a name write resolves the id', () => {
  it('files a task by name and stores the id alongside', () => {
    store().addTask({ title: 'New', project: 'Work' } as AddTaskArg);
    const added = store().items.find((i) => i.title === 'New') as { projectId?: string };
    expect(added.projectId).toBe('pr-work');
  });

  it('re-filing moves the id with the name', () => {
    store().updateTask('task-stranger', { project: 'Work' });
    expect((find('task-stranger') as { projectId?: string }).projectId).toBe('pr-work');
  });

  it('unfiling clears BOTH halves', () => {
    // A cleared name with a live id left behind would follow the container's
    // next rename straight back into a project the user had taken it out of.
    store().updateTask('task-member', { project: undefined });
    const item = find('task-member') as { project?: string; projectId?: string };
    expect(item.project).toBeUndefined();
    expect(item.projectId).toBeUndefined();
  });

  it('leaves the id undefined when the name matches no container', () => {
    // Inventing a link here would file the item under whatever container is
    // created with that name next.
    store().updateTask('task-member', { project: 'Housework' });
    expect((find('task-member') as { projectId?: string }).projectId).toBeUndefined();
  });

  it('files a habit by name and stores the id alongside', () => {
    store().addHabit({ title: 'New habit', group: 'Wellness', repeatFrequency: 'daily' } as AddHabitArg);
    const added = store().items.find((i) => i.title === 'New habit') as { groupId?: string };
    expect(added.groupId).toBe('gr-well');
  });

  it('resolves a habit group case-insensitively, as the group surfaces do', () => {
    // The habit starts on gr-well, so the assertion is that the id MOVED. An
    // earlier version of this test asserted it was still 'gr-well' — the value
    // the fixture already held — and stayed green with the whole resolution
    // deleted.
    store().addHabitGroup('Focus', '🎯');
    const focus = store().habitGroups.find((g) => g.name === 'Focus')!;
    store().updateHabit('habit-member', { group: 'focus' });
    expect((find('habit-member') as { groupId?: string }).groupId).toBe(focus.id);
  });
});

describe('deleting a container', () => {
  it('unfiles members by id and by name, clearing both halves', () => {
    store().removeProject('pr-work');
    for (const id of ['task-member', 'task-stranger']) {
      const item = find(id) as { project?: string; projectId?: string };
      expect(item.project).toBeUndefined();
      expect(item.projectId).toBeUndefined();
    }
  });

  it('reassigns habits to the destination row, id included', () => {
    store().addHabitGroup('Focus', '🎯');
    const dest = store().habitGroups.find((g) => g.name === 'Focus')!;
    store().removeHabitGroup('gr-well');
    const moved = find('habit-member') as { group?: string; groupId?: string };
    expect(moved.group).toBe('Focus');
    expect(moved.groupId).toBe(dest.id);
  });

  it('falls back to a bare “Personal” name with no id when no row remains', () => {
    // The account the migration found with 223 habits and ZERO habit_groups
    // rows: the fallback names a group that does not exist, so claiming an id
    // for it would be a lie the FK would reject.
    store().removeHabitGroup('gr-well');
    const moved = find('habit-member') as { group?: string; groupId?: string };
    expect(moved.group).toBe('Personal');
    expect(moved.groupId).toBeUndefined();
  });
});
