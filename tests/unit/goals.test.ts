import { describe, it, expect } from 'vitest';
import { goalMemberRows, type GoalMembers } from '@/lib/db';
import { isCheckinEligible, isCollectible, isMilestoneEligible } from '@/lib/item-registry';
import type { Item } from '@/lib/planner-types';

/**
 * Phase 0 of memory/plans/long-term-goals.md — the two pieces of goal logic
 * that exist before any store or UI does: who may hold which role, and how the
 * three role arrays flatten into the one join table that stores them.
 *
 * Phase 1 extends this file with the derived helpers (progress, nextMilestone,
 * checkinStanding) and the demotion rule.
 */

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

const habit = (over: Partial<Extract<Item, { type: 'habit' }>> = {}): Item => ({
  type: 'habit',
  id: 'h1',
  title: 'Practice Chinese',
  status: 'pending',
  repeatFrequency: 'daily',
  completedDates: [],
  skippedDates: [],
  streak: 0,
  group: 'Personal',
  dailyCounts: {},
  ...over,
});

describe('who may hold which role', () => {
  it('lets a one-shot task be a milestone', () => {
    expect(isMilestoneEligible(task())).toBe(true);
  });

  it('refuses a RECURRING task, because its scalar status never moves', () => {
    // The whole reason the capability is not the whole question. A recurring
    // item tracks completion per date (migration 016) and leaves `status`
    // alone forever, so a recurring milestone could never be counted achieved
    // and the goal would read permanently behind with nothing to click.
    expect(isMilestoneEligible(task({ repeatFrequency: 'daily' }))).toBe(false);
  });

  it('refuses a habit, which has a history rather than a completion', () => {
    expect(isMilestoneEligible(habit())).toBe(false);
    expect(isMilestoneEligible(habit({ repeatFrequency: 'none' }))).toBe(false);
  });

  it('refuses a subtask, which has no independent presence', () => {
    // Inherited from isCollectible rather than restated — a subtask surfaces
    // only inside its parent, so a milestone the user cannot find is worse
    // than no milestone.
    const sub = task({ parentItemId: 'parent' });
    expect(isCollectible(sub)).toBe(false);
    expect(isMilestoneEligible(sub)).toBe(false);
    expect(isCheckinEligible(sub)).toBe(false);
  });

  it('mirrors the rule for check-ins: recurring yes, one-shot no', () => {
    expect(isCheckinEligible(task({ repeatFrequency: 'weekdays' }))).toBe(true);
    expect(isCheckinEligible(habit())).toBe(true);
    expect(isCheckinEligible(task())).toBe(false);
    expect(isCheckinEligible(task({ repeatFrequency: 'none' }))).toBe(false);
  });

  it('never lets one item satisfy both roles — they are opposites', () => {
    for (const item of [task(), task({ repeatFrequency: 'daily' }), habit()]) {
      expect(isMilestoneEligible(item) && isCheckinEligible(item)).toBe(false);
    }
  });
});

describe('flattening the three role arrays into join rows', () => {
  const members = (over: Partial<GoalMembers> = {}): GoalMembers => ({
    memberIds: [],
    milestoneIds: [],
    checkinIds: [],
    ...over,
  });

  it('tags each id with its role', () => {
    const rows = goalMemberRows(members({
      memberIds: ['m1'],
      milestoneIds: ['s1'],
      checkinIds: ['c1'],
    }));
    expect(rows).toEqual([
      { itemId: 's1', role: 'milestone', sortOrder: 0 },
      { itemId: 'c1', role: 'checkin', sortOrder: null },
      { itemId: 'm1', role: 'member', sortOrder: null },
    ]);
  });

  it('numbers milestones by array position and leaves every other role null', () => {
    // Homogeneous keys are not cosmetic: PostgREST bulk upserts need every row
    // to name the same columns, and a demoted milestone that kept its old
    // sort_order would perturb the order its new array comes back in.
    const rows = goalMemberRows(members({
      milestoneIds: ['s1', 's2', 's3'],
      memberIds: ['m1'],
    }));
    expect(rows.filter((r) => r.role === 'milestone').map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    expect(rows.find((r) => r.itemId === 'm1')!.sortOrder).toBeNull();
    for (const row of rows) expect(row).toHaveProperty('sortOrder');
  });

  it('dedupes WITHIN one array quietly', () => {
    // One id twice in one array is not a contradiction, and a multi-add UI
    // produces it trivially. Left in, Postgres aborts the whole upsert with
    // 21000 ("cannot affect row a second time").
    const rows = goalMemberRows(members({ milestoneIds: ['s1', 's1', 's2'] }));
    expect(rows.map((r) => r.itemId)).toEqual(['s1', 's2']);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it('REFUSES the same id in two arrays instead of picking a winner', () => {
    // Two contradictory instructions about one row. The primary key holds one
    // role, so honouring half of this would be last-write-wins roulette — the
    // same reasoning that makes the agent API reject `paused: false` sent with
    // a `pausedUntil` rather than guessing which half was meant.
    expect(() =>
      goalMemberRows(members({ milestoneIds: ['x'], memberIds: ['x'] })),
    ).toThrow(/two roles at once/);
    expect(() =>
      goalMemberRows(members({ checkinIds: ['x'], memberIds: ['x'] })),
    ).toThrow(/two roles at once/);
  });

  it('is empty for a goal with no members, so create can skip the write', () => {
    expect(goalMemberRows(members())).toEqual([]);
  });
});
