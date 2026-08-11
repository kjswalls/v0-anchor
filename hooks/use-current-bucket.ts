'use client';

import { useEffect, useState } from 'react';
import type { TimeBucket } from '@/lib/planner-types';

/**
 * The time-of-day bucket you are currently in, minute-refreshed.
 *
 * Pass a date to scope it — the result is null unless that date is today. Pass
 * nothing to mean "whatever bucket it is right now, regardless of what is on
 * screen"; week does that and gates per column with isToday, because seven
 * columns must not mount seven clocks.
 *
 * Lifted out of day-buckets.tsx so week can use it too. Call it ONCE per view
 * and thread the result down — a week column renders four bucket cells across
 * seven days, and calling this per cell would mount 28 intervals for one clock.
 *
 * Returning null on the first render is deliberate and is the hydration guard:
 * the answer depends on the client's wall clock, so a server pass that rendered
 * a real bucket would hydrate a mismatch. Callers do NOT need their own
 * `mounted` flag on top of this.
 */
export function useCurrentBucket(date?: Date): TimeBucket | null {
  // Key off the calendar day, never the Date identity. `useCurrentBucket(new
  // Date())` in a render body produces a fresh object every pass, and a [date]
  // dep would then tear down and rebuild the interval on every render.
  const dayKey = date?.toDateString();
  const [current, setCurrent] = useState<TimeBucket | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      if (dayKey !== undefined && now.toDateString() !== dayKey) {
        setCurrent(null);
        return;
      }
      const hour = now.getHours();
      setCurrent(
        hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening'
      );
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [dayKey]);

  return current;
}
