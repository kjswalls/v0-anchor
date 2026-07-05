'use client';

import { Check, GripVertical, Trash2, Clock, Repeat } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore, openEditFor } from '@/lib/ui-store';
import type { Task, Habit } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Canonical item row for the redesign (components/primitives).
 *
 * P3 ships the braindump context; the bucket/list/schedule contexts and the
 * density prop grow in P5a when the views are rewritten on top of it.
 * Tasks are drag sources (draggable id = item id, per lib/dnd/CONTRACT.md);
 * habits in the braindump are not draggable (parity with the old sidebar).
 */

export type RowItem = { itemType: 'task'; item: Task } | { itemType: 'habit'; item: Habit };

interface TaskRowProps {
  row: RowItem;
  context?: 'braindump';
}

export function TaskRow({ row }: TaskRowProps) {
  const { toggleTaskStatus, toggleHabitStatus, deleteTask, deleteHabit, getProjectEmoji, getHabitGroupEmoji, setHoveredItem } =
    usePlannerStore();
  const confirm = useUIStore((s) => s.confirm);
  const { item, itemType } = row;

  const isTask = itemType === 'task';
  const task = isTask ? (item as Task) : null;
  const habit = !isTask ? (item as Habit) : null;
  const completed = isTask ? task!.status === 'completed' : habit!.status === 'done';
  const emoji = isTask
    ? task!.project
      ? getProjectEmoji(task!.project)
      : null
    : getHabitGroupEmoji(habit!.group) || null;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !isTask,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const handleToggle = () => {
    if (isTask) toggleTaskStatus(item.id);
    else toggleHabitStatus(item.id, completed ? 'pending' : 'done');
  };

  const handleDelete = () =>
    confirm({
      title: `Delete ${isTask ? 'Task' : 'Habit'}?`,
      description: `This will permanently delete "${item.title}"${isTask ? '' : ' and all its history'}. This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => (isTask ? deleteTask(item.id) : deleteHabit(item.id)),
    });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent',
        isDragging && 'z-50 opacity-50',
        completed && 'opacity-60'
      )}
      onClick={() => openEditFor(item, itemType)}
      onMouseEnter={() => setHoveredItem(item.id, itemType)}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      {isTask && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-4 top-2.5 z-10 flex-shrink-0 cursor-grab touch-none opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          suppressHydrationWarning
          aria-label="Drag to schedule"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
        className={cn(
          'z-10 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          completed ? 'border-primary bg-primary' : 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {completed && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'line-clamp-2 font-serif text-base font-semibold leading-snug text-foreground',
            completed && 'text-muted-foreground line-through'
          )}
        >
          {item.title}
        </p>

        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground empty:hidden">
          {emoji && (
            <span className="flex items-center gap-1 leading-none">
              <span>{emoji}</span>
              <span>{isTask ? task!.project : habit!.group}</span>
            </span>
          )}
          {task?.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {task.duration}m
            </span>
          )}
          {item.repeatFrequency && item.repeatFrequency !== 'none' && <Repeat className="h-3 w-3" />}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="z-10 h-6 w-6 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
