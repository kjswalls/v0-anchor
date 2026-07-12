'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskRow } from '@/components/primitives/task-row';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { BUCKET_ORDER } from '@/lib/day-items';
import { cn } from '@/lib/utils';

/**
 * Week × List (P5c): the week as a stacked agenda — a date heading per day
 * with that day's rows beneath. Empty days collapse to a whisper.
 */

function DaySection({ date }: { date: Date }) {
  const { tasksByBucket, habitsByBucket, totalCount } = useDayItems(date);
  const { selectedDate, setSelectedDate } = usePlannerStore();
  const selected = isSameDay(date, selectedDate);

  const rows = [
    ...BUCKET_ORDER.flatMap((b) => habitsByBucket[b]).map((h) => ({ itemType: 'habit' as const, item: h })),
    ...BUCKET_ORDER.flatMap((b) => tasksByBucket[b]).map((t) => ({ itemType: 'task' as const, item: t })),
  ];

  return (
    <section>
      <button
        onClick={() => setSelectedDate(date)}
        className={cn(
          'mb-1 flex items-baseline gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-accent',
          selected && 'bg-primary/10'
        )}
        title={`Select ${format(date, 'EEEE, MMMM d')}`}
      >
        <span className="text-base font-medium text-foreground">{format(date, 'EEEE')}</span>
        <span className="text-sm text-muted-foreground">{format(date, 'MMM d')}</span>
        {isToday(date) && (
          <span className="text-2xs font-medium uppercase tracking-wide text-success-text">today</span>
        )}
      </button>

      {totalCount === 0 ? (
        <p className="px-2 pb-2 font-serif text-sm italic text-muted-foreground/50">Nothing planned.</p>
      ) : (
        <div className="space-y-0 pl-2">
          {rows.map((row) => (
            <TaskRow key={row.item.id} row={row as never} date={date} />
          ))}
        </div>
      )}
    </section>
  );
}

export function WeekList() {
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
          'mx-auto max-w-4xl space-y-6 p-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {weekDays.map((day) => (
          <DaySection key={day.toDateString()} date={day} />
        ))}
      </div>
    </ScrollArea>
  );
}
