import { describe, it, expect } from 'vitest';
import { REPEAT_FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/planner-types';

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

  it.todo('weekdays habit does NOT appear on Saturday or Sunday');
  // A habit with repeatFrequency="weekdays" should be filtered out when
  // selectedDate falls on a weekend.

  it.todo('custom habit with repeatDays=[1,3,5] appears only on Mon/Wed/Fri');
  // Drive selectedDate through a full week and assert visibility matches
  // the repeatDays bitmask.

  it.todo('monthly habit with repeatMonthDay=15 appears only on the 15th');
  // For months with fewer than 15 days this should gracefully handle the edge case.
});
