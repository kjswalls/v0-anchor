import { describe, it, expect } from 'vitest';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';

// ── Recurrence helper (mirrors logic in components/planner/week-view.tsx) ──────
//
// The app's recurrence filtering lives inside components and is not currently
// exported as a standalone module. This helper replicates the exact switch-case
// from week-view.tsx so we can unit-test the logic without mounting a component.
function shouldShowOnDate(
  habit: {
    repeatFrequency: string;
    repeatDays?: number[];
    repeatMonthDay?: number;
  },
  date: Date
): boolean {
  const dayOfWeek = date.getDay();       // 0 = Sun … 6 = Sat
  const dateOfMonth = date.getDate();    // 1–31

  switch (habit.repeatFrequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly':
      return habit.repeatDays?.includes(dayOfWeek) ?? false;
    case 'custom':
      return habit.repeatDays?.includes(dayOfWeek) ?? false;
    case 'monthly': {
      const targetDay = habit.repeatMonthDay || 1;
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return dateOfMonth === Math.min(targetDay, lastDayOfMonth);
    }
    default:
      return false;
  }
}

describe('habit / task recurrence logic', () => {
  // Real test — label maps are pure data, trivially verifiable
  it('REPEAT_FREQUENCY_LABELS contains all RepeatFrequency values', () => {
    const expected = ['none', 'daily', 'weekdays', 'weekends', 'weekly', 'monthly', 'custom'];
    expect(Object.keys(REPEAT_FREQUENCY_LABELS)).toEqual(expect.arrayContaining(expected));
    expect(Object.keys(REPEAT_FREQUENCY_LABELS)).toHaveLength(expected.length);
  });

  it('WEEKDAY_LABELS has 7 entries starting with Sun', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe('Sun');
    expect(WEEKDAY_LABELS[6]).toBe('Sat');
  });

  // Known bug: recurring tasks/habits may appear on wrong days — issue #90
  it.skip('daily habit appears on every day of the week (#90 — wrong-day bug)', () => {
    // BUG #90: habits with repeatFrequency="daily" are rendered on incorrect dates.
    // Once fixed, verify that a daily habit's completedDates include today and
    // the habit is visible when selectedDate matches the current day.
  });

  it('weekdays habit does NOT appear on Saturday or Sunday', () => {
    const habit = { repeatFrequency: 'weekdays' };

    // Use a known week: Mon Jan 13 – Sun Jan 19, 2025
    const monday    = new Date(2025, 0, 13); // Mon (dayOfWeek=1)
    const tuesday   = new Date(2025, 0, 14); // Tue (dayOfWeek=2)
    const wednesday = new Date(2025, 0, 15); // Wed (dayOfWeek=3)
    const thursday  = new Date(2025, 0, 16); // Thu (dayOfWeek=4)
    const friday    = new Date(2025, 0, 17); // Fri (dayOfWeek=5)
    const saturday  = new Date(2025, 0, 18); // Sat (dayOfWeek=6)
    const sunday    = new Date(2025, 0, 19); // Sun (dayOfWeek=0)

    expect(shouldShowOnDate(habit, monday)).toBe(true);
    expect(shouldShowOnDate(habit, tuesday)).toBe(true);
    expect(shouldShowOnDate(habit, wednesday)).toBe(true);
    expect(shouldShowOnDate(habit, thursday)).toBe(true);
    expect(shouldShowOnDate(habit, friday)).toBe(true);
    expect(shouldShowOnDate(habit, saturday)).toBe(false); // weekend — must not show
    expect(shouldShowOnDate(habit, sunday)).toBe(false);   // weekend — must not show
  });

  it('custom habit with repeatDays=[1,3,5] appears only on Mon/Wed/Fri', () => {
    // repeatDays uses JS Date.getDay() indices: 0=Sun, 1=Mon, …, 6=Sat
    const habit = { repeatFrequency: 'custom', repeatDays: [1, 3, 5] };

    const sunday    = new Date(2025, 0, 12); // Sun
    const monday    = new Date(2025, 0, 13); // Mon ✓
    const tuesday   = new Date(2025, 0, 14); // Tue
    const wednesday = new Date(2025, 0, 15); // Wed ✓
    const thursday  = new Date(2025, 0, 16); // Thu
    const friday    = new Date(2025, 0, 17); // Fri ✓
    const saturday  = new Date(2025, 0, 18); // Sat

    expect(shouldShowOnDate(habit, sunday)).toBe(false);
    expect(shouldShowOnDate(habit, monday)).toBe(true);
    expect(shouldShowOnDate(habit, tuesday)).toBe(false);
    expect(shouldShowOnDate(habit, wednesday)).toBe(true);
    expect(shouldShowOnDate(habit, thursday)).toBe(false);
    expect(shouldShowOnDate(habit, friday)).toBe(true);
    expect(shouldShowOnDate(habit, saturday)).toBe(false);
  });

  it('monthly habit with repeatMonthDay=15 appears only on the 15th', () => {
    const habit = { repeatFrequency: 'monthly', repeatMonthDay: 15 };

    // Regular month: Jan 2025 has 31 days — 15th is well within range
    const jan14 = new Date(2025, 0, 14);
    const jan15 = new Date(2025, 0, 15);
    const jan16 = new Date(2025, 0, 16);
    expect(shouldShowOnDate(habit, jan14)).toBe(false);
    expect(shouldShowOnDate(habit, jan15)).toBe(true);
    expect(shouldShowOnDate(habit, jan16)).toBe(false);

    // Edge case: Feb 2025 has 28 days — repeatMonthDay=15 is still valid
    const feb15 = new Date(2025, 1, 15);
    expect(shouldShowOnDate(habit, feb15)).toBe(true);

    // Edge case: habit with repeatMonthDay=31 in Feb (28 days) — clamps to 28th
    const shortMonthHabit = { repeatFrequency: 'monthly', repeatMonthDay: 31 };
    const feb28 = new Date(2025, 1, 28);
    const feb27 = new Date(2025, 1, 27);
    expect(shouldShowOnDate(shortMonthHabit, feb28)).toBe(true);  // clamped to last day
    expect(shouldShowOnDate(shortMonthHabit, feb27)).toBe(false);
  });
});
