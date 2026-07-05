'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, GripVertical, ChevronsRight, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
import type { Task, Project } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Recurring project time block (ported from timeline.tsx in P5b, compact
 * mode retired). Droppable id stays `projectblock:{name}` per
 * lib/dnd/CONTRACT.md — only tasks of the same project may drop in.
 */

function BlockTask({ task, onClick }: { task: Task; onClick: () => void }) {
  const { toggleTaskStatus, selectedDate, userTimezone } = usePlannerStore();
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateStr(selectedDate, timezone);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const recurring = isRecurring(task);
  const done = recurring ? isCompletedOnDate(task, dateStr) : task.status === 'completed';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group/blocktask relative flex items-center gap-1', isDragging && 'z-50 opacity-50')}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex cursor-grab touch-none items-center text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing group-hover/blocktask:opacity-100"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div
        onClick={onClick}
        className={cn(
          'flex flex-1 cursor-pointer items-center gap-2 rounded-lg bg-surface-3/70 px-3 py-2 transition-colors hover:bg-surface-3',
          done && 'opacity-60'
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id, undefined, recurring ? selectedDate : undefined);
          }}
          className={cn(
            'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            done ? 'border-primary bg-primary' : 'border-muted-foreground/40 hover:border-primary'
          )}
        >
          {done && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </button>
        <span className={cn('flex-1 font-serif text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
      </div>
    </div>
  );
}

interface ProjectBlockProps {
  project: Project;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  activeId?: string | null;
}

export function ProjectBlock({ project, tasks, onTaskClick, activeId }: ProjectBlockProps) {
  const { getProjectColor, tasks: allTasks, moveTaskToProjectBlock, moveTasksToProjectBlock } =
    usePlannerStore();

  const tasksInBlock = tasks.filter((t) => t.inProjectBlock);
  const availableTasks = allTasks.filter(
    (t) => t.project === project.name && t.status !== 'completed' && !t.inProjectBlock
  );

  const projectColor = getProjectColor(project.name);
  const { isOver, setNodeRef } = useDroppable({ id: `projectblock:${project.name}` });
  const draggedTask = activeId ? allTasks.find((t) => t.id === activeId) : null;
  const canAcceptDrop = draggedTask && draggedTask.project === project.name;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mb-3 overflow-hidden rounded-lg border-2 p-3 transition-all',
        isOver && canAcceptDrop ? 'border-solid border-primary bg-primary/10' : 'border-dashed',
        isOver && !canAcceptDrop && 'border-destructive/50 bg-destructive/5'
      )}
      style={{ borderColor: isOver ? undefined : projectColor }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{project.emoji}</span>
        <span className="font-serif text-sm font-semibold text-foreground">{project.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {project.startTime}
          {project.duration ? ` · ${project.duration}m` : ''}
        </span>
      </div>

      {tasksInBlock.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {tasksInBlock.map((task) => (
            <BlockTask key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </div>
      )}

      {availableTasks.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {availableTasks.length} task{availableTasks.length !== 1 ? 's' : ''} available
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-success-text hover:text-success-text"
              onClick={() => moveTasksToProjectBlock(availableTasks.map((t) => t.id))}
            >
              <ChevronsRight className="mr-1 h-3 w-3" />
              Move all
            </Button>
          </div>
          <div className="space-y-1.5">
            {availableTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="group/preview flex cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-sm font-medium text-foreground">{task.title}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 flex-shrink-0 p-0 text-muted-foreground opacity-0 hover:text-success-text group-hover/preview:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveTaskToProjectBlock(task.id);
                  }}
                  title="Move to block"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {availableTasks.length > 5 && (
              <p className="py-1 text-center text-xs text-muted-foreground/70">
                +{availableTasks.length - 5} more
              </p>
            )}
          </div>
        </div>
      ) : tasksInBlock.length === 0 ? (
        <div
          className={cn(
            'rounded-lg border border-dashed border-border/50 py-3 text-center text-xs text-muted-foreground',
            isOver && canAcceptDrop && 'border-primary bg-primary/5'
          )}
        >
          {isOver && canAcceptDrop ? (
            <span className="text-success-text">Drop to add to block</span>
          ) : isOver && !canAcceptDrop ? (
            <span className="text-destructive/70">Only {project.name} tasks allowed</span>
          ) : (
            <span>No tasks for this project yet</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
