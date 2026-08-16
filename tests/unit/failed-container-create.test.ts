import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A container create the DATABASE REFUSED, and the phantom it used to leave.
 *
 * `projects_user_id_name_key` and `habit_groups_user_id_name_key` are PLAIN
 * unique indexes over `(user_id, name)` — no `WHERE deleted_at IS NULL` — so a
 * soft-deleted container reserves its name for the full 30 days while being
 * invisible to the store, whose arrays come from `deleted_at`-filtered fetches.
 * The `alreadyExists` guard therefore cannot see the row about to reject the
 * insert, and the insert used to fail into a bare `.catch(console.error)` after
 * the optimistic `set()` had already landed.
 *
 * The result was worse than a missing container: `items_project_id_fkey` is a
 * COMPOSITE key, so any item filed into the phantom had its OWN insert rejected
 * in full. The item dialog's inline "new project" is the sharp end — you lose
 * the project and the task you were writing, silently.
 *
 * The console's create rows refuse trashed names with a sentence, which is the
 * good path. This is the NET under it: it covers the item dialog, the command
 * palette and anything added later, and it has to leave no trace in history.
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
  itemDbType: (item: { type: string; customType?: string }) =>
    item.type === 'custom' ? item.customType : item.type,
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { usePlannerStore } from '@/lib/planner-store';
import * as db from '@/lib/db';

const USER = 'user-1';
const store = () => usePlannerStore.getState();
const labels = () => store().actionLog.map((a) => a.label);

/** 23505 as PostgREST reports it. */
const duplicate = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
});

