import type { Task, Habit, Project, TimeBucket } from './planner-types';
import { shouldShowOnDate, isCompletedOnDate, isRecurring } from './recurrence';

/**
 * Pure derivation of what a single day shows, per bucket. Extracted from
 * timeline.tsx (P5a) so all six views share one data path
 * (hooks/use-day-items.ts is the store-connected wrapper).
 */

export const BUCKET_ORDER: TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];

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

  // Tasks that belong to this day
  const dayTasks =
    typeFilter === 'habits'
      ? []
      : tasks.filter((task) => {
          if (!showCompletedTasks && task.status === 'completed') return false;
          if (!task.startDate) return false;
          // startDate is yyyy-MM-dd; tolerate legacy ISO strings
          const taskStartDateStr = task.startDate.includes('T')
            ? task.startDate.split('T')[0]
            : task.startDate;
          if (isRecurring(task)) {
            if (!(shouldShowOnDate(task, dateStr, timezone) && taskStartDateStr <= dateStr)) return false;
            if (!showCompletedTasks && isCompletedOnDate(task, dateStr)) return false;
            return true;
          }
          return taskStartDateStr === dateStr;
        });

  // Habits that occur on this day
  const dayHabits =
    typeFilter === 'tasks' ? [] : habits.filter((h) => shouldShowOnDate(h, dateStr, timezone));

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
