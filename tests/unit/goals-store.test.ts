import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The goals SLICE — Phase 1 of memory/plans/long-term-goals.md.
 *
 * Same harness as pause.test.ts: the db layer is mocked and the REAL Zustand
 * store is driven, so these assert both the optimistic state and the writes
 * that leave for Supabase. Goals need that pairing more than most features,
 * because the two things most likely to break them are invisible in the UI —
 * a membership write that never leaves, and a role that quietly changes.
 */

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    fetchItems: vi.fn(async () => []),
    fetchProjects: vi.fn(async () => []),
    fetchHabitGroups: vi.fn(async () => []),
    fetchItemTypes: vi.fn(async () => []),
    fetchRoutines: vi.fn(async () => []),
    fetchPrograms: vi.fn(async () => []),
    fetchGoals: vi.fn(async () => []),
    createItem: vi.fn(async () => {}),
    updateItem: vi.fn(async () => {}),
    deleteItem: vi.fn(async () => {}),
    restoreItem: vi.fn(async () => {}),
    setItemCompletion: vi.fn(async () => {}),
    createGoal: vi.fn(async () => {}),
    updateGoal: vi.fn(async () => {}),
    deleteGoal: vi.fn(async () => {}),
    restoreGoal: vi.fn(async () => {}),
  };
});
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));

import { usePlannerStore } from '@/lib/planner-store';
import * as db from '@/lib/db';
import type { Goal, Item } from '@/lib/planner-types';

const U = 'user-1';

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Learn Chinese',
  state: 'active',
  memberIds: [],
  milestoneIds: [],
  checkinIds: [],
  ...over,
});

const task = (over: Partial<Extract<Item, { type: 'task' }>> = {}): Item => ({
  type: 'task',
  id: 't1',
  title: 'Sit HSK 3',
  status: 'pending',
  isScheduled: false,
  order: 0,
  completedDates: [],
  skippedDates: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  usePlannerStore.setState({
    userId: U,
    items: [],
    tasks: [],
    habits: [],
    goals: [],
    routines: [],
    programs: [],
    projects: [],
    habitGroups: [],
    goalsAvailable: true,
  } as never);
});

describe('the goals slice', () => {
  it('creates, edits and soft-deletes, writing each through', () => {
    const s = usePlannerStore.getState();
    const id = s.addGoal({ name: 'Learn Chinese', state: 'active', memberIds: [], milestoneIds: [], checkinIds: [] });
    expect(db.createGoal).toHaveBeenCalledWith(U, expect.objectContaining({ id, name: 'Learn Chinese' }));

    usePlannerStore.getState().updateGoal(id, { why: 'To talk to my in-laws' });
    expect(db.updateGoal).toHaveBeenCalledWith(U, id, { why: 'To talk to my in-laws' });

    usePlannerStore.getState().removeGoal(id);
    expect(db.deleteGoal).toHaveBeenCalledWith(U, id);
    expect(usePlannerStore.getState().goals).toHaveLength(0);
  });

  it('deleting a goal touches none of its members', () => {
    // The whole promise of the aspire role. "Delete Learn Chinese" must not
    // take a year of habits and tasks with it — only the goal and its links.
    usePlannerStore.setState({
      items: [task()],
      goals: [goal({ memberIds: ['t1'], milestoneIds: [] })],
    } as never);
    usePlannerStore.getState().removeGoal('g1');
    expect(usePlannerStore.getState().items).toHaveLength(1);
    expect(db.updateItem).not.toHaveBeenCalled();
    expect(db.deleteItem).not.toHaveBeenCalled();
  });
});

