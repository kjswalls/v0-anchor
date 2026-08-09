'use client';

import { useMemo } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { toDateStr } from '@/lib/recurrence';
import { deriveDayItems, type DayItems } from '@/lib/day-items';
import { inactiveItemIdsOn } from '@/lib/active';

/**
 * Store-connected wrapper around deriveDayItems — the single data path for
 * every canvas view. Pass a date (defaults to the selected day) so week
 * views can call it per column.
 */
export function useDayItems(date?: Date): DayItems {
  const {
    tasks,
    habits,
    projects,
    items,
    routines,
    programs,
    selectedDate,
    showCompletedTasks,
    userTimezone,
  } = usePlannerStore();
  const typeFilter = useViewStore((s) => s.typeFilter);
  const canvasFilters = useViewStore((s) => s.canvasFilters);

  const target = date ?? selectedDate;
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return useMemo(() => {
    const dateStr = toDateStr(target, timezone);
    return deriveDayItems({
      tasks,
      habits,
      projects,
      date: target,
      dateStr,
      timezone,
      typeFilter,
      showCompletedTasks,
      filters: canvasFilters,
      // Resolved against THIS column's date, not the store's selectedDate: a
      // week view renders seven days at once, and a pause that ends mid-week
      // must show the handoff in the right column.
      inactiveItemIds: inactiveItemIdsOn(items, dateStr, {
        userTimezone: timezone,
        routines,
        programs,
      }),
    });
  }, [tasks, habits, projects, items, routines, programs, target, timezone, typeFilter, showCompletedTasks, canvasFilters]);
}
