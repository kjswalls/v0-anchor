import { describe, it, expect } from 'vitest';
import { sortRows, isSortBy, type SortableRow } from '@/lib/sort-rows';
import { deriveDayItems, type DayItemsInput } from '@/lib/day-items';
import type { HabitItem, Priority, Task } from '@/lib/planner-types';

/**
 * Ordering, and the comparator repair that shipped with it.
 *
 * Two separate concerns in one file because they are two halves of the same
 * defect: the app had no sort control at all, AND the one comparator it did have
 * for habits was degenerate.
 */

const task = (title: string, priority?: Priority): SortableRow => ({
  itemType: 'task',
  item: { type: 'task', id: title, title, priority, status: 'pending', order: 0 } as unknown as Task,
});

const habit = (title: string): SortableRow => ({
  itemType: 'habit',
  item: { type: 'habit', id: title, title, project: 'Health', status: 'pending' } as unknown as HabitItem,
});

const titles = (rows: SortableRow[]) => rows.map((r) => r.item.title);

describe('sortRows', () => {
  it('returns the SAME array for default, not a copy', () => {
    // Identity matters: 'default' is what nearly everyone is on, and a fresh
    // array every render would invalidate the callers' memos for nothing.
    const rows = [task('b'), task('a')];
    expect(sortRows(rows, 'default')).toBe(rows);
  });

  it('never mutates its input', () => {
    const rows = [task('b'), task('a')];
    const before = titles(rows);
    sortRows(rows, 'title');
    expect(titles(rows)).toEqual(before);
  });

  it('orders by priority with unset LAST', () => {
    // Unset last, not first: most items have no priority, so first would bury
    // the ones that do under everything that does not.
    const rows = [task('none'), task('low', 'low'), task('high', 'high'), task('med', 'medium')];

    expect(titles(sortRows(rows, 'priority'))).toEqual(['high', 'med', 'low', 'none']);
  });

  it('ranks a habit as unset rather than reading a field it does not carry', () => {
    // The sort-side reading of the pass-through rule. A habit has no priority,
    // so it lands with everything else that has none — it is not excluded, and
    // it is not floated somewhere arbitrary.
    const rows = [habit('stretch'), task('high', 'high'), task('none')];

    expect(titles(sortRows(rows, 'priority'))).toEqual(['high', 'stretch', 'none']);
  });

  it('is stable, so equal keys keep the derivation order', () => {
    // This is what keeps "Priority" time-ordered WITHIN each band: the rows
    // arrive time-sorted from deriveDayItems and equal priorities do not move.
    const rows = [task('first', 'high'), task('second', 'high'), task('third', 'high')];

    expect(titles(sortRows(rows, 'priority'))).toEqual(['first', 'second', 'third']);
  });

  it('sorts titles numerically and case-insensitively', () => {
    const rows = [task('Task 10'), task('task 2'), task('Apple'), task('banana')];

    // "Task 2" before "Task 10" — a plain localeCompare puts 10 first. And
    // lowercase interleaves rather than forming its own run after the capitals.
    expect(titles(sortRows(rows, 'title'))).toEqual(['Apple', 'banana', 'task 2', 'Task 10']);
  });

  it('interleaves habits and tasks under Title', () => {
    // The braindump's "all tasks then all habits" was an accidental type
    // grouping baked into the sort — nobody chose it, it is just what building
    // the list in two passes produces.
    const rows = [task('zebra'), task('apple'), habit('mango')];

    expect(titles(sortRows(rows, 'title'))).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('isSortBy', () => {
  it('accepts the three values and rejects everything else', () => {
    // Load-bearing: the persisted payload is user-editable in devtools, and an
    // unrecognised string falls through sortRows' branches to the priority arm.
    for (const v of ['default', 'priority', 'title']) expect(isSortBy(v)).toBe(true);
    for (const v of ['Default', 'name', '', null, undefined, 3, {}]) expect(isSortBy(v)).toBe(false);
  });
});

/* ── the comparator repair ──────────────────────────────────────────────── */

const DATE_STR = '2026-07-08';

const dayHabit = (over: Partial<HabitItem>): HabitItem =>
  ({
    id: over.title ?? 'h',
    title: 'habit',
    project: 'wellness',
    status: 'pending',
    streak: 0,
    completedDates: [],
    repeatFrequency: 'daily',
    timeBucket: 'morning',
    ...over,
  }) as HabitItem;

const input = (over: Partial<DayItemsInput>): DayItemsInput => ({
  tasks: [],
  habits: [],
  projects: [],
  dateStr: DATE_STR,
  timezone: 'UTC',
  typeFilter: 'all',
  showCompletedTasks: true,
  ...over,
});

describe('the habit comparator deriveDayItems uses', () => {
  it('puts a timed habit above an untimed one, whichever order they arrive in', () => {
    // The old comparator was `a.startTime && b.startTime ? compare : 0`, which
    // answers 0 the moment EITHER side lacks a time — and most habits have
    // none. That is not a weak ordering: untimed rows stayed wherever the
    // filter emitted them, so a 9am habit could render below an untimed one.
    //
    // This is the ONE case that distinguishes the two comparators on data the
    // app can actually produce. No `order` on these fixtures: habitShape has no
    // such field (packages/types/src/schemas.ts:206) and the registry says
    // `orderable: false` — inventing one through the cast would make the test
    // assert behaviour no habit can reach.
    const untimed = dayHabit({ title: 'untimed' });
    const timed = dayHabit({ title: 'nine am', startTime: '09:00' });

    const r = deriveDayItems(input({ habits: [untimed, timed] }));

    expect(r.habitsByBucket.morning.map((h) => h.title)).toEqual(['nine am', 'untimed']);
  });

  it('leaves two untimed habits in the order they arrived', () => {
    // NOT "falls back to order" — byTimeThenOrder's `order` tail is inert for
    // habits, so this is the stable sort holding them still. It matters anyway:
    // dbListItems loads `ORDER BY "order", created_at`, so what they hold is
    // creation order rather than something that drifts as siblings change.
    const second = dayHabit({ title: 'second' });
    const first = dayHabit({ title: 'first' });

    const r = deriveDayItems(input({ habits: [second, first] }));

    expect(r.habitsByBucket.morning.map((h) => h.title)).toEqual(['second', 'first']);
  });

  it('still orders two timed habits by time', () => {
    const late = dayHabit({ title: 'late', startTime: '17:00' });
    const early = dayHabit({ title: 'early', startTime: '06:00' });

    const r = deriveDayItems(input({ habits: [late, early] }));

    expect(r.habitsByBucket.morning.map((h) => h.title)).toEqual(['early', 'late']);
  });
});
