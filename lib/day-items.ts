import type { Task, Habit, Project, TimeBucket } from './planner-types';
import { shouldShowOnDate, isCompletedOnDate, isRecurring } from './recurrence';
import { EMPTY_VIEW_FILTERS, projectNamesFrom, type ViewFilters } from './filters';

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
  // Phase 0 keeps the old project-name semantics exactly; Phase 1 replaces this
  // with the registry-resolved container axis (so habits answer with `group`).
  const filterProjects = projectNamesFrom(filters.containers);

  // Tasks that belong to this day
  const dayTasks =
    typeFilter === 'habits'
      ? []
      : tasks.filter((task) => {
          if (inactive?.has(task.id)) return false;
          if (hideDoneTasks && task.status === 'completed') return false;
          if (filters.priorities.length && (!task.priority || !filters.priorities.includes(task.priority)))
            return false;
          if (filterProjects.length && (!task.project || !filterProjects.includes(task.project)))
            return false;
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

  // Habits that occur on this day. Habits carry no priority/project, so an
  // active priority or project filter hides them entirely (same rule as the
  // braindump's filters).
  //
  // PHASE 1 DELETES THIS WIPE. It is preserved verbatim here only so Phase 0
  // stays a pure rename — the behaviour change ships alone and revertable.
  const dayHabits =
    typeFilter === 'tasks' || filters.priorities.length || filterProjects.length
      ? []
      : habits.filter((h) => {
          if (inactive?.has(h.id)) return false;
          if (!shouldShowOnDate(h, dateStr, timezone)) return false;
          if (filters.hideFinished && isCompletedOnDate(h, dateStr)) return false;
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
    .sort((a, b) => (a.startTime && b.startTime ? a.startTime.localeCompare(b.startTime) : 0))
    .forEach((h) => habitsByBucket[h.timeBucket as TimeBucket].push(h));

  // Projects with recurring time blocks that land on this day
  const weekday = date.getDay();
  const dateOfMonth = date.getDate();
  const recurringProjects = projects.filter((p) => {
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
