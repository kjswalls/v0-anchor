import { isCompletedOnDate, isRecurring } from './recurrence';
import type { HabitItem, HabitStatus, Task, TaskStatus } from './planner-types';

/**
 * What a tick MEANS, in one place.
 *
 * Ticking a box is not one store call: a one-off task flips a scalar status, a
 * recurring one writes into `completedDates` for a specific date, and a habit
 * with `timesPerDay > 1` counts UP rather than flipping — while a click at
 * target clears the day outright instead of stepping down to target-1. There is
 * also a skip arm that reads as neither done nor undone.
 *
 * That was derived inside components/primitives/task-row.tsx and nowhere else,
 * which was fine while exactly one surface had checkboxes. Zen
 * (components/zen/zen-room.tsx) is a second, and a second derivation of these
 * rules would be the kind of near-copy that only diverges once someone fixes a
 * bug in one of them — the multi-count and skip arms are exactly subtle enough
 * for that to go unnoticed.
 *
 * Pure decision logic over `(item, date)`: it derives every intermediate it
 * needs from the item itself rather than taking pre-computed flags, so a caller
 * cannot pass a stale `done` and get a wrong write.
 */

/** The two planner-store actions a tick can reach. */
export interface ItemToggleActions {
  toggleTaskStatus: (id: string, status?: TaskStatus, date?: Date) => void;
  toggleHabitStatus: (id: string, status: HabitStatus, count?: number, date?: Date) => void;
}

/** The day being ticked, as both shapes the store and the item arrays want. */
export interface ToggleOn {
  /** The Date the store resolves the write against. */
  date: Date;
  /** The same day as yyyy-MM-dd, already resolved in the user's timezone. */
  dateStr: string;
}

/**
 * `undefined` for a NON-recurring task is deliberate: a one-off carries a
 * scalar status and has no per-date dimension, so the store must not be handed
 * a date it would resolve and then ignore.
 */
export function toggleTaskDone(task: Task, on: ToggleOn, actions: ItemToggleActions): void {
  actions.toggleTaskStatus(task.id, undefined, isRecurring(task) ? on.date : undefined);
}

export function toggleHabitDone(habit: HabitItem, on: ToggleOn, actions: ItemToggleActions): void {
  const { date, dateStr } = on;
  const doneOnDate = habit.completedDates.includes(dateStr);
  const skipped = (habit.skippedDates ?? []).includes(dateStr);
  // A skip is a THIRD state, not a flavour of undone, and the order matters:
  // a habit can be both skipped and (historically) completed on a date, and the
  // skip is what the row is showing.
  const status: HabitStatus = skipped ? 'skipped' : doneOnDate ? 'done' : 'pending';

  const multiTarget = habit.timesPerDay && habit.timesPerDay > 1 ? habit.timesPerDay : 0;
  if (multiTarget === 0) {
    // Binary. Note this reads `status`, not `doneOnDate`: clicking a SKIPPED
    // habit's box takes it back to pending rather than jumping it to done —
    // undoing a skip and completing are different gestures.
    actions.toggleHabitStatus(habit.id, status === 'pending' ? 'done' : 'pending', undefined, date);
    return;
  }

  // Multi-count. `dailyCounts` is the live tally; a habit marked done without
  // one still counts as a full day, which is what the `|| timesPerDay || 1`
  // fallback covers.
  const count = (habit.dailyCounts ?? {})[dateStr] ?? 0;
  const effectiveCount = doneOnDate ? count || habit.timesPerDay || 1 : count;

  if (status === 'done') {
    // Checkbox semantics are binary even here: unchecking means "I didn't do
    // this", so it clears the day rather than stepping down to target-1. The
    // trailing `−` control is what steps.
    actions.toggleHabitStatus(habit.id, 'pending', 0, date);
    return;
  }
  const next = effectiveCount + 1;
  if (next >= multiTarget) actions.toggleHabitStatus(habit.id, 'done', multiTarget, date);
  else actions.toggleHabitStatus(habit.id, 'pending', next, date);
}

/**
 * Is this row ticked ON THIS DATE — the read side of the same rules.
 *
 * Kept beside the write so the two cannot drift: a surface that decided "done"
 * differently from the way its own click writes it would render a box that
 * un-ticks itself on the next store tick. Mirrors what task-row.tsx computes
 * for `completed`.
 */
export function isRowDone(
  row: { itemType: 'task'; item: Task } | { itemType: 'habit'; item: HabitItem },
  dateStr: string
): boolean {
  if (row.itemType === 'habit') return row.item.completedDates.includes(dateStr);
  // Recurring tasks track per-date and NEVER move their scalar status.
  return isRecurring(row.item)
    ? isCompletedOnDate(row.item, dateStr)
    : row.item.status === 'completed';
}

/**
 * Was this occurrence SKIPPED on this date — a third state, and the one a
 * surface must not offer a plain checkbox for.
 *
 * Membership in `skippedDates` is the whole test: nothing can be skipped
 * without being skippable, so there is no registry lookup to do here.
 *
 * task-row.tsx answers this by returning an entirely different DOM shape —
 * a collapsed strip with an Unskip button and no completion box at all
 * (`data-row-variant="skipped"`). Any surface that renders a live tick over a
 * skipped row can write states the rest of the app treats as impossible; see
 * `toggleRowDone` below.
 */
export function isRowSkipped(
  row: { itemType: 'task'; item: Task } | { itemType: 'habit'; item: HabitItem },
  dateStr: string
): boolean {
  return (row.item.skippedDates ?? []).includes(dateStr);
}

/**
 * Dispatch on the row's own discriminator.
 *
 * SKIPPED occurrences are refused outright, and that guard is here rather than
 * only in the caller because getting it wrong is expensive in two different
 * ways. On a recurring TASK, `toggleTaskStatus` writes `completedDates` and
 * never clears the skip, producing a row that is skipped AND completed on the
 * same date — a pair `setItemSkipped` explicitly maintains the exclusivity of.
 * On a HABIT it is worse than untidy: the tick resolves to 'pending', which
 * clears the skip and pushes that through to the database, turning a
 * deliberately-skipped occurrence back into an untouched open loop — and the
 * nightly stake settlement counts a skip as neither hit nor miss while an open
 * loop settles as a MISS. One stray click could charge a Beeminder pledge.
 */
export function toggleRowDone(
  row: { itemType: 'task'; item: Task } | { itemType: 'habit'; item: HabitItem },
  on: ToggleOn,
  actions: ItemToggleActions
): void {
  if (isRowSkipped(row, on.dateStr)) return;
  if (row.itemType === 'task') toggleTaskDone(row.item, on, actions);
  else toggleHabitDone(row.item, on, actions);
}
