'use client';

import { useDroppable } from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BucketCard, bucketGap } from '@/components/primitives/bucket-card';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { ProjectBlock } from '@/components/views/project-block';
import { useCurrentBucket } from '@/hooks/use-current-bucket';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore, type BucketStyle } from '@/lib/view-store';
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
      // CONTRACT.md declares this droppable but it used to emit no DOM marker,
      // which made it both untestable and invisible to a test aiming nearby —
      // collision is closestCenter, so a drop meant for unscheduled:{bucket}
      // can silently resolve here instead and assign a TIME.
      data-dnd-id={dropId}
      data-dnd-over={isOver ? 'true' : 'false'}
      className={cn('-my-0.5 flex h-2 items-center transition-all', isOver && 'my-1 h-6')}
    >
      {/* A solid 2px rule, not a dashed box. The dashed rectangle was the only
          drop affordance in the view that looked nothing like the view; a rule
          where the row will land is the same gesture the schedule grid uses.
          Lime never takes alpha — see the NowMarker. */}
      <span
        aria-hidden
        className={cn(
          'h-[2px] w-full rounded-[1px] transition-colors',
          isOver ? 'bg-primary' : 'bg-transparent'
        )}
      />
    </div>
  );
}

function EmptyBucketDropZone({ bucket }: { bucket: TimeBucket }) {
  const { isOver, setNodeRef } = useDroppable({ id: `scheduled:${bucket}:empty` });
  return (
    <div
      ref={setNodeRef}
      data-dnd-id={`scheduled:${bucket}:empty`}
      data-dnd-over={isOver ? 'true' : 'false'}
      // A step BELOW the slot it sits in, in every state, so it never flattens
      // into an armed bucket. --chip-well would be the token if the recessed
      // -container contract lands; against the open slot's 0.9737 / 0.1878 the
      // well reads at −0.016 / −0.019 either way.
      className={cn(
        'flex items-center justify-center rounded-lg transition-all',
        isOver ? 'h-12 bg-[var(--bkt-tray-armed)]' : 'h-10 bg-[color-mix(in_oklab,var(--bkt-tray),var(--surface-3)_55%)]'
      )}
    >
      {isOver ? (
        <span aria-hidden className="h-[2px] w-[calc(100%-24px)] rounded-[1px] bg-primary" />
      ) : (
        <span className="text-xs text-muted-foreground">Drop here to schedule with time</span>
      )}
    </div>
  );
}

interface DayBucketProps {
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  recurringProjects: Project[];
  activeId: string | null;
  isCurrent: boolean;
  variant: BucketStyle;
}

function DayBucket({ bucket, tasks, habits, recurringProjects, activeId, isCurrent, variant }: DayBucketProps) {
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
    <div
      ref={setBucketRef}
      data-dnd-bucket={bucket}
      data-dnd-id={bucket}
      // `isOver` on the bare bucket only — the untimed section reports its own
      // hover below, and a drag helper needs to know which of the two it is on
      // before it releases the pointer.
      data-dnd-over={isOver ? 'true' : 'false'}
    >
      <BucketCard
        bucket={bucket}
        count={totalItems}
        onAdd={(b, type) => openAddDialog(type, b, usePlannerStore.getState().selectedDate)}
        isCurrent={isCurrent}
        isDropTarget={isOver || isOverUnscheduled}
        dragging={dragging}
        isEmpty={totalItems === 0 && bucketProjects.length === 0}
        variant={variant}
      >
        {/* Unscheduled section — dedicated drop target, mounted whenever
            dragging so the rect is measurable (see CONTRACT.md). */}
        {(hasUntimed || dragging) && (
          <div
            ref={setUnscheduledRef}
            data-dnd-id={`unscheduled:${bucket}`}
            data-dnd-over={isOverUnscheduled ? 'true' : 'false'}
            // The 16px indent is gone: the bucket's own content edge already
            // aligns rows with the caption above them, and pl-4 pushed every
            // row 16px past it — which is what made "one edge runs the whole
            // bucket" untrue by exactly that much.
            className="space-y-2"
          >
            {untimedHabits.length > 0 && (
              <GroupSection label="Habits" variant="canvas">
                {untimedHabits.map((habit) => (
                  <TaskRow key={habit.id} row={{ itemType: 'habit', item: habit }} />
                ))}
              </GroupSection>
            )}
            {untimedTaskGroups.map(([label, groupTasks]) => (
              <GroupSection key={label} label={label} variant="canvas">
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

        {/* Untimed → timed. The full-width rule with a clock in the middle is
            gone: it was a second horizontal division inside a bucket that no
            longer has even one (the header band's divider went with the band).
            In its place the timed section indents and takes a 6px branch tick
            off the spine — day-schedule.tsx:996-1002's gesture, which is how
            that view already says "this hangs off the rail". */}
        {hasUntimed && (hasTimed || bucketProjects.length > 0) && bucket !== 'anytime' && (
          <div aria-hidden className="relative h-4">
            <span className="absolute left-0 top-1/2 w-1.5 border-t border-border" />
          </div>
        )}

        {/* Scheduled section: project blocks + timed rows */}
        {(hasTimed || bucketProjects.length > 0 || dragging) && (
          <div className={cn(hasUntimed ? 'pl-2' : 'pt-1')}>
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

        {/* Completely empty and not dragging renders NOTHING — BucketCard
            collapses to its 22px caption. The serif "Nothing here yet" line
            that used to live here cost ~100px per empty bucket, and four empty
            buckets is a common evening; the column's vertical rhythm is now a
            readout of the shape of the day instead of four equal boxes. The
            add affordance is still in the caption, and a drag opens the slot. */}
      </BucketCard>
    </div>
  );
}

export function DayBuckets({ activeId }: { activeId: string | null }) {
  const { tasksByBucket, habitsByBucket, recurringProjects } = useDayItems();
  const { selectedDate, navDirection } = usePlannerStore();
  // No `mounted` flag — useCurrentBucket returns null on the first render,
  // which is the hydration guard the flag used to duplicate.
  const currentBucket = useCurrentBucket(selectedDate);
  const bucketStyle = useViewStore((s) => s.bucketStyle);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        // Full container width — the cards run the same edges as the header
        // capsule above them (that is what `canvas-container` is for). A
        // narrower centred column was tried and reverted: the moat read as the
        // view having shrunk rather than as the buckets having become objects,
        // and the card's own edge already does the containing.
        //
        // Flex GAP, not space-y-* and not padding inside the sections. The
        // section's box is the {bucket} droppable's rect, so trailing space
        // inside it drags the bare bucket's centre down onto
        // scheduled:{bucket}:empty — see the note in bucket-card's GEO table.
        // Gap puts the space between the boxes instead of in one of them, and
        // the rail bleeds across it to keep the day's line unbroken.
        style={{ gap: bucketGap(bucketStyle, 'full') }}
        className={cn(
          'canvas-container flex flex-col py-6 pb-20',
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
            isCurrent={currentBucket === bucket}
            variant={bucketStyle}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
