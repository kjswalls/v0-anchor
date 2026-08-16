import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The WRITE half of first-run seeding.
 *
 * `planSeed` decides what should exist; this decides whether to commit it, and
 * the guards here are the ones standing between a load-window race and a second
 * starter set in someone's account. The plan is computed across three awaits —
 * the latch read, the guard re-check, the bin read — and Supabase re-emits
 * SIGNED_IN on every hidden→visible transition, so "the store changed under the
 * plan" is an ordinary event rather than a freak one.
 */

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  fetchRoutines: vi.fn(async () => []),
  fetchPrograms: vi.fn(async () => []),
  createItem: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  createProject: vi.fn(async () => {}),
  updateProject: vi.fn(async () => {}),
  deleteProject: vi.fn(async () => {}),
  createHabitGroup: vi.fn(async () => {}),
  updateHabitGroup: vi.fn(async () => {}),
  deleteHabitGroup: vi.fn(async () => {}),
  renameContainerMembers: vi.fn(async () => {}),
  adoptContainerMembers: vi.fn(async () => 0),
  itemDbType: (item: { type: string; customType?: string }) =>
    item.type === 'custom' ? item.customType : item.type,
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { usePlannerStore } from '@/lib/planner-store';
import { planSeed, type SeedPlan } from '@/lib/seed-containers';
import * as db from '@/lib/db';
import type { Item } from '@/lib/planner-types';

const store = () => usePlannerStore.getState();
const settle = () => new Promise((r) => setTimeout(r, 0));

const habit = (over: Partial<Item> = {}): Item =>
  ({
    id: 'h1', type: 'habit', title: 'Stretch', status: 'pending', repeatFrequency: 'daily',
    completedDates: [], skippedDates: [], streak: 0, group: 'Personal', order: 0, isScheduled: false,
    ...over,
  }) as Item;

const FULL: SeedPlan = planSeed({ items: [], projects: [], habitGroups: [] });

beforeEach(async () => {
  store().clearStore();
  vi.clearAllMocks();
  vi.mocked(db.fetchItems).mockResolvedValue([]);
  vi.mocked(db.fetchProjects).mockResolvedValue([]);
  vi.mocked(db.fetchHabitGroups).mockResolvedValue([]);
  await store().initializeStore('user-1');
});

describe('seedStarterContainers', () => {
  it('creates the plan, and writes it', async () => {
    store().seedStarterContainers(FULL);
    await settle();

    expect(store().projects.map((p) => p.name)).toEqual(['Work', 'Home', 'Health']);
    expect(store().habitGroups.map((g) => g.name)).toEqual(['Morning', 'Movement', 'Wind-down']);
    expect(vi.mocked(db.createProject)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(db.createHabitGroup)).toHaveBeenCalledTimes(3);
  });

  it('mints a fresh id per row, never a constant baked into the module', () => {
    // An id in the seed constant would be the same uuid in every account.
    store().seedStarterContainers(FULL);
    const ids = [...store().projects, ...store().habitGroups].map((c) => c.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true);
  });

  it('is ONE undo entry, not six', async () => {
    /**
     * Six addProject calls would work and would be wrong: a brand-new account
     * would open its history popover already listing six actions the user did
     * not perform, and the first ⌘Z would delete one starter container while
     * leaving five.
     */
    const before = store().actionLog.length;
    store().seedStarterContainers(FULL);
    await settle();

    expect(store().actionLog.length).toBe(before + 1);
    expect(store().actionLog[0].label).toBe('Add starter containers');

    store().undo();
    expect(store().projects).toEqual([]);
    expect(store().habitGroups).toEqual([]);
  });

  it('says ADOPT when that is what it is doing', async () => {
    vi.mocked(db.fetchItems).mockResolvedValue([habit()]);
    await store().initializeStore('user-1');
    store().seedStarterContainers(
      planSeed({ items: [habit()], projects: [], habitGroups: [] })
    );
    expect(store().actionLog[0].label).toBe('Add missing containers');
  });
});

