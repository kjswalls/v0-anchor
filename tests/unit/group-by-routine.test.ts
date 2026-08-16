import { describe, it, expect } from 'vitest';
import { groupRows, type GroupableRow, type RowGroup } from '@/lib/grouping';
// manage-collections-dialog is gone — the Organize console replaced it, and
// `swapMembers` moved to lib/collections on the way out.
import { swapMembers } from '@/lib/collections';
import type { Task, Habit, Routine } from '@/lib/planner-types';

/**
 * Group-by-routine (Phase 5) and the routine ordering it makes visible.
 *
 * The two shipped together on purpose: `routine_items.sort_order` has existed
 * since migration 024 and nothing outside the manager ever rendered it, so a
 * reorder control alone would have been a preference with no observable effect.
 *
 * Moved from `buildListGroups` (components/views/day-list.tsx) to the shared
 * core in Phase 5a. Same branch, now reached by six surfaces instead of one.
 */

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, status: 'pending', isScheduled: true, order: 0, timeBucket: 'morning', ...over }) as Task;

const habit = (id: string, over: Partial<Habit> = {}): Habit =>
  ({ id, title: `Habit ${id}`, group: 'G', streak: 0, status: 'pending', completedDates: [], skippedDates: [], repeatFrequency: 'daily', timeBucket: 'morning', ...over }) as Habit;

const routine = (id: string, name: string, itemIds: string[]): Routine => ({ id, name, itemIds });

/** Habits then tasks — the row order `flattenDayRows` hands every surface. */
function groups(tasks: Task[], habits: Habit[], routines: Routine[]): RowGroup<GroupableRow>[] {
  const rows: GroupableRow[] = [
    ...habits.map((h) => ({ itemType: 'habit' as const, item: h })),
    ...tasks.map((t) => ({ itemType: 'task' as const, item: t })),
  ];
  return groupRows(rows, 'routine', { routines });
}

const ids = (g: RowGroup<GroupableRow>) => g.rows.map((r) => r.item.id);

describe('groupRows — group by routine', () => {
  it('puts habits and tasks under the same routine', () => {
    // Every other grouping here pulls habits into their own section. A routine
    // holds both, so doing that would put half a morning routine outside the
    // group named after it.
    const out = groups([task('t1')], [habit('h1')], [routine('r', 'Mornings', ['h1', 't1'])]);
    expect(out.map((g) => g.label)).toEqual(['Mornings']);
    expect(ids(out[0])).toEqual(['h1', 't1']);
  });

  it('orders members by the routine sequence, not by bucket order', () => {
    // This is the whole reason the reorder controls are worth having.
    const out = groups([task('a'), task('b'), task('c')], [], [routine('r', 'R', ['c', 'a', 'b'])]);
    expect(ids(out[0])).toEqual(['c', 'a', 'b']);
  });

  it('renders a multi-routine item once, in the first routine that claims it', () => {
    // Two checkboxes for one obligation is the Outliner's known failure, and a
    // duplicate row is one that shift-range and select-all silently skip.
    const out = groups([task('a')], [], [routine('r1', 'First', ['a']), routine('r2', 'Second', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['First']);
    expect(out.flatMap(ids)).toEqual(['a']);
  });

  it('keeps two same-named routines apart', () => {
    // Names are not unique — no UNIQUE on the column, rename ships from day one,
    // nothing dedupes on create. Grouped by name they MERGED into one heading
    // holding both routines' work, with no way to tell which reorder controls
    // governed which rows.
    const out = groups(
      [task('a'), task('b')],
      [],
      [routine('r1', 'Morning', ['a']), routine('r2', 'Morning', ['b'])]
    );
    expect(out.map((g) => g.label)).toEqual(['Morning', 'Morning']);
    expect(out.map((g) => g.key)).toEqual(['r1', 'r2']);
    expect(out.map(ids)).toEqual([['a'], ['b']]);
  });

  it('collects everything unclaimed under one trailing group', () => {
    const out = groups([task('a'), task('loose')], [], [routine('r', 'R', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['R', 'No routine']);
    expect(ids(out[1])).toEqual(['loose']);
  });

  it('gives the unclaimed group a key a routine cannot collide with', () => {
    // Group keys ARE React keys. A routine the user literally named "No routine"
    // would otherwise mount two sections under one key, and the moment the group
    // list changes shape they reconcile against a single fiber.
    const out = groups([task('a'), task('loose')], [], [routine('r', 'No routine', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['No routine', 'No routine']);
    expect(new Set(out.map((g) => g.key)).size).toBe(2);
  });

  it('drops a routine with nothing on this day rather than showing an empty heading', () => {
    const out = groups([task('a')], [], [routine('r1', 'Today', ['a']), routine('r2', 'Never', ['x'])]);
    expect(out.map((g) => g.label)).toEqual(['Today']);
  });

  it('falls back to one group when the user owns no routines', () => {
    const out = groups([task('a')], [habit('h')], []);
    expect(out.map((g) => g.label)).toEqual(['No routine']);
  });
});

describe('swapMembers', () => {
  it('swaps two ids and leaves the rest alone', () => {
    expect(swapMembers(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c']);
  });

  it('steps over an id whose item is in the trash', () => {
    // The reason this works on ids rather than on visible indexes: member
    // arrays keep ids for soft-deleted items by design, so the rendered
    // position and the array position diverge the moment one is in the bin.
    expect(swapMembers(['a', 'trashed', 'b'], 'b', 'a')).toEqual(['b', 'trashed', 'a']);
  });

  it('returns the same array when either id is absent', () => {
    const ids = ['a', 'b'];
    expect(swapMembers(ids, 'a', 'nope')).toBe(ids);
    expect(swapMembers(ids, 'a', 'a')).toBe(ids);
  });
});
