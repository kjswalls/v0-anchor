'use client';

import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { BUCKET_ORDER } from '@/lib/day-items';
import { ProgramNotice } from '@/components/views/program-notice';
import { toDateStr } from '@/lib/recurrence';
import type { Task, Habit, GroupBy, TimeBucket, Routine } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × List (P5c): one flat, full-width list in slash-label groups (see
 * design/redesign/desktop_day_listView.png). Default grouping: HABITS /
 * TASKS / PROJECTS; canvasGroupBy overrides. Rows stay drag sources; there
 * are no in-canvas drop targets in list layout (drops go to the Braindump).
 */

const BUCKET_LABEL: Record<TimeBucket, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export function buildListGroups(
  tasksByBucket: Record<TimeBucket, Task[]>,
  habitsByBucket: Record<TimeBucket, Habit[]>,
  groupBy: GroupBy,
  routines: readonly Routine[] = []
): [string, { itemType: 'task' | 'habit'; item: Task | Habit }[]][] {
  const habits = BUCKET_ORDER.flatMap((b) => habitsByBucket[b]).map((h) => ({
    itemType: 'habit' as const,
    item: h,
  }));
  const tasks = BUCKET_ORDER.flatMap((b) => tasksByBucket[b]).map((t) => ({
    itemType: 'task' as const,
    item: t,
  }));

  if (groupBy === 'bucket') {
    return BUCKET_ORDER.map((b) => [
      BUCKET_LABEL[b],
      [
        ...habitsByBucket[b].map((h) => ({ itemType: 'habit' as const, item: h })),
        ...tasksByBucket[b].map((t) => ({ itemType: 'task' as const, item: t })),
      ],
    ]);
  }

  if (groupBy === 'priority') {
    const order = ['High', 'Medium', 'Low', 'No priority'];
    const groups = new Map<string, typeof tasks>();
    for (const row of tasks) {
      const p = (row.item as Task).priority;
      const key = p ? p.charAt(0).toUpperCase() + p.slice(1) : 'No priority';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [
      ...(habits.length ? ([['Habits', habits]] as const) : []),
      ...order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!] as const),
    ] as [string, typeof tasks][];
  }

  if (groupBy === 'routine') {
    // Habits AND tasks, unlike every other grouping here: a routine holds both,
    // and pulling habits into their own section would put half of a morning
    // routine outside the group named after it.
    //
    // ONE row, ONE group. An item can belong to several routines, and rendering
    // it under each would be the Outliner's known failure — two checkboxes for
    // one obligation, and a second copy that shift-range and ⌘A silently skip
    // (the braindump's Paused section documents the same trap). It lands in the
    // first routine that claims it, in store order.
    //
    // Members are ordered by the routine's OWN sequence (routine_items.sort_order,
    // which is the array's index), which is what the manager's reorder controls
    // write. It is the only place that order is visible outside the manager, and
    // it is why the two shipped together.
    const claimed = new Map<string, { key: string; rank: number }>();
    routines.forEach((routine, i) => {
      routine.itemIds.forEach((id, rank) => {
        if (!claimed.has(id)) claimed.set(id, { key: routine.name, rank: i * 1e6 + rank });
      });
    });
    const rows = [...habits, ...tasks];
    const groups = new Map<string, typeof rows>();
    for (const routine of routines) groups.set(routine.name, []);
    const loose: typeof rows = [];
    for (const row of rows) {
      const claim = claimed.get(row.item.id);
      if (claim) groups.get(claim.key)!.push(row);
      else loose.push(row);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => claimed.get(a.item.id)!.rank - claimed.get(b.item.id)!.rank);
    }
    return [
      ...[...groups.entries()].filter(([, list]) => list.length > 0),
      ...(loose.length ? ([['No routine', loose]] as const) : []),
    ] as [string, typeof rows][];
  }

  if (groupBy === 'project') {
    const groups = new Map<string, typeof tasks>();
    for (const row of tasks) {
      const key = (row.item as Task).project || 'No project';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [
      ...(habits.length ? ([['Habits', habits]] as const) : []),
      ...[...groups.entries()],
    ] as [string, typeof tasks][];
  }

  // Default: HABITS / TASKS / PROJECTS (project-assigned tasks pulled out)
  const plainTasks = tasks.filter((r) => !(r.item as Task).project);
  const projectTasks = tasks.filter((r) => (r.item as Task).project);
  return [
    ['Habits', habits],
    ['Tasks', plainTasks],
    ['Projects', projectTasks],
  ].filter(([, rows]) => rows.length > 0) as [string, typeof tasks][];
}

export function DayList() {
  const { tasksByBucket, habitsByBucket, totalCount } = useDayItems();
  const { selectedDate, navDirection, userTimezone, routines } = usePlannerStore();
  const canvasGroupBy = useViewStore((s) => s.canvasGroupBy);
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const groups = buildListGroups(tasksByBucket, habitsByBucket, canvasGroupBy, routines);

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

        {totalCount === 0 ? (
          <div className="py-16 text-center">
            <p className="font-serif text-lg italic text-muted-foreground">
              Nothing planned for {format(selectedDate, 'EEEE')} yet.
            </p>
          </div>
        ) : (
          groups.map(([label, rows]) => (
            <GroupSection key={label} label={label} variant="canvas">
              {rows.map((row) => (
                <TaskRow key={row.item.id} row={row as never} />
              ))}
            </GroupSection>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