describe('the guards, which are what stand between a race and a duplicate set', () => {
  it('refuses once the account has containers — the plan may be stale', async () => {
    // Three awaits happen between planning and committing, and a tab switch
    // re-enters the whole load. This is the check that a fetch resolving in
    // between cannot become a second starter set.
    usePlannerStore.setState({ projects: [{ id: 'p1', name: 'Existing', emoji: '' }] } as never);
    store().seedStarterContainers(FULL);
    await settle();

    expect(store().projects.map((p) => p.name)).toEqual(['Existing']);
    expect(vi.mocked(db.createProject)).not.toHaveBeenCalled();
  });

  it('refuses on a habit group alone, not just a project', async () => {
    usePlannerStore.setState({ habitGroups: [{ id: 'g1', name: 'Existing', emoji: '' }] } as never);
    store().seedStarterContainers(FULL);
    await settle();
    expect(store().projects).toEqual([]);
    expect(vi.mocked(db.createHabitGroup)).not.toHaveBeenCalled();
  });

  it('refuses mid-load, because initializeStore replaces the arrays wholesale', async () => {
    // The documented trap: anything written inside the load window is silently
    // discarded when the fetch resolves. Seeding there means the user believes
    // they have containers until the next reload proves otherwise.
    usePlannerStore.setState({ isLoading: true } as never);
    store().seedStarterContainers(FULL);
    await settle();
    expect(store().projects).toEqual([]);
    expect(vi.mocked(db.createProject)).not.toHaveBeenCalled();
  });

  it('refuses with no userId, rather than seating rows nothing will persist', async () => {
    usePlannerStore.setState({ userId: null } as never);
    store().seedStarterContainers(FULL);
    await settle();
    expect(store().projects).toEqual([]);
  });

  it('writes nothing at all for an empty plan, including a history entry', async () => {
    const before = store().actionLog.length;
    store().seedStarterContainers({ reason: 'adopt', projects: [], groups: [] });
    await settle();
    expect(store().actionLog.length).toBe(before);
    expect(vi.mocked(db.createProject)).not.toHaveBeenCalled();
  });
});

describe('adoption — 027 backfill, re-run for a container that now exists', () => {
  const adopt = async (items: Item[]) => {
    vi.mocked(db.fetchItems).mockResolvedValue(items);
    await store().initializeStore('user-1');
    store().seedStarterContainers(planSeed({ items, projects: [], habitGroups: [] }));
    await settle();
  };

  it('links the members in the store, in the same commit', async () => {
    // Otherwise the store holds a member whose groupId is undefined while the
    // database has just linked it, and the next edit writes the stale shape back.
    await adopt([habit({ id: 'h1' }), habit({ id: 'h2' })]);
    const group = store().habitGroups.find((g) => g.name === 'Personal')!;
    for (const item of store().items) {
      expect(item.type === 'habit' && item.groupId).toBe(group.id);
    }
  });

  it('links them in the DATABASE too, after the insert and not before', async () => {
    // The composite items_group_id_fkey rejects the whole UPDATE if the row is
    // not there yet, so the adopt must be chained onto the create.
    await adopt([habit()]);
    const group = store().habitGroups.find((g) => g.name === 'Personal')!;
    expect(vi.mocked(db.adoptContainerMembers)).toHaveBeenCalledWith(
      'user-1', 'group_id', group.id, 'Personal'
    );
    const createOrder = vi.mocked(db.createHabitGroup).mock.invocationCallOrder[0];
    const adoptOrder = vi.mocked(db.adoptContainerMembers).mock.invocationCallOrder[0];
    expect(adoptOrder).toBeGreaterThan(createOrder);
  });

  it('does not re-point a member that already resolves', async () => {
    await adopt([habit({ id: 'h1', groupId: 'already-linked' } as never)]);
    const item = store().items.find((i) => i.id === 'h1')!;
    expect(item.type === 'habit' && item.groupId).toBe('already-linked');
  });

  it('does not fire the link when the create fails', async () => {
    vi.mocked(db.createHabitGroup).mockRejectedValueOnce(new Error('offline'));
    await adopt([habit()]);
    expect(vi.mocked(db.adoptContainerMembers)).not.toHaveBeenCalled();
  });
});
