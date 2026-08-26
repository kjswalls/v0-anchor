import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same fully-mocked db layer as undo-redo-store.test.ts: these tests drive the
// real Zustand store, including the module-level history subscriber, so the
// one-set/one-undo contract is exercised for real rather than asserted about.

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
  // The rename fan-out (migration 027) — updateProject/updateHabitGroup call it
  // whenever the name actually changes.
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
  fetchGoals: vi.fn(async () => []),
  createGoal: vi.fn(async () => {}),
  updateGoal: vi.fn(async () => {}),
  deleteGoal: vi.fn(async () => {}),
  restoreGoal: vi.fn(async () => {}),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));

import { usePlannerStore } from '@/lib/planner-store';
import * as db from '@/lib/db';
import type { Item, Proposal, ProposalOperation } from '@/lib/planner-types';

const USER = 'user-1';
const store = () => usePlannerStore.getState();

const fixtures = (): Item[] => [
  {
    type: 'task',
    id: 'task-1',
    title: 'Email Dana',
    status: 'pending',
    isScheduled: false,
    order: 0,
    startDate: '2026-07-20',
    completedDates: [],
  },
  {
    type: 'task',
    id: 'task-2',
    title: 'Renew passport',
    status: 'pending',
    isScheduled: false,
    order: 1,
    startDate: '2026-07-22',
    completedDates: [],
  },
  {
    type: 'habit',
    id: 'habit-1',
    title: 'Stretch',
    group: 'Personal',
    streak: 3,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    repeatFrequency: 'daily',
  },
];

const proposalOf = (...operations: ProposalOperation[]): Proposal => ({
  id: 'p1',
  summary: 'A lighter Tuesday',
  createdAt: '2026-07-31T09:00:00.000Z',
  operations,
});

beforeEach(async () => {
  store().clearStore();
  vi.clearAllMocks();
  vi.mocked(db.fetchItems).mockResolvedValue(fixtures());
  await store().initializeStore(USER);
});

describe('applyProposal', () => {
  it('applies updates and creates together and reports the count', () => {
    const applied = store().applyProposal(
      proposalOf(
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
        { kind: 'update', itemId: 'task-2', startDate: '2026-08-07', priority: 'high' },
        { kind: 'create', itemType: 'task', title: 'Book dentist', startDate: '2026-08-06' },
      ),
    );

    expect(applied).toBe(3);
    const byId = new Map(store().items.map((i) => [i.id, i]));
    expect(byId.get('task-1')).toMatchObject({ startDate: '2026-08-06' });
    expect(byId.get('task-2')).toMatchObject({ startDate: '2026-08-07', priority: 'high' });
    expect(store().tasks.some((t) => t.title === 'Book dentist')).toBe(true);
  });

  it('is ONE undo for the whole plan', () => {
    store().applyProposal(
      proposalOf(
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
        { kind: 'update', itemId: 'task-2', startDate: '2026-08-07' },
        { kind: 'create', itemType: 'task', title: 'Book dentist' },
      ),
    );
    expect(store().tasks).toHaveLength(3);

    store().undo();

    const byId = new Map(store().items.map((i) => [i.id, i]));
    expect(byId.get('task-1')).toMatchObject({ startDate: '2026-07-20' });
    expect(byId.get('task-2')).toMatchObject({ startDate: '2026-07-22' });
    expect(store().tasks).toHaveLength(2);
    // One gesture in, one gesture out — nothing left to undo.
    expect(store().canUndo).toBe(false);
  });

  it('undo removes created items from the db too, not just from memory', () => {
    store().applyProposal(proposalOf({ kind: 'create', itemType: 'task', title: 'Book dentist' }));
    const created = store().tasks.find((t) => t.title === 'Book dentist')!;

    store().undo();

    expect(db.deleteItem).toHaveBeenCalledWith(created.id, 'task');
  });

  it('labels the history entry with the proposal summary', () => {
    store().applyProposal(proposalOf({ kind: 'update', itemId: 'task-1', startDate: '2026-08-06' }));
    expect(store().actionLog[0].label).toBe('Accept plan: A lighter Tuesday');
  });

  it('persists creates and updates through the db layer', () => {
    store().applyProposal(
      proposalOf(
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
        { kind: 'create', itemType: 'task', title: 'Book dentist' },
      ),
    );

    expect(db.updateItem).toHaveBeenCalledWith(
      'task-1',
      'task',
      expect.objectContaining({ startDate: '2026-08-06' }),
    );
    expect(db.createItem).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ title: 'Book dentist', type: 'task', status: 'pending' }),
    );
  });

  it('re-validates at the boundary: a stale operation is dropped, the rest applies', () => {
    // The card could have been rendered before the item was deleted.
    store().deleteTask('task-2');
    const applied = store().applyProposal(
      proposalOf(
        { kind: 'update', itemId: 'task-2', startDate: '2026-08-07' },
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
      ),
    );
    expect(applied).toBe(1);
    expect(store().items.find((i) => i.id === 'task-1')).toMatchObject({
      startDate: '2026-08-06',
    });
  });

  it('applies nothing — and writes no history — when every operation is invalid', () => {
    const before = store().actionLog.length;
    const applied = store().applyProposal(
      proposalOf({ kind: 'update', itemId: 'ghost', title: 'x' }),
    );
    expect(applied).toBe(0);
    expect(store().actionLog).toHaveLength(before);
    expect(db.updateItem).not.toHaveBeenCalled();
  });

  it('gives consecutive creates distinct order values', () => {
    store().applyProposal(
      proposalOf(
        { kind: 'create', itemType: 'task', title: 'One' },
        { kind: 'create', itemType: 'task', title: 'Two' },
      ),
    );
    const orders = store()
      .tasks.filter((t) => t.title === 'One' || t.title === 'Two')
      .map((t) => t.order);
    expect(new Set(orders).size).toBe(2);
  });

  it('merges two operations targeting the same item into one patch', () => {
    store().applyProposal(
      proposalOf(
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
        { kind: 'update', itemId: 'task-1', priority: 'high' },
      ),
    );
    expect(store().items.find((i) => i.id === 'task-1')).toMatchObject({
      startDate: '2026-08-06',
      priority: 'high',
    });
  });

  it('auto-corrects the bucket when a start time is proposed', () => {
    store().applyProposal(
      proposalOf({ kind: 'update', itemId: 'task-1', startTime: '14:00', timeBucket: 'morning' }),
    );
    expect(store().items.find((i) => i.id === 'task-1')).toMatchObject({
      timeBucket: 'afternoon',
    });
  });

  it('never writes a habit a task-shaped status', () => {
    const applied = store().applyProposal(
      proposalOf({ kind: 'update', itemId: 'habit-1', status: 'completed' }),
    );
    expect(applied).toBe(0);
    expect(store().habits[0].status).toBe('pending');
  });
});

