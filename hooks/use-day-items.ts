'use client';

import { useMemo } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { toDateStr } from '@/lib/recurrence';
import { deriveDayItems, type DayItems } from '@/lib/day-items';

/**
 * Store-connected wrapper around deriveDayItems — the single data path for
 * every canvas view. Pass a date (defaults to the selected day) so week
 * views can call it per column.
 */
export function useDayItems(date?: Date): DayItems {
  const { tasks, habits, projects, selectedDate, showCompletedTasks, userTimezone } =
    usePlannerStore();
  const typeFilter = useViewStore((s) => s.typeFilter);

  const target = date ?? selectedDate;
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return useMemo(
    () =>
      deriveDayItems({
        tasks,
        habits,
        projects,
        date: target,
        dateStr: toDateStr(target, timezone),
        timezone,
        typeFilter,
        showCompletedTasks,
      }),
    [tasks, habits, projects, target, timezone, typeFilter, showCompletedTasks]
  );
}
