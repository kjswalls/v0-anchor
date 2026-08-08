'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { BucketCard } from '@/components/primitives/bucket-card';
import { TaskRow } from '@/components/primitives/task-row';
import { ProjectBlock } from '@/components/views/project-block';
import { useDayItems } from '@/hooks/use-day-items';
import { useWeekColumns } from '@/lib/use-week-columns';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor } from '@/lib/ui-store';
import { BUCKET_ORDER } from '@/lib/day-items';
import { WEEK_BUCKET_MAX_H } from '@/lib/schedule-constants';
import type { TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Week × Buckets (P5b): seven columns of mini bucket cards. Drops use
 * `week:{yyyy-MM-dd}:{bucket}` per lib/dnd/CONTRACT.md. The selected day is
 * highlighted; neighbors are dimmed. Columns keep a min width and snap-scroll
 * so 13" screens see ~4 comfortable columns (per the mockup) instead of 7
 * crushed ones.
 */

function WeekBucketCell({ date, bucket, activeId }: { date: Date; bucket: TimeBucket; activeId: string | null }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const { isOver, setNodeRef } = useDroppable({ id: `week:${dateStr}:${bucket}` });
  const { tasksByBucket, habitsByBucket, recurringProjects } = useDayItems(date);
  const tasks = tasksByBucket[bucket];
  const habits = habitsByBucket[bucket];
  // The header count stays "everything in this bucket", project-block tasks
  // included — same as day-buckets' `totalItems`.
  const count = tasks.length + habits.length;

  // Recurring project time blocks landing on this day, in this bucket — the
  // same selection day-buckets makes. Week used to render every task flat and
  // no blocks at all, so a task the user had filed into a project block came
  // back as a loose row here and the block itself was invisible (#193).
  const bucketProjects = recurringProjects.filter((p) => p.timeBucket === bucket);
  const looseTasks = tasks.filter((t) => !t.inProjectBlock);

  // Placeholder only when there is genuinely nothing — a bucket whose only
  // content is a project block still renders the block (day-buckets guards its
  // empty copy with `bucketProjects.length === 0` for the same reason).
  const isEmpty = looseTasks.length === 0 && habits.length === 0 && bucketProjects.length === 0;

  return (
    <div
      ref={setNodeRef}
      data-dnd-id={`week:${dateStr}:${bucket}`}
      data-dnd-over={isOver ? 'true' : 'false'}
    >
      <BucketCard bucket={bucket} count={count} density="mini" isDropTarget={isOver}>
        {isEmpty ? (
          <div
            className={cn(
              'rounded-md py-1.5 text-center text-2xs transition-colors',
              activeId ? 'border border-dashed border-border/60 text-muted-foreground/50' : 'text-transparent'
            )}
          >
            {activeId ? 'Drop here' : '·'}
          </div>
        ) : (
          // Issue #193: a bucket stacked with rows caps out and scrolls its own
          // content, rather than pushing the rest of the day column down. Plain
          // overflow-y-auto, not <ScrollArea> — Radix silently drops max-h.
          // Project blocks live inside this cap too (each capped again by
          // variant="week"), so "a bunch of tasks AND projects" scrolls as one.
          <div className="space-y-0 overflow-y-auto" style={{ maxHeight: WEEK_BUCKET_MAX_H }}>
            {/* Blocks lead the cell. Day view can afford to put them below the
                untimed rows because nothing is capped there; here the bucket
                stops at WEEK_BUCKET_MAX_H, and a block trailing a long row list
                would never be on screen. */}
            {bucketProjects.map((project) => (
              <ProjectBlock
                key={project.name}
                project={project}
                tasks={tasks.filter((t) => t.project === project.name)}
                onTaskClick={(task) => openEditFor(task, 'task')}
                activeId={activeId}
                variant="week"
                date={date}
              />
            ))}
            {habits.map((habit) => (
              <TaskRow key={habit.id} row={{ itemType: 'habit', item: habit }} density="compact" date={date} />
            ))}
            {looseTasks.map((task) => (
              <TaskRow key={task.id} row={{ itemType: 'task', item: task }} density="compact" date={date} />
            ))}
          </div>
        )}
      </BucketCard>
    </div>
  );
}

function WeekColumn({
  date,
  activeId,
  colPx,
}: {
  date: Date;
  activeId: string | null;
  /** Width the week scale control asks for; floors at the old fixed w-60. */
  colPx: number;
}) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const selected = isSameDay(date, selectedDate);
  const today = isToday(date);

  return (
    <div
      data-testid="week-column"
      // Per-column identity. Without it the only handles are nth() and
      // title^="Select ", both position-dependent — and the column order is
      // reshuffled by the weekStartDay setting. `today` also replaces the
      // getByText('today') assertion, which only ever matched week-LIST.
      data-date={format(date, 'yyyy-MM-dd')}
      data-selected={selected ? 'true' : 'false'}
      data-today={today ? 'true' : 'false'}
      className={cn(
        'flex flex-none snap-start flex-col gap-2 transition-opacity',
        !selected && 'opacity-75 hover:opacity-100'
      )}
      // Was a fixed `w-60 min-w-60`. WEEK_GEOMETRY.buckets floors at that same
      // 240px, and at seven days the arithmetic doesn't clear it until the
      // canvas is past ~1940px — so this renders identically to the old fixed
      // width on every realistic screen until the scale control is actually
      // moved. A bucket card carries stacked rows under a counted header; it
      // needs the room a schedule block doesn't.
      style={{ width: colPx }}
    >
      <button
        onClick={() => setSelectedDate(date)}
        data-testid="week-column-header"
        className={cn(
          'flex h-[60px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border shadow-soft-sm transition-colors',
          // Ink role on the lime fill — see week-schedule's day header.
          selected ? 'border-primary-foreground bg-primary' : 'border-surface-3 bg-surface-2'
        )}
        title={`Select ${format(date, 'EEEE, MMMM d')}`}
      >
        <span
          className={cn('text-sm font-normal uppercase', selected ? 'text-primary-foreground' : 'text-muted-foreground')}
        >
          {format(date, 'EEEE')}
        </span>
        <span
          className={cn(
            'text-sm',
            selected
              ? 'font-semibold text-primary-foreground'
              : today
                ? 'font-bold text-success-text'
                : 'font-semibold text-foreground'
          )}
        >
          {format(date, 'MMMM d')}
        </span>
      </button>

      {BUCKET_ORDER.map((bucket) => (
        <WeekBucketCell key={bucket} date={date} bucket={bucket} activeId={activeId} />
      ))}
    </div>
  );
}

export function WeekBuckets({ activeId }: { activeId: string | null }) {
  const { selectedDate, weekStartDay, navDirection } = usePlannerStore();
  const { colPx, ref: weekColsRef } = useWeekColumns('buckets');

  const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: weekStartsOn as 0 | 1 | 6 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate, weekStartsOn]);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        ref={weekColsRef}
        key={`${weekDays[0].toDateString()}-${navDirection ?? 'none'}`}
        data-wide="true"
        className={cn(
          'canvas-container flex snap-x snap-mandatory gap-7 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {weekDays.map((day) => (
          <WeekColumn key={day.toDateString()} date={day} activeId={activeId} colPx={colPx} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
