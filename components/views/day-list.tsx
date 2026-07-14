'use client';

import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { Task, Habit, GroupBy, TimeBucket } from '@/lib/planner-types';
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
  groupBy: GroupBy
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
  const { selectedDate, navDirection } = usePlannerStore();
  const canvasGroupBy = useViewStore((s) => s.canvasGroupBy);

  const groups = buildListGroups(tasksByBucket, habitsByBucket, canvasGroupBy);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container space-y-5 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {totalCount === 0 ? (
          <div className="py-16 text-center">
            <p className="font-serif text-lg italic text-muted-foreground">
              Nothing planned for {format(selectedDate, 'EEEE')} yet.
            </p>
          </div>
        ) : (
          groups.map(([label, rows]) => (
            <GroupSection key={label} label={label}>
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
