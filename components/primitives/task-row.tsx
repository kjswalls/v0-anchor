'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, GripVertical, Trash2, Minus, Plus, SkipForward, ArrowLeftToLine, Undo2 } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openEditFor } from '@/lib/ui-store';
import { isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
import { setHoveredItemRef } from '@/lib/hovered-item';
import {
  PriorityPill,
  DurationPill,
  TimePill,
  StreakPill,
  TagPill,
  RecurrencePills,
} from '@/components/primitives/pills';
import type { Task, Habit, HabitStatus } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Canonical item row (components/primitives): checkbox + Inter Medium title +
 * trailing pills + hover controls. Contexts:
 *   braindump — minimal metadata, tasks draggable
 *   bucket    — full pills + unschedule/skip controls, date-aware completion
 * Draggable id = item id per lib/dnd/CONTRACT.md; habits are not drag
 * sources (parity with the old timeline).
 */

export type RowItem = { itemType: 'task'; item: Task } | { itemType: 'habit'; item: Habit };

interface TaskRowProps {
  row: RowItem;
  context?: 'braindump' | 'bucket';
  density?: 'default' | 'compact';
  /** The day this row is rendered for (week columns); defaults to the selected day. */
  date?: Date;
}

export function TaskRow({ row, context = 'bucket', density = 'default', date }: TaskRowProps) {
  const {
    toggleTaskStatus,
    toggleHabitStatus,
    deleteTask,
    deleteHabit,
    unscheduleTask,
    getProjectEmoji,
    getHabitGroupEmoji,
    getHabitGroupColor,
    getProjectColor,
    selectedDate,
    userTimezone,
  } = usePlannerStore();
  const confirm = useUIStore((s) => s.confirm);
  const { item, itemType } = row;
  const isTask = itemType === 'task';
  const task = isTask ? (item as Task) : null;
  const habit = !isTask ? (item as Habit) : null;
  const inBraindump = context === 'braindump';
  const compact = density === 'compact';

  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rowDate = date ?? selectedDate;
  const dateStr = toDateStr(rowDate, timezone);

  // Effective per-date status
  const taskRecurring = task ? isRecurring(task) : false;
  const taskDone = task ? (taskRecurring ? isCompletedOnDate(task, dateStr) : task.status === 'completed') : false;
  const habitDoneOnDate = habit ? habit.completedDates.includes(dateStr) : false;
  const habitSkipped = habit ? (habit.skippedDates ?? []).includes(dateStr) : false;
  const habitCount = habit ? ((habit.dailyCounts ?? {})[dateStr] ?? 0) : 0;
  const habitStatus: HabitStatus = habitSkipped ? 'skipped' : habitDoneOnDate ? 'done' : 'pending';
  const habitEffectiveCount = habitDoneOnDate ? habitCount || habit?.timesPerDay || 1 : habitCount;
  const completed = isTask ? taskDone : habitStatus === 'done';

  const emoji = isTask
    ? task!.project
      ? getProjectEmoji(task!.project)
      : null
    : getHabitGroupEmoji(habit!.group) || null;
  const tagColor = isTask
    ? task!.project
      ? getProjectColor(task!.project)
      : undefined
    : getHabitGroupColor(habit!.group);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !isTask,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const [showMulti, setShowMulti] = useState(false);

  // Full-row drag: after a drop, the browser fires a click on the row — swallow
  // it so a drag never opens the edit dialog. Cleared on a macrotask because a
  // drop outside the row fires no click at all (naive clear-in-onClick would
  // swallow the NEXT legitimate click).
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

  const handleTaskToggle = () =>
    toggleTaskStatus(item.id, undefined, taskRecurring ? selectedDate : undefined);

  const handleHabitToggle = () => {
    if (!habit) return;
    if (habit.timesPerDay && habit.timesPerDay > 1) {
      if (habitStatus === 'done') {
        toggleHabitStatus(habit.id, 'pending', habit.timesPerDay - 1, selectedDate);
      } else {
        const newCount = (habitEffectiveCount || 0) + 1;
        if (newCount >= habit.timesPerDay) {
          toggleHabitStatus(habit.id, 'done', habit.timesPerDay, selectedDate);
        } else {
          toggleHabitStatus(habit.id, 'pending', newCount, selectedDate);
        }
      }
    } else {
      toggleHabitStatus(habit.id, habitStatus === 'pending' ? 'done' : 'pending', undefined, selectedDate);
    }
  };

  const handleDelete = () =>
    confirm({
      title: `Delete ${isTask ? 'Task' : 'Habit'}?`,
      description: `This will permanently delete "${item.title}"${isTask ? '' : ' and all its history'}. This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => (isTask ? deleteTask(item.id) : deleteHabit(item.id)),
    });

  // Skipped habits render as a slim strip with undo
  if (habit && habitStatus === 'skipped' && !inBraindump) {
    return (
      <div
        data-testid="habit-card"
        onClick={() => openEditFor(item, itemType)}
        className="group flex w-full cursor-pointer items-center gap-2 rounded-lg bg-surface-3/60 px-2 py-1.5 hover:bg-surface-3"
      >
        <SkipForward className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
        <span className="flex-1 truncate text-sm text-muted-foreground/70">{habit.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            toggleHabitStatus(habit.id, 'pending', undefined, selectedDate);
          }}
        >
          <Undo2 className="mr-1 h-3 w-3" />
          Unskip
        </Button>
      </div>
    );
  }

  const showMultiControls =
    habit && habit.timesPerDay && habit.timesPerDay > 1 && habitStatus === 'pending' && (showMulti || (habitEffectiveCount ?? 0) > 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isTask ? attributes : {})}
      {...(isTask ? listeners : {})}
      suppressHydrationWarning
      data-testid={isTask ? 'task-card' : 'habit-card'}
      className={cn(
        // No transition on the hover bg — highlights land instantly, like the
        // omnibar's CommandItem. touch-manipulation (not touch-none) keeps
        // touch scrolling alive; TouchSensor's 250ms delay handles drags.
        // Hover "cover" per Figma (113:2329): light fill, 3px lime left edge
        // (inset shadow — no layout shift), soft drop shadow, r5.
        'group relative flex w-full cursor-pointer touch-manipulation items-center gap-3 rounded-[5px] px-2 hover:bg-muted/60 hover:shadow-[inset_3px_0_0_0_var(--primary),0px_2px_4px_0px_rgba(0,0,0,0.15)]',
        compact ? 'py-1' : 'py-2',
        isDragging && 'z-50 opacity-50',
        completed && 'opacity-60'
      )}
      onClick={() => {
        if (wasDraggedRef.current) return;
        openEditFor(item, itemType);
      }}
      onMouseEnter={() => {
        setHoveredItemRef(item.id, itemType);
        setShowMulti(true);
      }}
      onMouseLeave={() => {
        setHoveredItemRef(null, null);
        setShowMulti(false);
      }}
    >
      {/* Grip — pure visual affordance now; the whole row is the drag origin
          (pointerdown here bubbles to the row's listeners) */}
      {isTask && (
        <span
          aria-hidden="true"
          className="absolute -left-4 z-10 flex-shrink-0 cursor-grab touch-none opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </span>
      )}

      {/* Checkbox / multi-count */}
      {showMultiControls ? (
        <span
          className="z-10 flex flex-shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => habitEffectiveCount > 0 && toggleHabitStatus(habit!.id, 'pending', habitEffectiveCount - 1, selectedDate)}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/30 transition-colors hover:border-primary hover:bg-primary/10"
            aria-label="Decrease count"
          >
            <Minus className="h-2.5 w-2.5 text-muted-foreground" />
          </button>
          <span className="w-4 text-center text-sm font-bold text-success-text">{habitEffectiveCount}</span>
          <button
            onClick={handleHabitToggle}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/30 transition-colors hover:border-primary hover:bg-primary/10"
            aria-label="Increase count"
          >
            <Plus className="h-2.5 w-2.5 text-muted-foreground" />
          </button>
        </span>
      ) : (
        <button
          data-testid={isTask ? 'task-complete-button' : 'habit-complete-button'}
          onClick={(e) => {
            e.stopPropagation();
            if (isTask) handleTaskToggle();
            else handleHabitToggle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
          className={cn(
            'z-10 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors',
            completed ? 'border-primary bg-primary' : 'border-muted-foreground/45 bg-surface-3 hover:border-primary'
          )}
        >
          {completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </button>
      )}

      {/* Title */}
      <p
        className={cn(
          // Content typeface via tokens: sans = Inter Medium 13 (Linear),
          // serif = Source Serif SemiBold 15. Flipped by data-type-mode.
          'min-w-0 flex-1 font-content text-foreground',
          compact ? 'line-clamp-1 text-sm' : 'line-clamp-2 text-content',
          completed && 'text-muted-foreground line-through'
        )}
      >
        {item.title}
      </p>

      {/* Trailing: tag · controls · pills */}
      <div
        className="z-10 flex flex-shrink-0 items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!compact && !inBraindump && emoji && (isTask ? task!.project : habit!.group) && (
          <TagPill
            emoji={emoji}
            name={isTask ? task!.project! : habit!.group}
            color={tagColor}
            className="hidden lg:inline-flex"
          />
        )}

        {/* Hover controls */}
        {!inBraindump && (
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 has-[:focus-visible]:opacity-100">
            {isTask && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => unscheduleTask(item.id)}
                title="Move to Braindump"
              >
                <ArrowLeftToLine className="h-3.5 w-3.5" />
              </Button>
            )}
            {habit && habitStatus === 'pending' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => toggleHabitStatus(habit.id, 'skipped', undefined, selectedDate)}
                title="Skip today"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}
        {inBraindump && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            onClick={handleDelete}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Pills */}
        {!compact && !inBraindump && (
          <>
            {habit && habit.timesPerDay && habit.timesPerDay > 1 && (
              <span className="text-2xs text-muted-foreground">
                {habitEffectiveCount || 0}/{habit.timesPerDay}
              </span>
            )}
            {item.startTime && <TimePill time={item.startTime} />}
            {task?.priority && <PriorityPill priority={task.priority} />}
            {task?.duration && <DurationPill minutes={task.duration} />}
            <RecurrencePills
              frequency={item.repeatFrequency}
              repeatDays={item.repeatDays}
              className="hidden xl:inline-flex"
            />
            {habit && <StreakPill streak={habit.streak} />}
          </>
        )}
      </div>
    </div>
  );
}
