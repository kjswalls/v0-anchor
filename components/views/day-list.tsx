'use client';

import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { flattenDayRows } from '@/lib/day-items';
import { groupRows, type RowGroup } from '@/lib/grouping';
import { sortRows } from '@/lib/sort-rows';
import { ProgramNotice } from '@/components/views/program-notice';
import { toDateStr } from '@/lib/recurrence';
import type { Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × List (P5c): one flat, full-width list in slash-label groups (see
 * design/redesign/desktop_day_listView.png). Default grouping: HABITS /
 * TASKS / PROJECTS; canvasGroupBy overrides. Rows stay drag sources; there
 * are no in-canvas drop targets in list layout (drops go to the Braindump).
 */

export type ListRow = { itemType: 'task' | 'habit'; item: Task | Habit };

/**
 * This view's no-grouping look: HABITS / TASKS / PROJECTS.
 *
 * Local, not in lib/grouping.ts, because it is a presentation choice for this
 * one view rather than an answer to "group by what" — Week × List's 'none' is a
 * flat list, the braindump's is a flat list, and the shared core's `'none'` is
 * one unlabelled section so each surface can render its own.
 */
function defaultListGroups(rows: ListRow[]): RowGroup<ListRow>[] {
  const habits = rows.filter((r) => r.itemType === 'habit');
  const tasks = rows.filter((r) => r.itemType === 'task');
  return [
    { key: 'Habits', label: 'Habits', rows: habits },
    { key: 'Tasks', label: 'Tasks', rows: tasks.filter((r) => !(r.item as Task).project) },
    { key: 'Projects', label: 'Projects', rows: tasks.filter((r) => (r.item as Task).project) },
  ].filter((g) => g.rows.length > 0);
}

export function DayList() {
  const day = useDayItems();
  const { selectedDate, navDirection, userTimezone, routines } = usePlannerStore();
  const canvasGroupBy = useViewStore((s) => s.canvasGroupBy);
  const sortBy = useViewStore((s) => s.canvasSortBy);
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  /**
   * Sorted WITHIN each group, after grouping — the two axes are independent and
   * grouping owns the outer order.
   *
   * 'default' returns the same array, so routine grouping keeps the routine's
   * own sequence (routine_items.sort_order, the only place that order is visible
   * outside the manager). An explicit Ordering overrides it, which is the right
   * precedence: the user asked for it on this surface, now.
   */
  const rows = flattenDayRows(day);
  const groups = (
    canvasGroupBy === 'none' ? defaultListGroups(rows) : groupRows(rows, canvasGroupBy, { routines })
  ).map((g) => ({ ...g, rows: sortRows(g.rows, sortBy) }));

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container space-y-5 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {/* Before the empty state, not after it: "nothing planned yet" is a
            lie on a day whose work is real and merely away, and that is exactly
            the day this line exists for. */}
        <ProgramNotice dateStr={toDateStr(selectedDate, timezone)} />

        {day.totalCount === 0 ? (
          <div className="py-16 text-center">
            <p className="font-serif text-lg italic text-muted-foreground">
              Nothing planned for {format(selectedDate, 'EEEE')} yet.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <GroupSection key={g.key} label={g.label} variant="canvas">
              {g.rows.map((row) => (
                <TaskRow key={row.item.id} row={row as never} />
              ))}
            </GroupSection>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
