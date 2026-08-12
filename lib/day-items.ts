import type { Task, Habit, Project, TimeBucket } from './planner-types';
import { shouldShowOnDate, isCompletedOnDate, isSkippedOnDate, isRecurring } from './recurrence';
import {
  EMPTY_VIEW_FILTERS,
  containerRef,
  passesFilters,
  type ViewFilters,
} from './filters';

/**
 * Pure derivation of what a single day shows, per bucket. Extracted from
 * timeline.tsx (P5a) so all six views share one data path
 * (hooks/use-day-items.ts is the store-connected wrapper).
 */

export const BUCKET_ORDER: TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];

/**
 * Canvas filter set (view-store `canvasFilters`). All-empty = no-op.
 *
 * @deprecated Alias of the one shape in lib/filters.ts. Was a fourth
 * independent declaration of the same three fields.
 */
export type DayItemFilters = ViewFilters;

const NO_FILTERS = EMPTY_VIEW_FILTERS;

export interface DayItemsInput {
  tasks: Task[];
  habits: Habit[];
  projects: Project[];
  /** yyyy-MM-dd for the selected day (already timezone-resolved). */
  dateStr: string;
  /** The actual Date for weekday/month-day recurrence checks. */
  date: Date;
  timezone: string;
  typeFilter: 'all' | 'tasks' | 'habits';
  showCompletedTasks: boolean;
  /** Optional canvas filters (priority/project/hide-completed); defaults to none. */
  filters?: DayItemFilters;
  /**
   * Ids suppressed ON THIS DATE — from lib/active.ts `inactiveItemIdsOn`.
   *
   * Resolved per-date by the caller rather than computed here, for two reasons:
   * this module is deliberately store-free and pure, and from Phase 2 resolving
   * one item means walking item → routine → program, which should happen once
   * per rendered day rather than once per item per filter pass.
   *
   * Already the open-loop rule (a suppressed item that WAS marked on this date
   * is absent from the set and keeps rendering), so this is a plain exclusion.
   * Optional so week columns and tests that predate pausing keep working.
   */
  inactiveItemIds?: ReadonlySet<string>;
}

export interface DayItems {
  tasksByBucket: Record<TimeBucket, Task[]>;
  habitsByBucket: Record<TimeBucket, Habit[]>;
  /** Projects with a recurring time block that lands on this day. */
  recurringProjects: Project[];
  totalCount: number;
}

function emptyBuckets<T>(): Record<TimeBucket, T[]> {
  return { anytime: [], morning: [], afternoon: [], evening: [] };
}

function byTimeThenOrder(a: { startTime?: string; order?: number }, b: { startTime?: string; order?: number }): number {
  if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
  if (a.startTime && !b.startTime) return -1;
  if (!a.startTime && b.startTime) return 1;
  return (a.order ?? 0) - (b.order ?? 0);
}

