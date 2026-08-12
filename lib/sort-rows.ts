import type { Habit, Priority, Task } from './planner-types';
import { fieldApplies, typeNameOf } from './filters';

/**
 * Ordering for the three LIST surfaces, applied post-derivation.
 *
 * Never inside `deriveDayItems`. That function is shared by all six canvas
 * surfaces, and two of them depend on its comparator for correctness rather
 * than for looks: `inferDropTime` (lib/dnd/infer-drop-time.ts:42-69) resolves a
 * drop as "30 minutes before/after THAT ITEM's time", not as a slot index, so
 * "the gap above row X" only means "just before X" while the row above X is
 * earlier in the day. Re-sort the timed spine and a drop lands at a time that
 * contradicts where the row visibly went.
 *
 * That is also why Ordering is offered on List only. Sorting just the untimed
 * sub-section of a Buckets card was considered and rejected: a sort control
 * that silently governs half a card is worse than none.
 */

export type SortBy = 'default' | 'priority' | 'title';

export const SORT_VALUES: readonly SortBy[] = ['default', 'priority', 'title'];

export const isSortBy = (v: unknown): v is SortBy =>
  typeof v === 'string' && (SORT_VALUES as readonly string[]).includes(v);

/**
 * Unset sorts LAST, not first.
 *
 * The filter path's companion rule gives unset priority an explicit "No
 * priority" value so it stops being deleted; the sort's version of the same
 * courtesy is to keep it visible at the end rather than floating it to the top.
 * Most items have no priority, so first would bury the ones that do.
 */
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const UNSET_RANK = 3;

export interface SortableRow {
  itemType: 'task' | 'habit';
  item: Task | Habit;
}

/**
 * A type that does not CARRY priority ranks as unset rather than being pushed
 * to the end by a missing field — the sort-side reading of the pass-through
 * rule. A habit has no priority, so under "Priority" it lands with everything
 * else that has none, and under "Title" it interleaves with tasks normally.
 */
function priorityRank(row: SortableRow): number {
  // 'habit' from the ROW, not re-derived from the item: `itemType` is what the
  // surface built the row as, and typeNameOf falls back to 'task' for any row
  // whose runtime discriminator is missing. Task-likes still resolve through the
  // registry, so a custom type answers with its own config rather than 'task'.
  const typeName = row.itemType === 'habit' ? 'habit' : typeNameOf(row.item);
  if (!fieldApplies(typeName, 'priority')) return UNSET_RANK;
  const p = (row.item as { priority?: Priority }).priority;
  return p ? RANK[p] : UNSET_RANK;
}

/**
 * Numeric and case-insensitive: "Task 10" after "Task 2", and "apple" beside
 * "Apple" rather than in a separate uppercase run.
 */
const byTitle = (a: SortableRow, b: SortableRow): number =>
  (a.item.title ?? '').localeCompare(b.item.title ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  });

/**
 * Sort a rendered row list.
 *
 * 'default' returns the SAME ARRAY, not a copy — the derivation's own order is
 * the default, and preserving identity keeps callers' memos from invalidating
 * on every render for the value nearly everyone is on.
 *
 * Every other value copies before sorting (Array#sort mutates) and relies on
 * sort stability, which ES2019 guarantees: rows comparing equal keep the
 * derivation's order, so "Priority" inside a bucket is still time-ordered
 * within each priority band.
 */
export function sortRows<T extends SortableRow>(rows: T[], sortBy: SortBy): T[] {
  if (sortBy === 'default') return rows;
  if (sortBy === 'title') return [...rows].sort(byTitle);
  return [...rows].sort((a, b) => priorityRank(a) - priorityRank(b));
}
