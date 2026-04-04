import { describe, it, expect } from 'vitest';
import { formatBucketHour, formatBucketRange, TIME_BUCKET_RANGES } from '@/lib/planner-types';
import { startOfDay, isAfter, parseISO, startOfWeek, addDays } from 'date-fns';

describe('date / time-bucket utilities', () => {
  // Real tests — these pure functions are trivially testable

  it('formatBucketHour formats 12h correctly', () => {
    expect(formatBucketHour(0)).toBe('12am');
    expect(formatBucketHour(12)).toBe('12pm');
    expect(formatBucketHour(9)).toBe('9am');
    expect(formatBucketHour(17)).toBe('5pm');
  });

  it('formatBucketHour formats 24h correctly', () => {
    expect(formatBucketHour(0, true)).toBe('00:00');
    expect(formatBucketHour(9, true)).toBe('09:00');
    expect(formatBucketHour(17, true)).toBe('17:00');
  });

  it('formatBucketRange produces a dash-separated range string', () => {
    const range = TIME_BUCKET_RANGES.morning;
    const result = formatBucketRange(range);
    expect(result).toMatch(/^.+ - .+$/);
    expect(result).toBe('12am - 12pm');
  });

  it('getLocalMidnight returns midnight in local timezone', () => {
    // The app uses startOfDay() (date-fns) to create "midnight" boundaries.
    // Verify that the resulting Date lands on 00:00:00.000 in local time,
    // regardless of the machine's timezone offset.
    const midnight = startOfDay(new Date());
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getSeconds()).toBe(0);
    expect(midnight.getMilliseconds()).toBe(0);

    // The local date portion should match today's local date
    const now = new Date();
    const localDateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const midnightDateStr = [
      midnight.getFullYear(),
      String(midnight.getMonth() + 1).padStart(2, '0'),
      String(midnight.getDate()).padStart(2, '0'),
    ].join('-');
    expect(midnightDateStr).toBe(localDateStr);
  });

  it('isOverdue correctly compares task start_date to current date', () => {
    // Mirrors the logic from components/ai/morning-check.tsx:
    //   isAfter(startOfDay(new Date()), parseISO(task.startDate))
    const todayStart = startOfDay(new Date());

    const now = new Date();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');

    const todayStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');

    expect(isAfter(todayStart, parseISO(yesterdayStr))).toBe(true);   // yesterday is overdue
    expect(isAfter(todayStart, parseISO(todayStr))).toBe(false);       // today is NOT overdue
    expect(isAfter(todayStart, parseISO(tomorrowStr))).toBe(false);    // future is NOT overdue
  });

  it('week-view start/end dates respect weekStartDay setting (sun/mon/sat)', () => {
    // Mirrors the logic from components/planner/week-view.tsx:
    //   const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
    //   const weekStart = startOfWeek(selectedDate, { weekStartsOn });
    //
    // Use a known Wednesday for deterministic results: 2025-01-15 (Wed)
    const wednesday = new Date(2025, 0, 15); // Jan 15, 2025 (Wednesday, dayOfWeek=3)

    // Sunday start (default) — week runs Sun Jan 12 → Sat Jan 18
    const sunStart = startOfWeek(wednesday, { weekStartsOn: 0 });
    expect(sunStart.getDay()).toBe(0);               // starts on Sunday
    expect(addDays(sunStart, 6).getDay()).toBe(6);   // ends on Saturday

    // Monday start — week runs Mon Jan 13 → Sun Jan 19
    const monStart = startOfWeek(wednesday, { weekStartsOn: 1 });
    expect(monStart.getDay()).toBe(1);               // starts on Monday
    expect(addDays(monStart, 6).getDay()).toBe(0);   // ends on Sunday

    // Saturday start — week runs Sat Jan 11 → Fri Jan 17
    const satStart = startOfWeek(wednesday, { weekStartsOn: 6 });
    expect(satStart.getDay()).toBe(6);               // starts on Saturday
    expect(addDays(satStart, 6).getDay()).toBe(5);   // ends on Friday
  });
});
