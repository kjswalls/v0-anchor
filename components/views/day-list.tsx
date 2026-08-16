'use client';

import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { BUCKET_ORDER } from '@/lib/day-items';
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

export type ListRow = { itemType: 'task' | 'habit'; item: Task | Habit };

/**
 * A rendered section.
 *
 * `key` is separate from `label` because they are answers to different
 * questions: the label is what the reader sees, and the key is what React
 * reconciles on. For every grouping but one they coincide, and routine grouping
 * is the exception that forced the split — two routines may share a name.
 */
export interface ListGroup {
  key: string;
  label: string;
  rows: ListRow[];
}

const group = (label: string, rows: ListRow[]): ListGroup => ({ key: label, label, rows });

export function buildListGroups(
  tasksByBucket: Record<TimeBucket, Task[]>,
  habitsByBucket: Record<TimeBucket, Habit[]>,
  groupBy: GroupBy,
  routines: readonly Routine[] = []
): ListGroup[] {
  const habits = BUCKET_ORDER.flatMap((b) => habitsByBucket[b]).map((h) => ({
    itemType: 'habit' as const,
    item: h,
  }));
  const tasks = BUCKET_ORDER.flatMap((b) => tasksByBucket[b]).map((t) => ({
    itemType: 'task' as const,
    item: t,
  }));

  if (groupBy === 'bucket') {
    return BUCKET_ORDER.map((b) =>
      group(BUCKET_LABEL[b], [
        ...habitsByBucket[b].map((h) => ({ itemType: 'habit' as const, item: h })),
        ...tasksByBucket[b].map((t) => ({ itemType: 'task' as const, item: t })),
      ])
    );
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
      ...(habits.length ? [group('Habits', habits)] : []),
      ...order.filter((k) => groups.has(k)).map((k) => group(k, groups.get(k)!)),
    ];
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
    // Grouped by routine ID, labelled by name. Names are not unique — the table
    // declares `name text not null` with no UNIQUE, rename ships from day one
    // (that is the whole point of id-referenced members), and nothing dedupes on
    // create — so keying the map on the name silently MERGED two routines into
    // one heading holding both their work, with nothing to tell them apart and
    // no way to know which reorder controls governed which rows.
    const claimed = new Map<string, { id: string; rank: number }>();
    routines.forEach((routine, i) => {
      routine.itemIds.forEach((id, rank) => {
        if (!claimed.has(id)) claimed.set(id, { id: routine.id, rank: i * 1e6 + rank });
      });
    });
    const rows = [...habits, ...tasks];
    const groups = new Map<string, typeof rows>();
    for (const routine of routines) groups.set(routine.id, []);
    const loose: typeof rows = [];
    for (const row of rows) {
      const claim = claimed.get(row.item.id);
      if (claim) groups.get(claim.id)!.push(row);
      else loose.push(row);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => claimed.get(a.item.id)!.rank - claimed.get(b.item.id)!.rank);
    }
    return [
      ...routines
        .filter((routine) => (groups.get(routine.id)?.length ?? 0) > 0)
        .map((routine) => ({ key: routine.id, label: routine.name, rows: groups.get(routine.id)! })),
      // Prefixed so a routine a user actually named "No routine" cannot collide
      // with it — group KEYS are React keys, and two sections under one key
      // reconcile against a single fiber the moment the group list changes shape.
      ...(loose.length ? [{ key: 'routine:none', label: 'No routine', rows: loose }] : []),
    ];
  }

  if (groupBy === 'project') {
    const groups = new Map<string, typeof tasks>();
    for (const row of tasks) {
      const key = (row.item as Task).project || 'No project';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [
      ...(habits.length ? [group('Habits', habits)] : []),
      ...[...groups.entries()].map(([label, rows]) => group(label, rows)),
    ];
  }

  // Default: HABITS / TASKS / PROJECTS (project-assigned tasks pulled out)
  const plainTasks = tasks.filter((r) => !(r.item as Task).project);
  const projectTasks = tasks.filter((r) => (r.item as Task).project);
  return [
    group('Habits', habits),
    group('Tasks', plainTasks),
    group('Projects', projectTasks),
  ].filter((g) => g.rows.length > 0);
}

export function DayList() {
  const { tasksByBucket, habitsByBucket, totalCount } = useDayItems();
  const { selectedDate, navDirection, routines } = usePlannerStore();
  const canvasGroupBy = useViewStore((s) => s.canvasGroupBy);

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
        {/* ProgramNotice used to sit here, above the empty state — "nothing
            planned yet" is a lie on a day whose work is real and merely away.
            It now renders once in the canvas header row beside the date
            (components/shell/desktop-shell.tsx), which qualifies the empty
            state from above just as well and reaches every day layout instead
            of the two that remembered to mount it. */}

        {totalCount === 0 ? (
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
