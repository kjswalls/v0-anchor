'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { BucketCard, bucketGap } from '@/components/primitives/bucket-card';
import { TaskRow } from '@/components/primitives/task-row';
import { ProjectBlock } from '@/components/views/project-block';
import { useCurrentBucket } from '@/hooks/use-current-bucket';
import { useDayItems } from '@/hooks/use-day-items';
import { useWeekColumns } from '@/lib/use-week-columns';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore, type BucketStyle } from '@/lib/view-store';
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

function WeekBucketCell({
  date,
  bucket,
  activeId,
  isCurrent,
  variant,
}: {
  date: Date;
  bucket: TimeBucket;
  activeId: string | null;
  isCurrent: boolean;
  variant: BucketStyle;
}) {
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
      {/* The empty placeholder is gone. It used to render a transparent '·' to
          hold the cell's height; an empty bucket now collapses to its 16px
          caption, and the drop slot opens from BucketCard when a drag starts —
          so the column's height tracks its content instead of being four equal
          boxes whether or not anything is in them.
          Issue #193's cap lives on BucketCard's own scroller now (contentMaxH),
          so project blocks and rows still scroll as one capped list. */}
      <BucketCard
        bucket={bucket}
        count={count}
        density="mini"
        isDropTarget={isOver}
        dragging={!!activeId}
        isEmpty={isEmpty}
        isCurrent={isCurrent}
        variant={variant}
        contentMaxH={isEmpty ? undefined : WEEK_BUCKET_MAX_H}
      >
        {!isEmpty && (
          <>
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
          </>
        )}
      </BucketCard>
    </div>
  );
}

function WeekColumn({
  date,
  activeId,
  colPx,
  currentBucket,
  variant,
}: {
  date: Date;
  activeId: string | null;
  /** Width the week scale control asks for. */
  colPx: number;
  currentBucket: TimeBucket | null;
  variant: BucketStyle;
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
      // Unselected columns used to carry `opacity-75`. They can't any more:
      // today's column now renders the lime current-bucket segment, and fading
      // lime through a parent's opacity is the one thing the accent rule
      // forbids — it would also have made the accent's strength depend on which
      // day happened to be selected. `data-dim` drives per-element muting
      // instead (see the label and header below), so the marks stay at full
      // strength while the column recedes.
      data-dim={!selected ? 'true' : 'false'}
      // Flex gap for the same reason day-buckets uses it: the cell wrapper is
      // the week:{date}:{bucket} droppable, so spacing must live between the
      // boxes rather than inside one. Also spaces the day header off the stack.
      //
      // The width was a fixed `w-60 min-w-60` until the week scale control
      // landed. It stayed effectively fixed for that control's first release
      // too — WEEK_GEOMETRY.buckets floored at the same 240px, which on a 1440px
      // window is what four of the six stops resolved to, so most of the slider
      // did nothing here. The floor is derived now (see the constant); 240 is
      // still roughly where the DEFAULT lands, but the stops either side of it
      // are distinct.
      style={{ width: colPx, gap: bucketGap(variant, 'mini') }}
      className="group/col flex flex-none snap-start flex-col"
    >
      <button
        onClick={() => setSelectedDate(date)}
        data-testid="week-column-header"
        className={cn(
          'flex h-[60px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border shadow-soft-sm transition-colors',
          // Ink role on the lime fill — see week-schedule's day header.
          selected ? 'border-primary-foreground bg-primary' : 'border-surface-3 bg-surface-2',
          // The recede, done on the header's own surface rather than through a
          // parent opacity (see data-dim above).
          !selected && 'bg-surface-2/60 hover:bg-surface-2'
        )}
        title={`Select ${format(date, 'EEEE, MMMM d')}`}
      >
        <span
          className={cn(
            'text-sm font-normal uppercase',
            selected ? 'text-primary-foreground' : 'text-muted-foreground/70'
          )}
        >
          {format(date, 'EEEE')}
        </span>
        <span
          className={cn(
            'text-sm',
            selected
              ? 'font-semibold text-primary-foreground'
              : today
                ? // `today` stays full-strength lime even on an unselected
                  // column — it is the same mark the current-bucket bead is.
                  'font-bold text-success-text'
                : 'font-semibold text-foreground/70'
          )}
        >
          {format(date, 'MMMM d')}
        </span>
      </button>

      {BUCKET_ORDER.map((bucket) => (
        <WeekBucketCell
          key={bucket}
          date={date}
          bucket={bucket}
          activeId={activeId}
          isCurrent={currentBucket === bucket}
          variant={variant}
        />
      ))}
    </div>
  );
}

export function WeekBuckets({ activeId }: { activeId: string | null }) {
  const { selectedDate, weekStartDay, navDirection } = usePlannerStore();
  const { colPx, ref: weekColsRef } = useWeekColumns('buckets');
  // ONE clock for the whole grid, unscoped — each column gates it with isToday
  // below. Seven columns × four cells calling this themselves would be 28
  // intervals for one wall clock. No `mounted` flag: the hook already returns
  // null on the first render, which is the hydration guard.
  const currentBucket = useCurrentBucket();
  const bucketStyle = useViewStore((s) => s.bucketStyle);

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
          <WeekColumn
            key={day.toDateString()}
            date={day}
            activeId={activeId}
            colPx={colPx}
            currentBucket={isToday(day) ? currentBucket : null}
            variant={bucketStyle}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