describe('setGoalState', () => {
  it('stamps achievedAt on achieving and CLEARS it on reopening', () => {
    usePlannerStore.setState({ goals: [goal()] } as never);
    usePlannerStore.getState().setGoalState('g1', 'achieved');
    const achieved = usePlannerStore.getState().goals[0];
    expect(achieved.state).toBe('achieved');
    expect(achieved.achievedAt).toBeTruthy();

    usePlannerStore.getState().setGoalState('g1', 'active');
    const reopened = usePlannerStore.getState().goals[0];
    expect(reopened.state).toBe('active');
    expect(reopened.achievedAt).toBeUndefined();
    // The key must SURVIVE to the db layer as an explicit clear — dropped as an
    // absent key, the stamp would live on in the row forever.
    expect(db.updateGoal).toHaveBeenLastCalledWith(U, 'g1', { state: 'active', achievedAt: undefined });
  });

  it('never restamps a goal already in the requested state', () => {
    // Retried writes are expected traffic. Restamping would drag a multi-year
    // achievement date forward every time one arrived.
    const stamp = '2026-01-01T00:00:00.000Z';
    usePlannerStore.setState({ goals: [goal({ state: 'achieved', achievedAt: stamp })] } as never);
    usePlannerStore.getState().setGoalState('g1', 'achieved');
    expect(usePlannerStore.getState().goals[0].achievedAt).toBe(stamp);
    expect(db.updateGoal).not.toHaveBeenCalled();
  });

  it('leaves the stamp alone when abandoning', () => {
    const stamp = '2026-01-01T00:00:00.000Z';
    usePlannerStore.setState({ goals: [goal({ state: 'achieved', achievedAt: stamp })] } as never);
    usePlannerStore.getState().setGoalState('g1', 'abandoned');
    expect(usePlannerStore.getState().goals[0].achievedAt).toBe(stamp);
  });
});

describe('the demotion rule', () => {
  it('demotes a milestone to member when the item becomes recurring', () => {
    // Locked decision 3. A recurring item's scalar status never moves, so a
    // recurring milestone can never be counted achieved — the goal would read
    // permanently behind with nothing to click.
    usePlannerStore.setState({
      items: [task()],
      goals: [goal({ milestoneIds: ['t1'] })],
    } as never);

    usePlannerStore.getState().updateTask('t1', { repeatFrequency: 'daily' });

    const g = usePlannerStore.getState().goals[0];
    expect(g.milestoneIds).toEqual([]);
    expect(g.memberIds).toEqual(['t1']);
    // And the membership write leaves, carrying all three arrays.
    expect(db.updateGoal).toHaveBeenCalledWith(U, 'g1', {
      memberIds: ['t1'], milestoneIds: [], checkinIds: [],
    });
  });

  it('demotes a check-in when the item stops recurring', () => {
    usePlannerStore.setState({
      items: [task({ repeatFrequency: 'weekdays' })],
      goals: [goal({ checkinIds: ['t1'] })],
    } as never);

    usePlannerStore.getState().updateTask('t1', { repeatFrequency: 'none' });

    const g = usePlannerStore.getState().goals[0];
    expect(g.checkinIds).toEqual([]);
    expect(g.memberIds).toEqual(['t1']);
  });

  it('never blocks the edit it reacts to', () => {
    // A goal must not constrain its members — that is the aspire role's whole
    // seam. The item edit lands either way; the membership is what yields.
    usePlannerStore.setState({
      items: [task()],
      goals: [goal({ milestoneIds: ['t1'] })],
    } as never);
    usePlannerStore.getState().updateTask('t1', { repeatFrequency: 'daily' });
    const item = usePlannerStore.getState().items[0] as Extract<Item, { type: 'task' }>;
    expect(item.repeatFrequency).toBe('daily');
  });

  it('leaves a still-valid role alone, and skips the scan for unrelated edits', () => {
    usePlannerStore.setState({
      items: [task()],
      goals: [goal({ milestoneIds: ['t1'] })],
    } as never);
    usePlannerStore.getState().updateTask('t1', { title: 'Renamed' });
    expect(usePlannerStore.getState().goals[0].milestoneIds).toEqual(['t1']);
    expect(db.updateGoal).not.toHaveBeenCalled();
  });

  it('does not duplicate an item that is already a plain member elsewhere in the goal', () => {
    // Guarding the array rebuild: an item cannot hold two roles in one goal
    // (the PK enforces it), so the demoted id must not be appended twice.
    usePlannerStore.setState({
      items: [task()],
      goals: [goal({ milestoneIds: ['t1'], memberIds: ['t1'] })],
    } as never);
    usePlannerStore.getState().updateTask('t1', { repeatFrequency: 'daily' });
    expect(usePlannerStore.getState().goals[0].memberIds).toEqual(['t1']);
  });
});

