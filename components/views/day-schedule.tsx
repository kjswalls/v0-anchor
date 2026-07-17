'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import { PriorityPill, DurationPill } from '@/components/primitives/pills';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor } from '@/lib/ui-store';
import { useTimeFormat } from '@/lib/use-time-format';
import { isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { DayItems } from '@/lib/day-items';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × Schedule (P5d, per desktop_day_scheduleView.png): untimed items in
 * an ANYTIME section up top, then an hour gutter with duration-height
 * blocks. Block left edges carry the project/group accent. Dropping on an
 * hour slot schedules at the top of that hour (`hour:{H}`, CONTRACT.md).
 *
 * The block + derivation helpers are exported so week-schedule reuses them.
 */

export const HOUR_PX = 75;

export type TimedEntry = {
  itemType: 'task' | 'habit';
  item: Task | Habit;
  startMin: number;
  duration: number;
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Timed items (tasks/habits with startTime + project-block tasks) for one day. */
export function deriveTimedEntries(day: DayItems): TimedEntry[] {
  const allTasks = BUCKET_ORDER.flatMap((b) => day.tasksByBucket[b]);
  const allHabits = BUCKET_ORDER.flatMap((b) => day.habitsByBucket[b]);
  return [
    ...allHabits
      .filter((h) => h.startTime)
      .map((h) => ({ itemType: 'habit' as const, item: h, startMin: toMin(h.startTime!), duration: 30 })),
    ...allTasks
      .filter((t) => t.startTime && !t.inProjectBlock)
      .map((t) => ({ itemType: 'task' as const, item: t, startMin: toMin(t.startTime!), duration: t.duration ?? 30 })),
    ...day.recurringProjects
      .filter((p) => p.startTime)
      .flatMap((p) =>
        allTasks
          .filter((t) => t.inProjectBlock && t.project === p.name)
          .map((t) => ({ itemType: 'task' as const, item: t, startMin: toMin(p.startTime!), duration: p.duration ?? 60 }))
      ),
  ].sort((a, b) => a.startMin - b.startMin);
}

/** Untimed items (no startTime, not in a project block) for one day. */
export function deriveUntimedRows(day: DayItems): RowItem[] {
  const allTasks = BUCKET_ORDER.flatMap((b) => day.tasksByBucket[b]);
  const allHabits = BUCKET_ORDER.flatMap((b) => day.habitsByBucket[b]);
  return [
    ...allHabits.filter((h) => !h.startTime).map((h) => ({ itemType: 'habit' as const, item: h })),
    ...allTasks.filter((t) => !t.startTime && !t.inProjectBlock).map((t) => ({ itemType: 'task' as const, item: t })),
  ];
}

export function formatHourLabel(hour: number, timeFormatStr: string) {
  if (timeFormatStr === 'HH:mm') return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return '12 am';
  if (hour < 12) return `${hour}:00 am`;
  if (hour === 12) return '12 pm';
  return `${hour - 12}:00 pm`;
}

function HourSlot({
  hour,
  isActive,
  label,
  isFirst,
  isLast,
}: {
  hour: number;
  isActive: boolean;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `hour:${hour}`, disabled: !isActive });
  return (
    <div ref={setNodeRef} data-dnd-id={`hour:${hour}`} className="relative flex" style={{ height: HOUR_PX }}>
      {/* Gutter: one contiguous bordered column (Figma). Each cell draws only a
          bottom border; the first also a top border — so boundaries are a single
          1px line, never the doubled 2px the earlier per-cell full border made.
          Left corners round to the canvas panel; the right side stays square. */}
      <div
        className={cn(
          'w-[88px] flex-shrink-0 border-x border-b border-border bg-canvas pl-[17px] pt-[15px] text-xs font-medium text-foreground',
          isFirst && 'rounded-tl-[20px] border-t',
          isLast && 'rounded-bl-[20px]'
        )}
      >
        {label}
      </div>
      {/* Hour line in the event area, inset both sides (Figma: 147px from left,
          17px from right — shorter than the blocks). None above the first row. */}
      {!isFirst && (
        <div
          className={cn(
            'pointer-events-none absolute left-[147px] right-[17px] top-0 border-t border-border/50',
            isActive && 'border-dashed'
          )}
        />
      )}
      <div className={cn('flex-1 transition-colors', isOver && 'bg-primary/10')} />
    </div>
  );
}

export function ScheduleBlock({
  entry,
  gridStartMin,
  date,
}: {
  entry: TimedEntry;
  gridStartMin: number;
  date?: Date;
}) {
  const { getProjectColor, getHabitGroupColor, selectedDate, userTimezone, toggleTaskStatus, updateTask } =
    usePlannerStore();
  const { item, itemType } = entry;
  const isTask = itemType === 'task';
  const task = isTask ? (item as Task) : null;
  const habit = !isTask ? (item as Habit) : null;

  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rowDate = date ?? selectedDate;
  const dateStr = toDateStr(rowDate, timezone);
  const done = isTask
    ? isRecurring(task!)
      ? isCompletedOnDate(task!, dateStr)
      : task!.status === 'completed'
    : habit!.completedDates.includes(dateStr);

  const accent = isTask
    ? task!.project
      ? getProjectColor(task!.project)
      : 'var(--primary)'
    : getHabitGroupColor(habit!.group);

  // Drag-to-resize a task's own-timed block (habits have no duration column,
  // project blocks take their length from the project — both are excluded).
  // Bottom edge changes duration; top edge changes start (bottom fixed).
  // Live preview from local state; the store write lands on pointer-up.
  const canResize = isTask && !!task!.startTime && !task!.inProjectBlock;
  const [preview, setPreview] = useState<{ startMin: number; duration: number } | null>(null);
  const resizeRef = useRef<{ y: number; edge: 'top' | 'bottom'; startMin: number; duration: number } | null>(null);
  const effStartMin = preview?.startMin ?? entry.startMin;
  const effDuration = preview?.duration ?? entry.duration;

  const snap = (m: number) => Math.round(m / 15) * 15;
  const minToTime = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const bucketForMin = (m: number): TimeBucket => {
    const h = Math.floor(m / 60);
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  };

  const onResizeDown = (edge: 'top' | 'bottom', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { y: e.clientY, edge, startMin: entry.startMin, duration: entry.duration };
    setPreview({ startMin: entry.startMin, duration: entry.duration });
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const delta = ((e.clientY - r.y) / HOUR_PX) * 60;
    if (r.edge === 'bottom') {
      setPreview({ startMin: r.startMin, duration: Math.max(15, snap(r.duration + delta)) });
    } else {
      const end = r.startMin + r.duration;
      const ns = Math.min(Math.max(0, snap(r.startMin + delta)), end - 15);
      setPreview({ startMin: ns, duration: end - ns });
    }
  };
  const onResizeUp = () => {
    const r = resizeRef.current;
    const p = preview;
    resizeRef.current = null;
    setPreview(null);
    if (!r || !task || !p) return;
    if (r.edge === 'bottom') {
      if (p.duration !== entry.duration) updateTask(task.id, { duration: p.duration });
    } else if (p.startMin !== entry.startMin || p.duration !== entry.duration) {
      updateTask(task.id, {
        startTime: minToTime(p.startMin),
        duration: p.duration,
        timeBucket: bucketForMin(p.startMin),
      });
    }
  };

  const top = ((effStartMin - gridStartMin) / 60) * HOUR_PX;
  const height = Math.max((effDuration / 60) * HOUR_PX, 34);

  // Blocks are drag sources — drop on another hour to reschedule, or on the
  // Anytime section to un-time. The source stays in place (dimmed) while the
  // DragOverlay ghost moves — same as TaskRow, and cheaper to repaint than
  // transforming this shadowed block every pointermove. Post-drop click guard
  // keeps a drop from opening the edit dialog.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const wasDraggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      wasDraggedRef.current = true;
      return;
    }
    if (wasDraggedRef.current) {
      const t = setTimeout(() => {
        wasDraggedRef.current = false;
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (wasDraggedRef.current) return;
        openEditFor(item, itemType);
      }}
      className={cn(
        'group/blk absolute left-0 right-0 cursor-grab touch-manipulation overflow-hidden rounded-[5px] bg-surface-3/60 shadow-[var(--shadow-elev-md)] active:cursor-grabbing',
        isDragging && 'opacity-50',
        done && 'opacity-60'
      )}
      style={{ top, height, borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start gap-2 px-[21px] py-[9px]">
        {isTask && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTaskStatus(item.id, undefined, isRecurring(task!) ? rowDate : undefined);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={done ? 'Mark incomplete' : 'Mark complete'}
            className={cn(
              'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors',
              done ? 'border-primary bg-primary' : 'border-muted-foreground/45 bg-surface-3 hover:border-primary'
            )}
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-content text-sm text-foreground',
            done && 'text-muted-foreground line-through'
          )}
        >
          {item.title}
        </span>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          {task?.priority && <PriorityPill priority={task.priority} />}
          {effDuration > 0 && <DurationPill minutes={effDuration} />}
        </span>
      </div>

      {/* Resize handles — drag the top or bottom edge to set start/duration.
          A grabber bar fades in on block hover so the affordance is visible. */}
      {canResize && (
        <>
          <div
            onPointerDown={(e) => onResizeDown('top', e)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 top-0 z-10 flex h-2 cursor-ns-resize items-start justify-center"
            aria-label="Resize start"
          >
            <div className="mt-0.5 h-1 w-6 rounded-full bg-foreground/25 opacity-0 transition-opacity group-hover/blk:opacity-60" />
          </div>
          <div
            onPointerDown={(e) => onResizeDown('bottom', e)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize items-end justify-center"
            aria-label="Resize duration"
          >
            <div className="mb-0.5 h-1 w-6 rounded-full bg-foreground/25 opacity-0 transition-opacity group-hover/blk:opacity-60" />
          </div>
        </>
      )}
    </div>
  );
}

export function DaySchedule({ activeId }: { activeId: string | null }) {
  const day = useDayItems();
  const { selectedDate, navDirection } = usePlannerStore();
  const timeFormatStr = useTimeFormat();
  const dragging = !!activeId;

  const { isOver: isOverAnytime, setNodeRef: setAnytimeRef } = useDroppable({
    id: 'unscheduled:anytime',
  });

  const untimed = useMemo(() => deriveUntimedRows(day), [day]);
  const timed = useMemo(() => deriveTimedEntries(day), [day]);

  // Hour range: cover the items with breathing room; sane default day window
  const gridStartHour = Math.min(8, ...timed.map((e) => Math.floor(e.startMin / 60)));
  const gridEndHour = Math.max(19, ...timed.map((e) => Math.ceil((e.startMin + e.duration) / 60)));
  const hours = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container space-y-4 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {/* ANYTIME — untimed items; drop here to keep something time-free */}
        {(untimed.length > 0 || dragging) && (
          <div
            ref={setAnytimeRef}
            data-dnd-id="unscheduled:anytime"
            className={cn('rounded-card transition-colors', isOverAnytime && 'bg-primary/5 ring-2 ring-ring/50')}
          >
            <GroupSection label="Anytime" variant="canvas">
              {untimed.map((row) => (
                <TaskRow key={row.item.id} row={row} />
              ))}
              {untimed.length === 0 && dragging && (
                <div className="py-2 text-center text-xs text-muted-foreground/50">
                  Drop here to keep it time-free
                </div>
              )}
            </GroupSection>
          </div>
        )}

        {/* Hour grid with absolutely positioned blocks */}
        <div className="relative">
          <div>
            {hours.map((hour, i) => (
              <HourSlot
                key={hour}
                hour={hour}
                isActive={dragging}
                label={formatHourLabel(hour, timeFormatStr)}
                isFirst={i === 0}
                isLast={i === hours.length - 1}
              />
            ))}
          </div>
          {/* Blocks sit ~4px below their hour line (Figma), not flush on it. */}
          <div className="absolute bottom-0 left-[132px] right-0 top-1">
            {timed.map((entry) => (
              <ScheduleBlock key={entry.item.id} entry={entry} gridStartMin={gridStartHour * 60} />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
