import type { TimeBucket } from '../planner-types';

/**
 * Infer a concrete HH:mm for an item dropped into a bucket's scheduled
 * section. Extracted from timeline.tsx so all views (and the shell's drop
 * handler) share it. Positions per lib/dnd/CONTRACT.md:
 *   empty  — dropped into an empty bucket: now if inside the bucket window,
 *            else the window start
 *   before — 30min before the reference row, clamped to the window start
 *   after  — 30min after the reference row, clamped to the window end
 */
export function inferDropTime(
  bucket: TimeBucket,
  position: 'empty' | 'before' | 'after',
  referenceTime?: string
): string {
  const now = new Date();
  const ranges: Record<TimeBucket, { start: number; end: number }> = {
    anytime: { start: 0, end: 24 },
    morning: { start: 5, end: 12 },
    afternoon: { start: 12, end: 17 },
    evening: { start: 17, end: 24 },
  };
  const range = ranges[bucket];

  if (position === 'empty') {
    // Use current time if within bucket, otherwise bucket start
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour >= range.start && currentHour < range.end) {
      return `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    }
    return `${String(range.start).padStart(2, '0')}:00`;
  }

  if (!referenceTime) {
    return `${String(range.start).padStart(2, '0')}:00`;
  }

  const [refHour, refMinute] = referenceTime.split(':').map(Number);

  if (position === 'before') {
    // 30 minutes before reference, but not before bucket start
    let newMinute = refMinute - 30;
    let newHour = refHour;
    if (newMinute < 0) {
      newMinute += 60;
      newHour -= 1;
    }
    if (newHour < range.start) {
      newHour = range.start;
      newMinute = 0;
    }
    return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
  }

  // position === 'after'
  // 30 minutes after reference, but not after bucket end
  let newMinute = refMinute + 30;
  let newHour = refHour;
  if (newMinute >= 60) {
    newMinute -= 60;
    newHour += 1;
  }
  if (newHour >= range.end) {
    newHour = range.end - 1;
    newMinute = 30;
  }
  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}
