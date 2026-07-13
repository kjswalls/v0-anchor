'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow } from '@/components/primitives/task-row';
import { PriorityPill, DurationPill } from '@/components/primitives/pills';
import { useDayItems } from '@/hooks/use-day-items';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor } from '@/lib/ui-store';
import { useTimeFormat } from '@/lib/use-time-format';
import { isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × Schedule (P5d, per desktop_day_scheduleView.png): untimed items in
 * an ANYTIME section up top, then an hour gutter with duration-height
 * blocks. Block left edges carry the project/group accent. Dropping on an
 * hour slot schedules at the top of that hour (`hour:{H}`, CONTRACT.md).
 */

const HOUR_PX = 75;

type TimedEntry = { itemType: 'task' | 'habit'; item: Task | Habit; startMin: number; duration: number };

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
    <div ref={setNodeRef} data-dnd-id={`hour:${hour}`} className="flex" style={{ height: HOUR_PX }}>
      <div
        className={cn(
          'w-[88px] flex-shrink-0 border border-surface-3 bg-canvas pl-5 pt-[15px] text-xs font-medium text-foreground',
          isFirst && 'rounded-tl-[20px]',
          isLast && 'rounded-bl-[20px]'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'flex-1 border-t border-border/30 transition-colors',
          isActive && 'border-dashed',
          isOver && 'bg-primary/10'
        )}
      />
    </div>
  );
}

function ScheduleBlock({ entry, gridStartMin }: { entry: TimedEntry; gridStartMin: number }) {
  const { getProjectColor, getHabitGroupColor, selectedDate, userTimezone, toggleTaskStatus } =
    usePlannerStore();
  const { item, itemType } = entry;
  const isTask = itemType === 'task';
  const task = isTask ? (item as Task) : null;
  const habit = !isTask ? (item as Habit) : null;

  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateStr(selectedDate, timezone);
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

  const top = ((entry.startMin - gridStartMin) / 60) * HOUR_PX;
  const height = Math.max((entry.duration / 60) * HOUR_PX, 34);

  // Blocks are drag sources — drop on another hour to reschedule, or on the
  // Anytime section to un-time. Same post-drop click guard as TaskRow so a
  // drop doesn't open the edit dialog.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
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
        'absolute left-0 right-0 cursor-grab touch-manipulation overflow-hidden rounded-[5px] bg-surface-3/60 shadow-[2px_4px_7px_0px_rgba(0,0,0,0.2)] transition-shadow hover:shadow-soft-md active:cursor-grabbing',
        isDragging && 'z-50 opacity-50',
        done && 'opacity-60'
      )}
      style={{
        top,
        height,
        borderLeft: `3px solid ${accent}`,
        ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
      }}
    >
      <div className="flex items-start gap-2 px-[21px] py-[9px]">
        {isTask && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTaskStatus(item.id, undefined, isRecurring(task!) ? selectedDate : undefined);
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
          {entry.duration > 0 && <DurationPill minutes={entry.duration} />}
        </span>
      </div>
    </div>
  );
}

export function DaySchedule({ activeId }: { activeId: string | null }) {
  const { tasksByBucket, habitsByBucket, recurringProjects } = useDayItems();
  const { selectedDate, navDirection } = usePlannerStore();
  const timeFormatStr = useTimeFormat();
  const dragging = !!activeId;

  const { isOver: isOverAnytime, setNodeRef: setAnytimeRef } = useDroppable({
    id: 'unscheduled:anytime',
  });

  const allTasks = BUCKET_ORDER.flatMap((b) => tasksByBucket[b]);
  const allHabits = BUCKET_ORDER.flatMap((b) => habitsByBucket[b]);
  const untimed = [
    ...allHabits.filter((h) => !h.startTime).map((h) => ({ itemType: 'habit' as const, item: h })),
    ...allTasks.filter((t) => !t.startTime && !t.inProjectBlock).map((t) => ({ itemType: 'task' as const, item: t })),
  ];

  const timed: TimedEntry[] = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const projectBlocks: TimedEntry[] = []; // project blocks render as task blocks via their tasks for v1
    void projectBlocks;
    return [
      ...allHabits
        .filter((h) => h.startTime)
        .map((h) => ({ itemType: 'habit' as const, item: h, startMin: toMin(h.startTime!), duration: 30 })),
      ...allTasks
        .filter((t) => t.startTime && !t.inProjectBlock)
        .map((t) => ({ itemType: 'task' as const, item: t, startMin: toMin(t.startTime!), duration: t.duration ?? 30 })),
      ...recurringProjects
        .filter((p) => p.startTime)
        .flatMap((p) =>
          allTasks
            .filter((t) => t.inProjectBlock && t.project === p.name)
            .map((t) => ({ itemType: 'task' as const, item: t, startMin: toMin(p.startTime!), duration: p.duration ?? 60 }))
        ),
    ].sort((a, b) => a.startMin - b.startMin);
  }, [allTasks, allHabits, recurringProjects]);

  // Hour range: cover the items with breathing room; sane default day window
  const gridStartHour = Math.min(8, ...timed.map((e) => Math.floor(e.startMin / 60)));
  const gridEndHour = Math.max(19, ...timed.map((e) => Math.ceil((e.startMin + e.duration) / 60)));
  const hours = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);

  const formatHour = (hour: number) => {
    if (timeFormatStr === 'HH:mm') return `${String(hour).padStart(2, '0')}:00`;
    if (hour === 0) return '12 am';
    if (hour < 12) return `${hour}:00 am`;
    if (hour === 12) return '12 pm';
    return `${hour - 12}:00 pm`;
  };

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
            <GroupSection label="Anytime">
              {untimed.map((row) => (
                <TaskRow key={row.item.id} row={row as never} />
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
                label={formatHour(hour)}
                isFirst={i === 0}
                isLast={i === hours.length - 1}
              />
            ))}
          </div>
          <div className="absolute inset-y-0 left-[132px] right-0">
            {timed.map((entry) => (
              <ScheduleBlock key={entry.item.id} entry={entry} gridStartMin={gridStartHour * 60} />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
