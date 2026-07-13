'use client';

import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BucketCard } from '@/components/primitives/bucket-card';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { ProjectBlock } from '@/components/views/project-block';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { openEditFor, openAddDialog } from '@/lib/ui-store';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { Task, Habit, Project, TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × Buckets — the default canvas view, rewritten on the primitives
 * (P5a). DnD droppable ids follow lib/dnd/CONTRACT.md exactly:
 *   {bucket}                      whole-card highlight + fallback drop
 *   unscheduled:{bucket}          untimed section (drop → no time)
 *   scheduled:{bucket}:{pos}:{refType}:{refId} + scheduled:{bucket}:empty
 */

function ScheduledDropZone({ dropId, isActive }: { dropId: string; isActive: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  if (!isActive) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        '-my-0.5 h-2 rounded transition-all',
        isOver ? 'my-1 h-8 border-2 border-dashed border-primary bg-primary/15' : 'bg-transparent'
      )}
    />
  );
}

function EmptyBucketDropZone({ bucket }: { bucket: TimeBucket }) {
  const { isOver, setNodeRef } = useDroppable({ id: `scheduled:${bucket}:empty` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center rounded-lg border-2 border-dashed transition-all',
        isOver ? 'h-16 border-primary bg-primary/10' : 'h-10 border-border/60 bg-surface-3/50'
      )}
    >
      <span className={cn('text-xs', isOver ? 'text-success-text' : 'text-muted-foreground')}>
        Drop here to schedule with time
      </span>
    </div>
  );
}

/** Current time-of-day bucket, minute-refreshed; null when not viewing today. */
function useCurrentBucket(selectedDate: Date): TimeBucket | null {
  const [current, setCurrent] = useState<TimeBucket | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      if (now.toDateString() !== selectedDate.toDateString()) {
        setCurrent(null);
        return;
      }
      const hour = now.getHours();
      setCurrent(hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening');
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [selectedDate]);
  return current;
}

interface DayBucketProps {
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  recurringProjects: Project[];
  activeId: string | null;
  isCurrent: boolean;
}