describe('the bulk date verbs leave milestone target dates alone', () => {
  const seed = () =>
    usePlannerStore.setState({
      items: [
        task({ id: 'plain', title: 'Buy milk', startDate: '2026-06-01', timeBucket: 'anytime' }),
        task({ id: 'stone', title: 'Sit HSK 3', startDate: '2026-06-30', timeBucket: 'anytime' }),
      ],
      goals: [goal({ milestoneIds: ['stone'] })],
    } as never);

  it('moveTasksToDate skips them', () => {
    // For an ordinary task startDate is a scheduling intention and "move all to
    // tomorrow" is a kindness. For a milestone it is the target date, and a
    // habitual bulk tap would walk a goal's deadline forward a day at a time.
    seed();
    usePlannerStore.getState().moveTasksToDate(['plain', 'stone'], '2026-06-02');
    const byId = new Map(usePlannerStore.getState().items.map((i) => [i.id, i]));
    expect((byId.get('plain') as { startDate?: string }).startDate).toBe('2026-06-02');
    expect((byId.get('stone') as { startDate?: string }).startDate).toBe('2026-06-30');
  });

  it('unscheduleTasks — the sweep’s verb — skips them', () => {
    // The heaviest caller here is the unattended auto-age sweep, which CLEARS
    // startDate. Left in, a milestone thirty days behind loses the only record
    // of when it was due, silently and overnight.
    seed();
    usePlannerStore.getState().unscheduleTasks(['plain', 'stone']);
    const byId = new Map(usePlannerStore.getState().items.map((i) => [i.id, i]));
    expect((byId.get('plain') as { startDate?: string }).startDate).toBeUndefined();
    expect((byId.get('stone') as { startDate?: string }).startDate).toBe('2026-06-30');
  });

  it('still lets a single deliberate reschedule through', () => {
    // Only the sweeping verbs are refused. Moving one milestone on purpose is
    // ordinary planning and stays available everywhere.
    seed();
    usePlannerStore.getState().updateTask('stone', { startDate: '2026-07-15' });
    const byId = new Map(usePlannerStore.getState().items.map((i) => [i.id, i]));
    expect((byId.get('stone') as { startDate?: string }).startDate).toBe('2026-07-15');
  });
});

describe('create-with-membership', () => {
  it('lands the item and its goal role in ONE gesture', () => {
    usePlannerStore.setState({ goals: [goal()] } as never);
    usePlannerStore.getState().addTask(
      { title: 'Sit HSK 3', status: 'pending', isScheduled: false, order: 0, completedDates: [], skippedDates: [] } as never,
      { goalIds: ['g1'], goalRole: 'milestone' },
    );
    const g = usePlannerStore.getState().goals[0];
    expect(g.milestoneIds).toHaveLength(1);
    expect(g.memberIds).toHaveLength(0);
  });

  it('defaults to the plain member role', () => {
    usePlannerStore.setState({ goals: [goal()] } as never);
    usePlannerStore.getState().addTask(
      { title: 'Book a tutor', status: 'pending', isScheduled: false, order: 0, completedDates: [], skippedDates: [] } as never,
      { goalIds: ['g1'] },
    );
    expect(usePlannerStore.getState().goals[0].memberIds).toHaveLength(1);
  });
});

describe('the trash keeps a goal’s roles', () => {
  it('restores each member into the role it held, not as plain members', () => {
    // The near-miss the console's own Phase 4 recorded, one level worse: a bin
    // snapshot of bare ids would bring every milestone and check-in back as a
    // plain member — silently changing the goal's progress denominator, while
    // the visible gate (the row is back on the list) passes either way.
    const entry = {
      kind: 'goal' as const,
      id: 'g9',
      name: 'Learn Chinese',
      deletedAt: '2026-08-01T00:00:00.000Z',
      entity: goal({
        id: 'g9',
        memberIds: ['m1'],
        milestoneIds: ['s1', 's2'],
        checkinIds: ['c1'],
      }),
    };
    usePlannerStore.setState({ goals: [] } as never);
    usePlannerStore.getState().restoreFromTrash(entry);

    const restored = usePlannerStore.getState().goals[0];
    expect(restored.milestoneIds).toEqual(['s1', 's2']);
    expect(restored.checkinIds).toEqual(['c1']);
    expect(restored.memberIds).toEqual(['m1']);
    expect(db.restoreGoal).toHaveBeenCalledWith(U, 'g9');
  });

  it('is a no-op when the goal is already back', () => {
    usePlannerStore.setState({ goals: [goal({ id: 'g9' })] } as never);
    usePlannerStore.getState().restoreFromTrash({
      kind: 'goal' as const,
      id: 'g9',
      name: 'Learn Chinese',
      deletedAt: '2026-08-01T00:00:00.000Z',
      entity: goal({ id: 'g9' }),
    });
    expect(usePlannerStore.getState().goals).toHaveLength(1);
  });
});
