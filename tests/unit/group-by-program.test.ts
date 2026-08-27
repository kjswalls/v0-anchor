import { describe, it, expect } from 'vitest';
import { groupRows, type GroupableRow, type RowGroup } from '@/lib/grouping';
import type { Task, HabitItem, Routine, Program } from '@/lib/planner-types';

/**
 * Group-by-program — the routine grouping's sibling, with the one thing routine
 * grouping never has to do: resolve TRANSITIVE membership. A program gates work
 * directly (program_items) AND through the routines it holds (program_routines →
 * routine_items), so the school-year program that contains a Chinese routine
 * groups that routine's habits under itself. Reading `program.itemIds` alone
 * would silently drop every item a program only reaches via a routine.
 *
 * Everything else is the routine contract, and it is here for the same reason
 * group-by-routine.test.ts is: one row / one group, key by id / label by name,
 * a trailing loose bucket, no empty headings.
 */

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, status: 'pending', isScheduled: true, order: 0, timeBucket: 'morning', ...over }) as Task;

const habit = (id: string, over: Partial<HabitItem> = {}): HabitItem =>
  ({ id, title: `HabitItem ${id}`, project: 'G', streak: 0, status: 'pending', completedDates: [], skippedDates: [], repeatFrequency: 'daily', timeBucket: 'morning', ...over }) as HabitItem;

const routine = (id: string, name: string, itemIds: string[]): Routine => ({ id, name, itemIds });

const program = (id: string, name: string, itemIds: string[], routineIds: string[] = []): Program =>
  ({ id, name, state: 'auto', itemIds, routineIds }) as Program;

/** Habits then tasks — the row order `flattenDayRows` hands every surface. */
function groups(
  tasks: Task[],
  habits: HabitItem[],
  programs: Program[],
  routines: Routine[] = []
): RowGroup<GroupableRow>[] {
  const rows: GroupableRow[] = [
    ...habits.map((h) => ({ itemType: 'habit' as const, item: h })),
    ...tasks.map((t) => ({ itemType: 'task' as const, item: t })),
  ];
  return groupRows(rows, 'program', { programs, routines });
}

const ids = (g: RowGroup<GroupableRow>) => g.rows.map((r) => r.item.id);

describe('groupRows — group by program', () => {
  it('puts habits and tasks a program holds directly under the same section', () => {
    const out = groups([task('t1')], [habit('h1')], [program('p', 'Summer', ['h1', 't1'])]);
    expect(out.map((g) => g.label)).toEqual(['Summer']);
    expect(ids(out[0])).toEqual(['h1', 't1']);
  });

  it('pulls in a member reachable ONLY through a routine the program holds', () => {
    // The transitive walk — the whole reason programGroups is not routineGroups
    // with the names swapped. h1 is in no program directly; it rides in through
    // the Chinese routine the program contains.
    const out = groups(
      [],
      [habit('h1')],
      [program('p', 'School year', [], ['r'])],
      [routine('r', 'Chinese', ['h1'])]
    );
    expect(out.map((g) => g.label)).toEqual(['School year']);
    expect(ids(out[0])).toEqual(['h1']);
  });

  it('orders a program’s own items before the items it reaches via routines', () => {
    // programMemberIds walks direct itemIds first, then each routine in
    // routineIds order — the order the group renders in, since sortRows('default')
    // is identity. 'b' is direct; 'a' arrives only through the routine.
    const out = groups(
      [task('a'), task('b')],
      [],
      [program('p', 'P', ['b'], ['r'])],
      [routine('r', 'R', ['a'])]
    );
    expect(ids(out[0])).toEqual(['b', 'a']);
  });

  it('renders a multi-program item once, in the first program that claims it', () => {
    // One row / one group under the OR rule — a duplicate is two checkboxes for
    // one obligation, exactly as with routines.
    const out = groups([task('a')], [], [program('p1', 'First', ['a']), program('p2', 'Second', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['First']);
    expect(out.flatMap(ids)).toEqual(['a']);
  });

  it('does not double-count an item that is both a direct member and in a held routine', () => {
    // Deduped within the program, at its direct position — otherwise the same
    // item would render twice under one heading.
    const out = groups(
      [task('x')],
      [],
      [program('p', 'P', ['x'], ['r'])],
      [routine('r', 'R', ['x'])]
    );
    expect(out.map((g) => g.label)).toEqual(['P']);
    expect(ids(out[0])).toEqual(['x']);
  });

  it('keeps two same-named programs apart', () => {
    // Names are not unique — no UNIQUE on the column, rename ships from day one.
    // Keyed on the name they would merge into one heading holding both.
    const out = groups(
      [task('a'), task('b')],
      [],
      [program('p1', 'Term', ['a']), program('p2', 'Term', ['b'])]
    );
    expect(out.map((g) => g.label)).toEqual(['Term', 'Term']);
    expect(out.map((g) => g.key)).toEqual(['p1', 'p2']);
    expect(out.map(ids)).toEqual([['a'], ['b']]);
  });

  it('collects everything unclaimed under one trailing group', () => {
    const out = groups([task('a'), task('loose')], [], [program('p', 'P', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['P', 'No program']);
    expect(ids(out[1])).toEqual(['loose']);
  });

  it('tags the real program section as a gate, and the loose bucket as none', () => {
    const out = groups([task('a'), task('loose')], [], [program('p', 'P', ['a'])]);
    expect(out[0].gate).toEqual({ kind: 'program', id: 'p' });
    expect(out[1].gate).toBeUndefined();
  });

  it('gives the unclaimed group a key a program cannot collide with', () => {
    // Group keys ARE React keys — a program the user literally named "No program"
    // would otherwise mount two sections under one key.
    const out = groups([task('a'), task('loose')], [], [program('p', 'No program', ['a'])]);
    expect(out.map((g) => g.label)).toEqual(['No program', 'No program']);
    expect(new Set(out.map((g) => g.key)).size).toBe(2);
  });

  it('drops a program with nothing on this day rather than showing an empty heading', () => {
    const out = groups([task('a')], [], [program('p1', 'On', ['a']), program('p2', 'Off', ['x'])]);
    expect(out.map((g) => g.label)).toEqual(['On']);
  });

  it('ignores a held routine id that resolves to no routine', () => {
    // Member arrays can dangle — a routine can be deleted while a program still
    // lists it. The walk skips the missing routine; the direct member survives.
    const out = groups([task('a')], [], [program('p', 'P', ['a'], ['ghost'])], []);
    expect(out.map((g) => g.label)).toEqual(['P']);
    expect(ids(out[0])).toEqual(['a']);
  });

  it('falls back to one group when the user owns no programs', () => {
    const out = groups([task('a')], [habit('h')], []);
    expect(out.map((g) => g.label)).toEqual(['No program']);
  });
});