function DayBucket({ bucket, tasks, habits, recurringProjects, activeId, isCurrent }: DayBucketProps) {
  const canvasGroupBy = useViewStore((s) => s.canvasGroupBy);
  const dragging = !!activeId;

  // Whole-card droppable: highlight + fallback drop target (bare bucket id)
  const { isOver, setNodeRef: setBucketRef } = useDroppable({ id: bucket });
  const { isOver: isOverUnscheduled, setNodeRef: setUnscheduledRef } = useDroppable({
    id: `unscheduled:${bucket}`,
  });

  const untimedTasks = tasks.filter((t) => !t.startTime && !t.inProjectBlock);
  const timedTasks = tasks.filter((t) => t.startTime && !t.inProjectBlock);
  const untimedHabits = habits.filter((h) => !h.startTime);
  const timedHabits = habits.filter((h) => h.startTime);

  const totalItems = tasks.length + habits.length;
  const hasUntimed = untimedTasks.length > 0 || untimedHabits.length > 0;
  const hasTimed = timedTasks.length > 0 || timedHabits.length > 0;
  const bucketProjects = recurringProjects.filter((p) => p.timeBucket === bucket);

  // Untimed task groups: by type (default) or by project
  const untimedTaskGroups: [string, Task[]][] =
    canvasGroupBy === 'project'
      ? [...untimedTasks.reduce((m, t) => {
          const key = t.project || 'No project';
          m.set(key, [...(m.get(key) ?? []), t]);
          return m;
        }, new Map<string, Task[]>())]
      : untimedTasks.length
        ? [['Tasks', untimedTasks]]
        : [];

  // Timed rows flat, sorted by time (already time-sorted from deriveDayItems)
  const timedRows = [
    ...timedHabits.map((h) => ({ type: 'habit' as const, item: h, time: h.startTime! })),
    ...timedTasks.map((t) => ({ type: 'task' as const, item: t, time: t.startTime! })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div ref={setBucketRef} data-dnd-bucket={bucket}>
      <BucketCard
        bucket={bucket}
        count={totalItems}
        onAdd={(b, type) => openAddDialog(type, b, usePlannerStore.getState().selectedDate)}
        isCurrent={isCurrent}
        isDropTarget={isOver || isOverUnscheduled}
      >
        {/* Unscheduled section — dedicated drop target, mounted whenever
            dragging so the rect is measurable (see CONTRACT.md). */}
        {(hasUntimed || dragging) && (
          <div
            ref={setUnscheduledRef}
            data-dnd-id={`unscheduled:${bucket}`}
            className="space-y-2 pl-4"
          >
            {untimedHabits.length > 0 && (
              <GroupSection label="Habits">
                {untimedHabits.map((habit) => (
                  <TaskRow key={habit.id} row={{ itemType: 'habit', item: habit }} />
                ))}
              </GroupSection>
            )}
            {untimedTaskGroups.map(([label, groupTasks]) => (
              <GroupSection key={label} label={label}>
                {groupTasks.map((task) => (
                  <TaskRow key={task.id} row={{ itemType: 'task', item: task }} />
                ))}
              </GroupSection>
            ))}
            {!hasUntimed && dragging && (
              <div className="py-3 text-center text-xs text-muted-foreground/50">
                Drop here to add unscheduled
              </div>
            )}
          </div>
        )}

        {/* Divider between untimed and timed */}
        {hasUntimed && (hasTimed || bucketProjects.length > 0) && bucket !== 'anytime' && (
          <div className="flex items-center gap-2 py-2">
            <div className="h-px flex-1 bg-border" />
            <Clock className="h-3 w-3 text-muted-foreground/50" />
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* Scheduled section: project blocks + timed rows */}
        {(hasTimed || bucketProjects.length > 0 || dragging) && (
          <div className={cn('pl-4', hasUntimed ? '' : 'pt-1')}>
            {bucketProjects.map((project) => (
              <ProjectBlock
                key={project.name}
                project={project}
                tasks={tasks.filter((t) => t.project === project.name)}
                onTaskClick={(task) => openEditFor(task, 'task')}
                activeId={activeId}
              />
            ))}

            {timedRows.map((entry, idx) => (
              <div key={entry.item.id}>
                <ScheduledDropZone
                  dropId={`scheduled:${bucket}:before:${entry.type}:${entry.item.id}`}
                  isActive={dragging}
                />
                <TaskRow row={{ itemType: entry.type, item: entry.item } as never} />
                {idx === timedRows.length - 1 && (
                  <ScheduledDropZone
                    dropId={`scheduled:${bucket}:after:${entry.type}:${entry.item.id}`}
                    isActive={dragging}
                  />
                )}
              </div>
            ))}

            {!hasTimed && dragging && bucket !== 'anytime' && <EmptyBucketDropZone bucket={bucket} />}
          </div>
        )}

        {/* Completely empty, not dragging */}
        {totalItems === 0 && bucketProjects.length === 0 && !dragging && (
          <p className="py-2 pl-4 font-serif text-sm italic text-muted-foreground/60">
            Nothing here yet — drag something in, or hit +
          </p>
        )}
      </BucketCard>
    </div>
  );
}

export function DayBuckets({ activeId }: { activeId: string | null }) {
  const { tasksByBucket, habitsByBucket, recurringProjects } = useDayItems();
  const { selectedDate, navDirection } = usePlannerStore();
  const currentBucket = useCurrentBucket(selectedDate);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container space-y-6 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {BUCKET_ORDER.map((bucket) => (
          <DayBucket
            key={bucket}
            bucket={bucket}
            tasks={tasksByBucket[bucket]}
            habits={habitsByBucket[bucket]}
            recurringProjects={recurringProjects}
            activeId={activeId}
            isCurrent={mounted && currentBucket === bucket}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