export function deriveDayItems(input: DayItemsInput): DayItems {
  const { tasks, habits, projects, dateStr, date, timezone, typeFilter, showCompletedTasks } = input;
  const filters = input.filters ?? NO_FILTERS;
  const inactive = input.inactiveItemIds;
  // hideFinished stacks on the existing showCompletedTasks preference
  const hideDoneTasks = !showCompletedTasks || filters.hideFinished;
  /**
   * Skips hang on the Display toggle ALONE, never on showCompletedTasks.
   *
   * That global's settings copy promises "Tasks only — habits always stay", and
   * a skip is overwhelmingly a habit gesture; folding it in would make a
   * tasks-only setting start hiding habits.
   */
  const hideSkipped = filters.hideFinished;

  // Tasks that belong to this day
  const dayTasks =
    typeFilter === 'habits'
      ? []
      : tasks.filter((task) => {
          if (inactive?.has(task.id)) return false;
          if (hideDoneTasks && task.status === 'completed') return false;
          // One rule for both narrowing axes, resolved per type through the
          // registry. An unset priority or project now lands in the explicit
          // "None" value rather than being deleted by every filter.
          if (!passesFilters(task, filters)) return false;
          if (hideSkipped && isSkippedOnDate(task, dateStr)) return false;
          if (!task.startDate) return false;
          // startDate is yyyy-MM-dd; tolerate legacy ISO strings
          const taskStartDateStr = task.startDate.includes('T')
            ? task.startDate.split('T')[0]
            : task.startDate;
          if (isRecurring(task)) {
            if (!(shouldShowOnDate(task, dateStr, timezone) && taskStartDateStr <= dateStr)) return false;
            if (hideDoneTasks && isCompletedOnDate(task, dateStr)) return false;
            return true;
          }
          return taskStartDateStr === dateStr;
        });

  // Habits that occur on this day.
  //
  // The wipe that used to sit here — `filters.priorities.length ||
  // filterProjects.length ? [] : …` — is gone. It deleted every habit the
  // moment any priority or project filter was on, because habits carry
  // neither field, so a project filter silently also meant "hide all habits".
  // passesFilters resolves each axis per type instead: a habit is unaffected by
  // priority (it has none) and answers the container axis with its GROUP.
  const dayHabits =
    typeFilter === 'tasks'
      ? []
      : habits.filter((h) => {
          if (inactive?.has(h.id)) return false;
          // 'habit' is passed explicitly rather than re-derived from the row's
          // runtime discriminator: this array IS the habits projection, so the
          // answer is known statically. Deriving it would make the predicate
          // depend on a field the declared Habit type does not carry — any
          // caller building a row without it would silently get task rules,
          // which is a priority filter deleting every habit all over again.
          if (!passesFilters(h, filters, 'habit')) return false;
          if (!shouldShowOnDate(h, dateStr, timezone)) return false;
          if (filters.hideFinished && isCompletedOnDate(h, dateStr)) return false;
          if (hideSkipped && isSkippedOnDate(h, dateStr)) return false;
          return true;
        });

  const tasksByBucket = emptyBuckets<Task>();
  dayTasks
    .filter((t) => t.timeBucket)
    .sort(byTimeThenOrder)
    .forEach((t) => tasksByBucket[t.timeBucket as TimeBucket].push(t));

  const habitsByBucket = emptyBuckets<Habit>();
  dayHabits
    .filter((h) => h.timeBucket)
    // The same comparator as tasks. It used to be
    // `a.startTime && b.startTime ? compare : 0`, which returns 0 the moment
    // EITHER side lacks a time — and most habits have none. A comparator that
    // answers 0 for every pair involving an untimed row is not a weak ordering:
    // it leaves those rows wherever the filter happened to emit them, so a 9am
    // habit could render below an untimed one, and the arrangement changed as
    // unrelated items came and went. Now timed rows lead in time order and
    // untimed ones follow by `order`, exactly as tasks do.
    .sort(byTimeThenOrder)
    .forEach((h) => habitsByBucket[h.timeBucket as TimeBucket].push(h));

  // Projects with recurring time blocks that land on this day.
  //
  // A block is a fourth row kind that no filter used to touch, and the artefact
  // was visible: filter to one project and the OTHER projects' blocks stayed on
  // the grid, now empty. It is a project, so the container axis applies to it —
  // and only that axis. It has no priority and no completion, and its position
  // is its time, so priority and hideFinished leave it alone.
  const containerFilter = filters.containers;
  const weekday = date.getDay();
  const dateOfMonth = date.getDate();
  const recurringProjects = projects.filter((p) => {
    if (containerFilter.length && !containerFilter.includes(containerRef('project', p.name)))
      return false;
    if (!p.startTime || !p.timeBucket || !p.repeatFrequency) return false;
    switch (p.repeatFrequency) {
      case 'daily':
        return true;
      case 'weekdays':
        return weekday >= 1 && weekday <= 5;
      case 'weekends':
        return weekday === 0 || weekday === 6;
      case 'monthly': {
        const targetDay = p.repeatMonthDay || 1;
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        return dateOfMonth === Math.min(targetDay, lastDayOfMonth);
      }
      case 'custom':
        return p.repeatDays?.includes(weekday) ?? false;
      default:
        // 'weekly' comes through the DB as free text on some rows
        return p.repeatDays?.includes(weekday) ?? false;
    }
  });

  const totalCount =
    BUCKET_ORDER.reduce((n, b) => n + tasksByBucket[b].length + habitsByBucket[b].length, 0);

  return { tasksByBucket, habitsByBucket, recurringProjects, totalCount };
}
