'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { BucketCard } from '@/components/primitives/bucket-card';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { BUCKET_ORDER } from '@/lib/day-items';
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
  const { tasksByBucket, habitsByBucket } = useDayItems(date);
  const tasks = tasksByBucket[bucket];
  const habits = habitsByBucket[bucket];
  const count = tasks.length + habits.length;

  return (
    <div ref={setNodeRef} data-dnd-id={`week:${dateStr}:${bucket}`}>
      <BucketCard bucket={bucket} count={count} density="mini" isDropTarget={isOver}>
        {count === 0 ? (
          <div
            className={cn(
              'rounded-md py-1.5 text-center text-2xs transition-colors',
              activeId ? 'border border-dashed border-border/60 text-muted-foreground/50' : 'text-transparent'
            )}
          >
            {activeId ? 'Drop here' : '·'}
          </div>
        ) : (
          <div className="space-y-0">
            {habits.map((habit) => (
              <TaskRow key={habit.id} row={{ itemType: 'habit', item: habit }} density="compact" date={date} />
            ))}
            {tasks.map((task) => (
              <TaskRow key={task.id} row={{ itemType: 'task', item: task }} density="compact" date={date} />
            ))}
          </div>
        )}
      </BucketCard>
    </div>
  );
}

function WeekColumn({ date, activeId }: { date: Date; activeId: string | null }) {
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const selected = isSameDay(date, selectedDate);
  const today = isToday(date);

  return (
    <div
      className={cn(
        'flex w-60 min-w-60 snap-start flex-col gap-2 transition-opacity',
        !selected && 'opacity-75 hover:opacity-100'
      )}
    >
      <button
        onClick={() => setSelectedDate(date)}
        className={cn(
          'flex items-baseline justify-center gap-1.5 rounded-card px-2 py-1.5 transition-colors',
          selected
            ? 'bg-primary text-primary-foreground shadow-soft-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
        title={`Select ${format(date, 'EEEE, MMMM d')}`}
      >
        <span className="text-sm font-medium">{format(date, 'EEE')}</span>
        <span className={cn('text-sm tabular-nums', today && !selected && 'font-bold text-success-text')}>
          {format(date, 'd')}
        </span>
        {today && <span className={cn('text-2xs uppercase tracking-wide', selected ? 'opacity-80' : 'text-success-text')}>today</span>}
      </button>

      {BUCKET_ORDER.map((bucket) => (
        <WeekBucketCell key={bucket} date={date} bucket={bucket} activeId={activeId} />
      ))}
    </div>
  );
}

export function WeekBuckets({ activeId }: { activeId: string | null }) {
  const { selectedDate, weekStartDay, navDirection } = usePlannerStore();

  const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: weekStartsOn as 0 | 1 | 6 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate, weekStartsOn]);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${weekDays[0].toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'flex snap-x snap-mandatory gap-3 p-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {weekDays.map((day) => (
          <WeekColumn key={day.toDateString()} date={day} activeId={activeId} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
