'use client';

import { useMemo } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { toDateStr } from '@/lib/recurrence';
import { deriveDayItems, type DayItems } from '@/lib/day-items';
import { inactiveItemIdsOn } from '@/lib/active';

/**
 * Store-connected wrapper around deriveDayItems — the single data path for
 * every canvas view.
 *
 * PLURAL is the real hook; `useDayItems` is the one-element case. It reads that
 * way round because of Week × Schedule: it needs all seven columns resolved
 * before it can render any of them (the shared hour range spans the union of
 * every day's items), so it cannot call a per-date hook from a column child the
 * way Week × List and Week × Buckets do. Given only a singular hook, its only
 * option was to inline deriveDayItems itself — which is what it did, as a
 * verbatim copy of this file's body including the inactiveItemIds block and its
 * comment. Two implementations of one pipeline, and the canvas filter work adds
 * a rule to it every phase.
 */
export function useDayItemsForDates(dates: Date[]): DayItems[] {
  const {
    tasks,
    habits,
    projects,
    items,
    routines,
    programs,
    showCompletedTasks,
    showPausedOnGrid,
    userTimezone,
  } = usePlannerStore();
  const typeFilter = useViewStore((s) => s.typeFilter);
  const canvasFilters = useViewStore((s) => s.canvasFilters);

  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  /**
   * The memo key for `dates`, since a fresh array every render would defeat it.
   *
   * `getTime()` and not the resolved dateStr: deriveDayItems reads the Date for
   * weekday/month-day recurrence via getDay()/getDate(), which are browser-local
   * while toDateStr resolves in `timezone`. When those two zones differ, two
   * instants can share a dateStr and disagree on getDay() — so a dateStr key
   * would serve one column another column's weekday. An exact instant key
   * cannot: same time in, same derivation out.
   *
   * This is strictly more stable than the reference dep it replaces, so no
   * caller re-derives more often than it used to.
   */
  const dateKey = dates.map((d) => d.getTime()).join(',');

  return useMemo(
    () =>
      dates.map((date) => {
        const dateStr = toDateStr(date, timezone);
        return deriveDayItems({
          tasks,
          habits,
          projects,
          date,
          dateStr,
          timezone,
          typeFilter,
          showCompletedTasks,
          filters: canvasFilters,
          // Resolved against THIS column's date, not the store's selectedDate: a
          // week view renders seven days at once, and a pause that ends mid-week
          // — or a program's range starting on Wednesday — must show the handoff
          // in the right column rather than blanking or filling all seven.
          //
          // `showPausedOnGrid` drops the exclusion rather than emptying the set: the
          // rows still have to KNOW they are suppressed to render greyed, and they
          // re-ask the resolver at their own rendered date (see task-row.tsx). One
          // shared set threaded through here would be resolved at whichever column
          // built it, which is the wrong-date bug Phases 1 and 3 each shipped once.
          inactiveItemIds: showPausedOnGrid
            ? undefined
            : inactiveItemIdsOn(items, dateStr, {
                userTimezone: timezone,
                routines,
                programs,
              }),
        });
      }),
    // `dateKey` stands in for `dates` — see the note above it. Listing `dates`
    // as well would re-derive on every render for the array-literal callers,
    // which is every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey, tasks, habits, projects, items, routines, programs, timezone, typeFilter, showCompletedTasks, showPausedOnGrid, canvasFilters]
  );
}

/**
 * One day's items. Pass a date (defaults to the selected day) so week views can
 * call it per column.
 */
export function useDayItems(date?: Date): DayItems {
  const selectedDate = usePlannerStore((s) => s.selectedDate);
  // The array literal is rebuilt every render and that is fine — the memo
  // inside keys on the instant, not on this array's identity.
  return useDayItemsForDates([date ?? selectedDate])[0];
}
