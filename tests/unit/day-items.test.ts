import { describe, it, expect } from 'vitest';
import { deriveDayItems, type DayItemsInput } from '@/lib/day-items';
import type { Task, Habit, Project } from '@/lib/planner-types';

const TZ = 'America/New_York';
const DATE_STR = '2026-07-08'; // a Wednesday
const DATE = new Date('2026-07-08T12:00:00');

function task(overrides: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'task',
    status: 'pending',
    isScheduled: true,
    order: 0,
    ...overrides,
  } as Task;
}

function habit(overrides: Partial<Habit>): Habit {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'habit',
    group: 'wellness',
    status: 'pending',
    streak: 0,
    completedDates: [],
    repeatFrequency: 'daily',
    ...overrides,
  } as Habit;
}

function input(overrides: Partial<DayItemsInput>): DayItemsInput {
  return {
    tasks: [],
    habits: [],
    projects: [],
    dateStr: DATE_STR,
    date: DATE,
    timezone: TZ,
    typeFilter: 'all',
    showCompletedTasks: true,
    ...overrides,
  };
}

describe('deriveDayItems', () => {
  it('buckets one-off tasks by exact date match', () => {
    const onDay = task({ startDate: DATE_STR, timeBucket: 'morning' });
    const otherDay = task({ startDate: '2026-07-09', timeBucket: 'morning' });
    const noDate = task({ timeBucket: 'morning' });

    const result = deriveDayItems(input({ tasks: [onDay, otherDay, noDate] }));
    expect(result.tasksByBucket.morning.map((t) => t.id)).toEqual([onDay.id]);
  });

  it('sorts timed tasks first by time, then untimed by order', () => {
    const nine = task({ startDate: DATE_STR, timeBucket: 'morning', startTime: '09:00' });
    const eight = task({ startDate: DATE_STR, timeBucket: 'morning', startTime: '08:00' });
    const untimedSecond = task({ startDate: DATE_STR, timeBucket: 'morning', order: 2 });
    const untimedFirst = task({ startDate: DATE_STR, timeBucket: 'morning', order: 1 });

    const result = deriveDayItems(
      input({ tasks: [untimedSecond, nine, untimedFirst, eight] })
    );
    expect(result.tasksByBucket.morning.map((t) => t.id)).toEqual([
      eight.id,
      nine.id,
      untimedFirst.id,
      untimedSecond.id,
    ]);
  });

  it('hides completed tasks when showCompletedTasks is false', () => {
    const done = task({ startDate: DATE_STR, timeBucket: 'evening', status: 'completed' });
    const pending = task({ startDate: DATE_STR, timeBucket: 'evening' });

    const shown = deriveDayItems(input({ tasks: [done, pending], showCompletedTasks: false }));
    expect(shown.tasksByBucket.evening.map((t) => t.id)).toEqual([pending.id]);

    const all = deriveDayItems(input({ tasks: [done, pending], showCompletedTasks: true }));
    expect(all.tasksByBucket.evening).toHaveLength(2);
  });

  it('shows daily recurring tasks that started earlier', () => {
    const recurring = task({
      startDate: '2026-07-01',
      timeBucket: 'morning',
      repeatFrequency: 'daily',
    });
    const result = deriveDayItems(input({ tasks: [recurring] }));
    expect(result.tasksByBucket.morning).toHaveLength(1);
  });

  it('applies the type filter both ways', () => {
    const t = task({ startDate: DATE_STR, timeBucket: 'morning' });
    const h = habit({ timeBucket: 'morning' });

    const tasksOnly = deriveDayItems(input({ tasks: [t], habits: [h], typeFilter: 'tasks' }));
    expect(tasksOnly.tasksByBucket.morning).toHaveLength(1);
    expect(tasksOnly.habitsByBucket.morning).toHaveLength(0);

    const habitsOnly = deriveDayItems(input({ tasks: [t], habits: [h], typeFilter: 'habits' }));
    expect(habitsOnly.tasksByBucket.morning).toHaveLength(0);
    expect(habitsOnly.habitsByBucket.morning).toHaveLength(1);
  });

  it('includes weekday-recurring projects on a Wednesday', () => {
    const project = {
      id: 'p1',
      name: 'Deep work',
      emoji: '🛠',
      startTime: '09:00',
      timeBucket: 'morning',
      repeatFrequency: 'weekdays',
    } as unknown as Project;
    const weekendOnly = {
      id: 'p2',
      name: 'Chores',
      emoji: '🧺',
      startTime: '10:00',
      timeBucket: 'morning',
      repeatFrequency: 'weekends',
    } as unknown as Project;

    const result = deriveDayItems(input({ projects: [project, weekendOnly] }));
    expect(result.recurringProjects.map((p) => p.id)).toEqual(['p1']);
  });

  it('counts everything it bucketed', () => {
    const t = task({ startDate: DATE_STR, timeBucket: 'afternoon' });
    const h = habit({ timeBucket: 'anytime' });
    const result = deriveDayItems(input({ tasks: [t], habits: [h] }));
    expect(result.totalCount).toBe(2);
  });
});
