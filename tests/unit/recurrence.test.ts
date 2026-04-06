import { describe, it, expect } from 'vitest';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { shouldShowOnDate, toDateStr } from '@/lib/recurrence';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('habit / task recurrence logic', () => {
  // Real test — label maps are pure data, trivially verifiable
  it('REPEAT_FREQUENCY_LABELS contains all RepeatFrequency values', () => {
    const expected = ['none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'];
    expect(Object.keys(REPEAT_FREQUENCY_LABELS)).toEqual(expect.arrayContaining(expected));
    expect(Object.keys(REPEAT_FREQUENCY_LABELS)).toHaveLength(expected.length);
  });

  it('WEEKDAY_LABELS has 7 entries starting with Sun', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe('Sun');
    expect(WEEKDAY_LABELS[6]).toBe('Sat');
  });

  it('daily habit appears on every day of the week (#90 — wrong-day bug)', () => {
    const habit = { repeatFrequency: 'daily' };

    // Use a known week: Mon Jan 13 – Sun Jan 19, 2025
    expect(shouldShowOnDate(habit, '2025-01-13', tz)).toBe(true); // Monday
    expect(shouldShowOnDate(habit, '2025-01-14', tz)).toBe(true); // Tuesday
    expect(shouldShowOnDate(habit, '2025-01-15', tz)).toBe(true); // Wednesday
    expect(shouldShowOnDate(habit, '2025-01-16', tz)).toBe(true); // Thursday
    expect(shouldShowOnDate(habit, '2025-01-17', tz)).toBe(true); // Friday
    expect(shouldShowOnDate(habit, '2025-01-18', tz)).toBe(true); // Saturday
    expect(shouldShowOnDate(habit, '2025-01-19', tz)).toBe(true); // Sunday
  });

  it('weekdays habit does NOT appear on Saturday or Sunday', () => {
    const habit = { repeatFrequency: 'weekdays' };

    // Use a known week: Mon Jan 13 – Sun Jan 19, 2025
    expect(shouldShowOnDate(habit, '2025-01-13', tz)).toBe(true);  // Monday
    expect(shouldShowOnDate(habit, '2025-01-14', tz)).toBe(true);  // Tuesday
    expect(shouldShowOnDate(habit, '2025-01-15', tz)).toBe(true);  // Wednesday
    expect(shouldShowOnDate(habit, '2025-01-16', tz)).toBe(true);  // Thursday
    expect(shouldShowOnDate(habit, '2025-01-17', tz)).toBe(true);  // Friday
    expect(shouldShowOnDate(habit, '2025-01-18', tz)).toBe(false); // Saturday — must not show
    expect(shouldShowOnDate(habit, '2025-01-19', tz)).toBe(false); // Sunday — must not show
  });

  it('custom habit with repeatDays=[1,3,5] appears only on Mon/Wed/Fri', () => {
    // repeatDays uses JS Date.getDay() indices: 0=Sun, 1=Mon, …, 6=Sat
    const habit = { repeatFrequency: 'custom', repeatDays: [1, 3, 5] };

    expect(shouldShowOnDate(habit, '2025-01-12', tz)).toBe(false); // Sunday
    expect(shouldShowOnDate(habit, '2025-01-13', tz)).toBe(true);  // Monday ✓
    expect(shouldShowOnDate(habit, '2025-01-14', tz)).toBe(false); // Tuesday
    expect(shouldShowOnDate(habit, '2025-01-15', tz)).toBe(true);  // Wednesday ✓
    expect(shouldShowOnDate(habit, '2025-01-16', tz)).toBe(false); // Thursday
    expect(shouldShowOnDate(habit, '2025-01-17', tz)).toBe(true);  // Friday ✓
    expect(shouldShowOnDate(habit, '2025-01-18', tz)).toBe(false); // Saturday
  });

  it('weekly frequency with repeatDays=[1,3,5] behaves identically to custom with same repeatDays', () => {
    const weeklyHabit = { repeatFrequency: 'weekly', repeatDays: [1, 3, 5] };
    const customHabit = { repeatFrequency: 'custom', repeatDays: [1, 3, 5] };

    const dates = ['2025-01-12', '2025-01-13', '2025-01-14', '2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18'];
    for (const dateStr of dates) {
      expect(shouldShowOnDate(weeklyHabit, dateStr, tz)).toBe(shouldShowOnDate(customHabit, dateStr, tz));
    }
  });

  it('monthly habit with repeatMonthDay=15 appears only on the 15th', () => {
    const habit = { repeatFrequency: 'monthly', repeatMonthDay: 15 };

    // Regular month: Jan 2025 has 31 days — 15th is well within range
    expect(shouldShowOnDate(habit, '2025-01-14', tz)).toBe(false);
    expect(shouldShowOnDate(habit, '2025-01-15', tz)).toBe(true);
    expect(shouldShowOnDate(habit, '2025-01-16', tz)).toBe(false);

    // Edge case: Feb 2025 has 28 days — repeatMonthDay=15 is still valid
    expect(shouldShowOnDate(habit, '2025-02-15', tz)).toBe(true);

    // Edge case: habit with repeatMonthDay=31 in Feb (28 days) — clamps to 28th
    const shortMonthHabit = { repeatFrequency: 'monthly', repeatMonthDay: 31 };
    expect(shouldShowOnDate(shortMonthHabit, '2025-02-28', tz)).toBe(true);  // clamped to last day
    expect(shouldShowOnDate(shortMonthHabit, '2025-02-27', tz)).toBe(false);
  });
});