describe('applyProposal — breakdown', () => {
  const stepsUnder = (parentItemId: string, ...titles: string[]) =>
    proposalOf(
      ...titles.map(
        (title) =>
          ({ kind: 'create', itemType: 'task', title, parentItemId }) as ProposalOperation
      )
    );

  it('creates the steps parented to the item', () => {
    const applied = store().applyProposal(
      stepsUnder('task-1', 'Draft the outline', 'Send it to Dana')
    );
    expect(applied).toBe(2);

    const children = store().items.filter(
      (i) => 'parentItemId' in i && i.parentItemId === 'task-1'
    );
    expect(children.map((c) => c.title)).toEqual(['Draft the outline', 'Send it to Dana']);
  });

  it('keeps the steps out of the grid', () => {
    // The tasks projection excludes subtasks, which is the whole reason they
    // may not be scheduled — nothing outside the parent's panel renders one.
    const before = store().tasks.length;
    store().applyProposal(stepsUnder('task-1', 'Draft the outline'));
    expect(store().tasks).toHaveLength(before);
  });

  it('persists the parent link', () => {
    store().applyProposal(stepsUnder('task-1', 'Draft the outline'));
    const created = vi.mocked(db.createItem).mock.calls.at(-1)?.[1] as { parentItemId?: string };
    expect(created.parentItemId).toBe('task-1');
  });

  it('undoes the whole breakdown in one step', () => {
    // Accepting a proposal is one gesture and must reverse like one — the same
    // contract every other batched verb holds.
    const before = store().items.length;
    store().applyProposal(stepsUnder('task-1', 'one', 'two', 'three'));
    expect(store().items).toHaveLength(before + 3);

    store().undo();
    expect(store().items).toHaveLength(before);
  });

  it('leaves ordinary creates unparented', () => {
    store().applyProposal(
      proposalOf({ kind: 'create', itemType: 'task', title: 'A normal task' } as ProposalOperation)
    );
    const created = store().items.find((i) => i.title === 'A normal task')!;
    expect('parentItemId' in created ? created.parentItemId : undefined).toBeUndefined();
  });

  it('refuses to nest, so a step of a step is never written', () => {
    store().applyProposal(stepsUnder('task-1', 'Draft the outline'));
    const child = store().items.find((i) => i.title === 'Draft the outline')!;

    const applied = store().applyProposal(stepsUnder(child.id, 'A sub-step'));
    expect(applied).toBe(0);
    expect(store().items.find((i) => i.title === 'A sub-step')).toBeUndefined();
  });
});
