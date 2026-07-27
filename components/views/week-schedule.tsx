'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import {
  ScheduleBlock,
  deriveGridRange,
  deriveTimedEntries,
  deriveUntimedRows,
  formatHourLabel,
  FULL_DAY_RANGE,
  type TimedEntry,
} from '@/components/views/day-schedule';
import { useFitHourPx, useResizeScrollCompensation } from '@/lib/use-fit-hour-px';
import { useScheduleResizeStore } from '@/lib/schedule-resize-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { useTimeFormat } from '@/lib/use-time-format';
import { toDateStr } from '@/lib/recurrence';
import { deriveDayItems } from '@/lib/day-items';
import { cn } from '@/lib/utils';

/**
 * Week × Schedule: one grid, seven day-columns + a left hour gutter. Each
 * column has a per-day Anytime drop strip (untimed items) over an hour grid.
 * Drop onto a slot → `weekhour:{date}:{H}` (schedule at that day + hour); drop
 * onto the strip → `week:{date}:anytime` (un-time, keep the day). All columns
 * share the same top offsets (fixed header + anytime heights) so the gutter's
 * hour labels line up with every column's grid. Full-width, horizontal-scroll
 * when the week is tighter than the canvas (like week-buckets).
 */

const HEADER_H = 60;
const ANYTIME_H = 88;

function WeekHourCell({
  dateStr,
  hour,
  isActive,
  hourPx,
}: {
  dateStr: string;
  hour: number;
  isActive: boolean;
  hourPx: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `weekhour:${dateStr}:${hour}`, disabled: !isActive });
  return (
    <div
      ref={setNodeRef}
      data-dnd-id={`weekhour:${dateStr}:${hour}`}
      className={cn('border-b border-l border-border/25 transition-colors', isOver && 'bg-primary/10')}
      style={{ height: hourPx }}
    />
  );
}

interface ColumnData {
  date: Date;
  dateStr: string;
  timed: TimedEntry[];
  untimed: RowItem[];
}

function WeekScheduleColumn({
  col,
  hours,
  gridStartMin,
  hourPx,
  activeId,
  selected,
  today,
}: {
  col: ColumnData;
  hours: number[];
  gridStartMin: number;
  hourPx: number;
  activeId: string | null;
  selected: boolean;
  today: boolean;
}) {
  const setSelectedDate = usePlannerStore((s) => s.setSelectedDate);
  const dragging = !!activeId;
  const { isOver, setNodeRef } = useDroppable({ id: `week:${col.dateStr}:anytime` });

  return (
    <div
      className={cn(
        'flex min-w-[140px] flex-1 flex-col transition-opacity',
        !selected && 'opacity-60 hover:opacity-100'
      )}
    >
      {/* Day header card */}
      <button
        onClick={() => setSelectedDate(col.date)}
        style={{ height: HEADER_H }}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 rounded-[10px] border shadow-soft-sm transition-colors',
          // On the lime fill the label takes the INK role (-foreground), not the
          // lime-as-text one: -text tracks the fill, so it was lime on lime.
          selected ? 'border-primary-foreground bg-primary' : 'border-surface-3 bg-surface-2'
        )}
        title={`Select ${format(col.date, 'EEEE, MMMM d')}`}
      >
        <span
          className={cn('text-xs font-medium uppercase', selected ? 'text-primary-foreground' : 'text-muted-foreground')}
        >
          {format(col.date, 'EEE')}
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
          {format(col.date, 'MMM d')}
        </span>
      </button>

      {/* Per-day Anytime strip */}
      <div
        ref={setNodeRef}
        data-dnd-id={`week:${col.dateStr}:anytime`}
        style={{ height: ANYTIME_H }}
        className={cn(
          'mt-2 overflow-y-auto rounded-[8px] border border-dashed border-border/40 p-1 transition-colors',
          isOver && 'border-primary bg-primary/5'
        )}
      >
        {col.untimed.map((row) => (
          <TaskRow key={row.item.id} row={row} density="compact" date={col.date} />
        ))}
        {col.untimed.length === 0 && (
          <div className="pt-3 text-center text-2xs text-muted-foreground/40">Anytime</div>
        )}
      </div>

      {/* Hour grid */}
      <div className="relative mt-2">
        <div>
          {hours.map((h) => (
            <WeekHourCell key={h} dateStr={col.dateStr} hour={h} isActive={dragging} hourPx={hourPx} />
          ))}
        </div>
        <div className="absolute inset-0">
          {col.timed.map((entry) => (
            <ScheduleBlock key={entry.item.id} entry={entry} gridStartMin={gridStartMin} date={col.date} hourPx={hourPx} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeekSchedule({ activeId }: { activeId: string | null }) {
  const { selectedDate, weekStartDay, navDirection, tasks, habits, projects, showCompletedTasks, userTimezone } =
    usePlannerStore();
  const typeFilter = useViewStore((s) => s.typeFilter);
  const canvasFilters = useViewStore((s) => s.canvasFilters);
  const timeFormatStr = useTimeFormat();
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: weekStartsOn as 0 | 1 | 6 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate, weekStartsOn]);

  // Derive all seven days once here (deriveDayItems is pure — no hooks in the
  // loop) so both the shared hour range and the columns come from one pass.
  const perDay: ColumnData[] = useMemo(
    () =>
      weekDays.map((d) => {
        const dateStr = toDateStr(d, timezone);
        const items = deriveDayItems({
          tasks,
          habits,
          projects,
          date: d,
          dateStr,
          timezone,
          typeFilter,
          showCompletedTasks,
          filters: canvasFilters,
        });
        return { date: d, dateStr, timed: deriveTimedEntries(items), untimed: deriveUntimedRows(items) };
      }),
    [weekDays, tasks, habits, projects, timezone, typeFilter, showCompletedTasks, canvasFilters]
  );

  // One shared range + hour height across the gutter and all 7 columns so the
  // labels stay aligned. Range spans the union of every day's items when idle,
  // the full day while dragging (every hour a drop target) or resizing (see/reach
  // any target time); rows shrink to fit the pane, except during resize where the
  // scale is frozen and the grid auto-scrolls instead.
  const resizing = useScheduleResizeStore((s) => s.resizing);
  const allTimed = perDay.flatMap((c) => c.timed);
  const contentRange = useMemo(() => deriveGridRange(allTimed), [allTimed]);
  const { gridStartHour, gridEndHour } = activeId || resizing ? FULL_DAY_RANGE : contentRange;
  const hours = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);
  const { hourPx, anchorRef } = useFitHourPx(hours.length, resizing);
  useResizeScrollCompensation(gridStartHour, hourPx, resizing, anchorRef);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${weekDays[0].toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container flex gap-2 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {/* Hour gutter — same top offsets as the columns so labels line up */}
        <div className="flex w-[72px] flex-shrink-0 flex-col">
          <div style={{ height: HEADER_H }} />
          <div style={{ height: ANYTIME_H }} className="mt-2" />
          <div ref={anchorRef} className="mt-2">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: hourPx }}
                className="pl-1 pt-1 text-xs font-medium text-muted-foreground"
              >
                {formatHourLabel(h, timeFormatStr)}
              </div>
            ))}
          </div>
        </div>

        {perDay.map((col) => (
          <WeekScheduleColumn
            key={col.dateStr}
            col={col}
            hours={hours}
            gridStartMin={gridStartHour * 60}
            hourPx={hourPx}
            activeId={activeId}
            selected={isSameDay(col.date, selectedDate)}
            today={isToday(col.date)}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