/** Let the rejected promise's .catch run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  store().clearStore();
  vi.clearAllMocks();
  toastError.mockClear();
  vi.mocked(db.fetchItems).mockResolvedValue([]);
  vi.mocked(db.createProject).mockResolvedValue(undefined);
  vi.mocked(db.createHabitGroup).mockResolvedValue(undefined);
  await store().initializeStore(USER);
});

describe('a create the database accepts', () => {
  it('is untouched — the row stays and the history entry stands', async () => {
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    expect(store().projects.map((p) => p.name)).toEqual(['Work']);
    expect(labels()[0]).toBe('Add project: Work');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('names a habit group create, which used to log as "Unknown action"', async () => {
    store().addHabitGroup('Wellness', 'icon:Heart');
    await settle();
    expect(labels()[0]).toBe('Add habit group: Wellness');
  });
});

describe('a create the database REFUSES', () => {
  beforeEach(() => {
    vi.mocked(db.createProject).mockRejectedValue(duplicate);
    vi.mocked(db.createHabitGroup).mockRejectedValue(duplicate);
  });

  it('takes the phantom back out of the store', async () => {
    store().addProject('Work', 'icon:Briefcase');
    expect(store().projects).toHaveLength(1); // optimistic, as before

    await settle();

    expect(store().projects).toEqual([]);
  });

  it('says so, and names the trash — every other failure mode here is silent', async () => {
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    expect(toastError).toHaveBeenCalledTimes(1);
    const said = toastError.mock.calls[0][0] as string;
    expect(said).toContain('Work');
    expect(said).toContain('Trash');
  });

  it('leaves NO history entry — not the create, and not an "Unknown action"', async () => {
    // The rollback is not a user action. A bare set() here would push a second
    // entry the pending label had already been spent on, and the create's own
    // entry would stand for something that never happened.
    const before = labels();
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    expect(labels()).toEqual(before);
    expect(labels()).not.toContain('Unknown action');
    expect(labels()).not.toContain('Add project: Work');
  });

  it('⌘Z after a refused create undoes the PREVIOUS action, not the phantom', async () => {
    vi.mocked(db.createProject).mockResolvedValueOnce(undefined);
    store().addProject('Real', 'icon:Star');
    await settle();

    vi.mocked(db.createProject).mockRejectedValue(duplicate);
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    store().undo();

    // "Real" is what goes; the refused "Work" was never in history to undo.
    expect(store().projects).toEqual([]);
  });

  it('redo cannot resurrect the phantom', async () => {
    // The whole reason the entry is dropped rather than left behind:
    // syncContainers reads "present in the restored snapshot, absent from
    // current" as a RESTORE and puts the row straight back — this time with no
    // failing write underneath to heal it.
    vi.mocked(db.createProject).mockResolvedValueOnce(undefined);
    store().addProject('Real', 'icon:Star');
    await settle();

    vi.mocked(db.createProject).mockRejectedValue(duplicate);
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    store().undo();
    store().redo();

    expect(store().projects.map((p) => p.name)).toEqual(['Real']);
  });

  it('rolls a habit group back the same way', async () => {
    store().addHabitGroup('Wellness', 'icon:Heart');
    await settle();

    expect(store().habitGroups).toEqual([]);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toContain('habit group');
  });

  it('THE POINT: an item created in the window survives, container-less', async () => {
    // Before the rollback, projectIdFor resolved the phantom's id and the
    // item's own INSERT was rejected by the composite items_project_id_fkey —
    // so the user lost the task as well as the project. With the phantom gone
    // the resolution misses, and the item is saved unfiled instead of not at
    // all. A task with no project beats no task.
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    store().addTask({ title: 'Write it up', project: 'Work' } as never);

    const created = vi.mocked(db.createItem).mock.calls.at(-1)?.[1] as
      | { projectId?: string }
      | undefined;
    expect(created).toBeDefined();
    expect(created!.projectId).toBeUndefined();
  });

  it('keeps the undo flags honest after the rollback', async () => {
    vi.mocked(db.createProject).mockResolvedValueOnce(undefined);
    store().addProject('Real', 'icon:Star');
    await settle();
    const canUndoAfterReal = store().canUndo;

    vi.mocked(db.createProject).mockRejectedValue(duplicate);
    store().addProject('Work', 'icon:Briefcase');
    await settle();

    // The refused create must not have moved the user's position in history.
    expect(store().canUndo).toBe(canUndoAfterReal);
    expect(store().canRedo).toBe(false);
  });

  it('does not desynchronise the stack if the user UNDID during the round trip', async () => {
    // The other half of the guard, and the subtler one. `undo()` moves
    // historyIndex back but leaves the stack and the log intact — so the failed
    // create is still the TOP entry by id, and an id-only check would happily
    // pop it. Popping while the index sits behind the top breaks the invariant
    // that historyIndex names the snapshot the store currently holds, and the
    // damage shows up one keystroke later: the NEXT ⌘Z skips a step.
    vi.mocked(db.createProject).mockResolvedValueOnce(undefined);
    store().addProject('Real', 'icon:Star');
    await settle();
    vi.mocked(db.createProject).mockResolvedValueOnce(undefined);
    store().addProject('Second', 'icon:Star');
    await settle();

    let reject: (e: unknown) => void = () => {};
    vi.mocked(db.createProject).mockReturnValueOnce(
      new Promise((_, r) => {
        reject = r;
      })
    );
    store().addProject('Work', 'icon:Briefcase');

    store().undo();
    expect(store().projects.map((p) => p.name)).toEqual(['Real', 'Second']);

    reject(duplicate);
    await settle();

    // One more step back lands on "Real" alone. Drop the entry from under a
    // moved index and this jumps all the way to empty instead.
    store().undo();
    expect(store().projects.map((p) => p.name)).toEqual(['Real']);
  });

  it('does not drop someone else’s history entry if the user acted meanwhile', async () => {
    // A round trip has passed. If the user has done something in the window,
    // the failed create is no longer the top of the stack and the rollback must
    // leave history alone rather than eat the wrong entry.
    let reject: (e: unknown) => void = () => {};
    vi.mocked(db.createProject).mockReturnValueOnce(
      new Promise((_, r) => {
        reject = r;
      })
    );
    store().addProject('Work', 'icon:Briefcase');

    vi.mocked(db.createHabitGroup).mockResolvedValue(undefined);
    store().addHabitGroup('Wellness', 'icon:Heart');
    await settle();

    reject(duplicate);
    await settle();

    // The phantom is still rolled out of the store…
    expect(store().projects).toEqual([]);
    // …and the group's entry, which arrived after it, is untouched.
    expect(labels()).toContain('Add habit group: Wellness');
  });
});
