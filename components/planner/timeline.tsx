'use client';

import { useMemo, useState, useEffect } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X, SkipForward, Flame, GripVertical, Plus, Repeat, Minus, Trash2, ArrowLeftToLine, ChevronLeft, ChevronRight, ArrowRight, ChevronsRight } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket, Priority, HabitStatus, Project } from '@/lib/planner-types';
import { TIME_BUCKET_RANGES, formatBucketRange } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { isSameDay, format } from 'date-fns';
import { useTimeFormat } from '@/lib/use-time-format';
import { shouldShowOnDate, toDateStr, isRecurring, isCompletedOnDate } from '@/lib/recurrence';

// Bucket configuration with bold accent colors
function getBucketConfig(use24h: boolean): Record<TimeBucket, {
  icon: typeof Clock;
  label: string;
  timeRange: string;
  accentClass: string;
  borderColor: string;
  labelColor: string;
}> {
  return {
    anytime: {
      icon: Sparkles,
      label: 'Anytime',
      timeRange: 'Flexible',
      accentClass: 'bg-anytime',
      borderColor: 'border-l-anytime',
      labelColor: 'text-anytime',
    },
    morning: {
      icon: Sunrise,
      label: 'Morning',
      timeRange: formatBucketRange(TIME_BUCKET_RANGES.morning, use24h),
      accentClass: 'bg-morning',
      borderColor: 'border-l-morning',
      labelColor: 'text-morning',
    },
    afternoon: {
      icon: Sun,
      label: 'Afternoon',
      timeRange: formatBucketRange(TIME_BUCKET_RANGES.afternoon, use24h),
      accentClass: 'bg-afternoon',
      borderColor: 'border-l-afternoon',
      labelColor: 'text-afternoon',
    },
    evening: {
      icon: Moon,
      label: 'Evening',
      timeRange: formatBucketRange(TIME_BUCKET_RANGES.evening, use24h),
      accentClass: 'bg-evening',
      borderColor: 'border-l-evening',
      labelColor: 'text-evening',
    },
  };
}

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

// Task card component - clean white with shadow
interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  const { compactMode, chillMode, toggleTaskStatus, unscheduleTask, deleteTask, getProjectEmoji, setHoveredItem, getProject, moveTaskToProjectBlock, moveTaskOutOfProjectBlock, selectedDate, userTimezone } = usePlannerStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const showMeta = !chillMode || isHovered;

  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedDateStr = toDateStr(selectedDate, resolvedTimezone);
  const taskIsRecurring = isRecurring(task);
  const isTaskDoneOnDate = taskIsRecurring
    ? isCompletedOnDate(task, selectedDateStr)
    : task.status === 'completed';
  
  const project = task.project ? getProject(task.project) : undefined;
  const hasProjectBlock = project?.startTime && project?.timeBucket;
  const canMoveToBlock = hasProjectBlock && !task.inProjectBlock && task.startTime;
  const canMoveOutOfBlock = task.inProjectBlock;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: task.id });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="task-card"
      className={cn('group relative flex items-stretch gap-1.5', isDragging && 'opacity-50 z-50')}
      onMouseEnter={() => { setHoveredItem(task.id, 'task'); setIsHovered(true); }}
      onMouseLeave={() => { setHoveredItem(null, null); setIsHovered(false); }}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none flex items-center text-muted-foreground/50 hover:text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        suppressHydrationWarning
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Card */}
      <div
        onClick={onClick}
        className={cn(
          'group/card relative flex gap-3 px-4 rounded-lg bg-card border border-border shadow-sm hover:shadow-md transition-all cursor-pointer flex-1 overflow-hidden',
          compactMode ? 'py-2.5 min-h-[48px] items-center' : 'py-3.5 min-h-[64px] items-start',
          isTaskDoneOnDate && 'opacity-60',
        )}
      >
        {/* Checkbox */}
        <button
          data-testid="task-complete-button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id, undefined, taskIsRecurring ? selectedDate : undefined);
          }}
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all self-center',
            isTaskDoneOnDate
              ? 'bg-primary border-primary'
              : 'border-border hover:border-primary'
          )}
        >
          {isTaskDoneOnDate && (
            <Check className="h-3 w-3 text-primary-foreground" />
          )}
        </button>

        {/* Content */}
        <div className={cn('flex-1 min-w-0', compactMode ? 'flex flex-row flex-wrap gap-2 items-center' : 'flex flex-col gap-1')}>
          <p
            className={cn(
              'font-medium text-foreground leading-snug',
              compactMode ? 'text-sm' : 'text-[15px]',
              isTaskDoneOnDate && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>

          {/* Meta row */}
          <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', compactMode && 'flex-shrink-0')}>
            {projectEmoji && task.project && (
              <span className={cn('flex items-center gap-1 leading-none transition-opacity', !showMeta && 'opacity-0')}>
                <span className="text-sm">{projectEmoji}</span>
                <span className="font-medium">{task.project}</span>
              </span>
            )}
            {task.startTime && (
              <span className={cn('font-semibold text-foreground/80 transition-opacity', !showMeta && 'opacity-0')}>{task.startTime}</span>
            )}
            {task.duration && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {task.duration}m
              </span>
            )}
            {task.priority && (
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-opacity',
                task.priority === 'high' && 'bg-priority-high/10 text-priority-high',
                task.priority === 'medium' && 'bg-priority-medium/10 text-priority-medium',
                task.priority === 'low' && 'bg-priority-low/10 text-priority-low',
                !showMeta && 'opacity-0'
              )}>
                {priorityLabels[task.priority]}
              </span>
            )}
            {task.repeatFrequency && task.repeatFrequency !== 'none' && (
              <Repeat className={cn('h-3 w-3 transition-opacity', !showMeta && 'opacity-0')} />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className={cn(
          'flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0 self-center',
        )}>
          {canMoveToBlock && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                moveTaskToProjectBlock(task.id);
              }}
              title={`Move to ${project?.name} block`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          
          {canMoveOutOfBlock && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                moveTaskOutOfProjectBlock(task.id);
              }}
              title="Restore original time"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              unscheduleTask(task.id);
            }}
            title="Move to sidebar"
          >
            <ArrowLeftToLine className="h-3.5 w-3.5" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task.title}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id); setShowDeleteConfirm(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Habit card component
interface HabitCardProps {
  habit: Habit;
  onClick: () => void;
}

function HabitCard({ habit, onClick }: HabitCardProps) {
  const { toggleHabitStatus, getHabitGroupEmoji, getHabitGroupColor, setHoveredItem, compactMode, chillMode, selectedDate, userTimezone } = usePlannerStore();
  const [isHovered, setIsHovered] = useState(false);
  const showMeta = !chillMode || isHovered;
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);

  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateStr(selectedDate, resolvedTimezone);
  const isCompletedOnDate = habit.completedDates.includes(dateStr);
  const isSkippedOnDate = (habit.skippedDates ?? []).includes(dateStr);
  const countOnDate = (habit.dailyCounts ?? {})[dateStr] ?? 0;
  
  const effectiveStatus: HabitStatus = isSkippedOnDate ? 'skipped' : isCompletedOnDate ? 'done' : 'pending';
  const effectiveCount = isCompletedOnDate ? (countOnDate || habit.timesPerDay || 1) : countOnDate;

  const handleIncrement = () => {
    if (habit.timesPerDay && habit.timesPerDay > 1) {
      if (effectiveStatus === 'done') {
        toggleHabitStatus(habit.id, 'pending', habit.timesPerDay - 1, selectedDate);
      } else if (effectiveStatus === 'pending') {
        const newCount = (effectiveCount || 0) + 1;
        if (newCount >= habit.timesPerDay) {
          toggleHabitStatus(habit.id, 'done', habit.timesPerDay, selectedDate);
        } else {
          toggleHabitStatus(habit.id, 'pending', newCount, selectedDate);
        }
      }
    } else {
      const getNextStatus = (currentStatus: HabitStatus): HabitStatus => {
        switch (currentStatus) {
          case 'pending': return 'done';
          case 'done': return 'pending';
          case 'skipped': return 'pending';
        }
      };
      toggleHabitStatus(habit.id, getNextStatus(effectiveStatus), undefined, selectedDate);
    }
  };

  const handleDecrement = () => {
    if (habit.timesPerDay && habit.timesPerDay > 1 && effectiveCount && effectiveCount > 0) {
      toggleHabitStatus(habit.id, 'pending', effectiveCount - 1, selectedDate);
    }
  };

  const showMultiCompleteControls = habit.timesPerDay && habit.timesPerDay > 1 && effectiveStatus === 'pending' && effectiveCount && effectiveCount > 0;

  // Skipped state - compact card
  if (effectiveStatus === 'skipped') {
    return (
      <div className="flex items-stretch gap-1.5">
        <div className="w-4 flex-shrink-0" />
        <div
          onClick={onClick}
          className={cn(
            'group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer flex-1 overflow-hidden',
            'border-border/60 bg-muted/30 hover:bg-muted/50'
          )}
        >
          <SkipForward className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-xs text-muted-foreground/70 flex-1 truncate">
            {habit.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleHabitStatus(habit.id, 'pending', undefined, selectedDate);
            }}
          >
            Unskip
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="habit-card"
      className="group relative flex items-stretch gap-1.5"
      onMouseEnter={() => { setHoveredItem(habit.id, 'habit'); setIsHovered(true); }}
      onMouseLeave={() => { setHoveredItem(null, null); setIsHovered(false); }}
    >
      <div className="w-4 flex-shrink-0" />

      <div
        onClick={onClick}
        className={cn(
          'relative flex items-center gap-3 px-4 rounded-lg border-2 shadow-sm hover:shadow-md transition-all cursor-pointer flex-1 overflow-hidden',
          compactMode ? 'py-2.5 min-h-[48px]' : 'py-3.5 min-h-[64px]',
          'bg-card border-border/80 hover:border-border',
          effectiveStatus === 'done' && 'ring-2 ring-primary/20 border-primary/40'
        )}
      >
        {/* Colored left accent bar */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: groupColor }}
        />
        
        {/* Content */}
        <div className="relative z-10 flex items-center gap-3 w-full pl-1">
          {showMultiCompleteControls ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDecrement();
                }}
                className="w-5 h-5 rounded-full border border-border flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all"
              >
                <Minus className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
              <span className="text-sm font-bold text-primary w-4 text-center">
                {effectiveCount}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleIncrement();
                }}
                className="w-5 h-5 rounded-full border border-border flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all"
              >
                <Plus className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              data-testid="habit-complete-button"
              onClick={(e) => {
                e.stopPropagation();
                handleIncrement();
              }}
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                effectiveStatus === 'done' && 'bg-primary border-primary',
                effectiveStatus === 'pending' && 'border-border hover:border-primary'
              )}
            >
              {effectiveStatus === 'done' && (
                <Check className="h-3 w-3 text-primary-foreground" />
              )}
            </button>
          )}
          
          <div className={cn('flex-1 min-w-0', compactMode ? 'flex flex-row flex-wrap gap-2 items-center' : 'flex flex-col gap-1')}>
            <span
              className={cn(
                'font-medium text-foreground leading-snug',
                compactMode ? 'text-sm' : 'text-[15px]',
                effectiveStatus === 'done' && 'line-through text-muted-foreground'
              )}
            >
              {habit.title}
            </span>
            
            <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', compactMode && 'flex-shrink-0')}>
              {groupEmoji && (
                <span className={cn('flex items-center gap-1 leading-none transition-opacity', !showMeta && 'opacity-0')}>
                  <span className="text-sm">{groupEmoji}</span>
                  <span className="font-medium">{habit.group}</span>
                </span>
              )}
              {habit.timesPerDay && habit.timesPerDay > 1 && (
                <span className={cn('font-semibold transition-opacity', !showMeta && 'opacity-0')}>
                  {effectiveCount}/{habit.timesPerDay}
                </span>
              )}
              {habit.startTime && (
                <span className={cn('font-semibold text-foreground/80 transition-opacity', !showMeta && 'opacity-0')}>
                  {habit.startTime}
                </span>
              )}
              {habit.streak > 0 && (
                <span className={cn('flex items-center gap-0.5 text-amber-600 font-semibold transition-opacity', !showMeta && 'opacity-0')}>
                  <Flame className="h-3 w-3" />
                  {habit.streak}
                </span>
              )}
            </div>
          </div>

          {/* Skip button */}
          {effectiveStatus === 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                toggleHabitStatus(habit.id, 'skipped', undefined, selectedDate);
              }}
            >
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Project block component with gradient
interface ProjectBlockProps {
  project: Project;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  activeId?: string | null;
}

function DraggableBlockTask({ task, onClick, compactMode, toggleTaskStatus, selectedDate, selectedDateStr }: {
  task: Task;
  onClick: () => void;
  compactMode: boolean;
  toggleTaskStatus: (id: string, status?: 'pending' | 'completed', date?: Date) => void;
  selectedDate: Date;
  selectedDateStr: string;
}) {
  const taskIsRecurring = isRecurring(task);
  const isTaskDoneOnDate = taskIsRecurring
    ? isCompletedOnDate(task, selectedDateStr)
    : task.status === 'completed';

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md bg-white/80 dark:bg-white/10 border border-white/30 dark:border-white/10 cursor-pointer hover:bg-white dark:hover:bg-white/20 transition-colors',
        compactMode ? 'px-2 py-1.5' : 'px-3 py-2'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id, undefined, taskIsRecurring ? selectedDate : undefined);
        }}
        className={cn(
          'flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          isTaskDoneOnDate
            ? 'bg-primary border-primary'
            : 'border-white/50 dark:border-white/30 hover:border-primary'
        )}
      >
        {isTaskDoneOnDate && (
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        )}
      </button>
      <span className={cn(
        'font-medium truncate',
        compactMode ? 'text-xs' : 'text-sm',
        isTaskDoneOnDate && 'line-through opacity-60'
      )}>
        {task.title}
      </span>
    </div>
  );
}

function ProjectBlock({ project, tasks, onTaskClick, activeId }: ProjectBlockProps) {
  const { compactMode, toggleTaskStatus, moveTaskToProjectBlock, selectedDate, userTimezone } = usePlannerStore();
  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedDateStr = toDateStr(selectedDate, resolvedTimezone);
  
  const tasksInBlock = tasks.filter(t => t.inProjectBlock);
  const availableTasks = tasks.filter(t => !t.inProjectBlock && t.startTime);
  
  const { isOver, setNodeRef } = useDroppable({ id: `projectblock:${project.name}` });
  const draggedTask = activeId ? tasks.find(t => t.id === activeId) : null;
  const canAcceptDrop = draggedTask?.project === project.name;

  const handleMoveAll = () => {
    availableTasks.forEach(task => {
      moveTaskToProjectBlock(task.id);
    });
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl overflow-hidden transition-all',
        compactMode ? 'mb-2' : 'mb-3',
        isOver && canAcceptDrop && 'ring-2 ring-primary'
      )}
      style={{
        background: `linear-gradient(135deg, ${project.color || 'oklch(0.7 0.15 250)'} 0%, ${project.color ? project.color.replace('0.7', '0.6') : 'oklch(0.6 0.12 280)'} 100%)`,
      }}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 text-white',
        compactMode ? 'px-3 py-2' : 'px-4 py-3'
      )}>
        <span className={compactMode ? 'text-base' : 'text-lg'}>{project.emoji}</span>
        <span className={cn('font-semibold', compactMode ? 'text-sm' : 'text-base')}>
          {project.name}
        </span>
        <span className={cn('text-white/70', compactMode ? 'text-xs' : 'text-sm')}>
          {project.startTime} · {project.duration}m
        </span>
      </div>
      
      {/* Tasks */}
      <div className={cn('px-3 pb-3', compactMode ? 'space-y-1' : 'space-y-2')}>
        {tasksInBlock.map((task) => (
          <DraggableBlockTask
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            compactMode={compactMode}
            toggleTaskStatus={toggleTaskStatus}
            selectedDate={selectedDate}
            selectedDateStr={selectedDateStr}
          />
        ))}

        {availableTasks.length > 0 && (
          <div className={cn('rounded-lg border border-dashed border-white/30 bg-white/10', compactMode ? 'p-2' : 'p-3')}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/70">
                {availableTasks.length} task{availableTasks.length !== 1 ? 's' : ''} available
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-white/90 hover:text-white hover:bg-white/20"
                onClick={handleMoveAll}
              >
                <ChevronsRight className="h-3 w-3 mr-1" />
                Move all
              </Button>
            </div>
            <div className="space-y-1">
              {availableTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer transition-colors"
                >
                  <span className="text-xs text-white truncate">{task.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-white/70 hover:text-white hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveTaskToProjectBlock(task.id);
                    }}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {availableTasks.length > 3 && (
                <p className="text-[10px] text-white/50 text-center py-1">
                  +{availableTasks.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {tasksInBlock.length === 0 && availableTasks.length === 0 && (
          <div className={cn(
            'text-xs text-white/60 text-center py-3 rounded-lg border border-dashed border-white/30',
            isOver && canAcceptDrop && 'border-white bg-white/20'
          )}>
            {isOver && canAcceptDrop ? (
              <span className="text-white">Drop to add to block</span>
            ) : isOver && !canAcceptDrop ? (
              <span className="text-white/50">Only {project.name} tasks allowed</span>
            ) : (
              <span>No tasks for this project</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Drop zone component for scheduled section
interface ScheduledDropZoneProps {
  dropId: string;
  isActive: boolean;
}

function ScheduledDropZone({ dropId, isActive }: ScheduledDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  
  if (!isActive) return null;
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-1 -my-0.5 transition-all rounded',
        isOver ? 'h-8 bg-primary/20 border-2 border-dashed border-primary my-1' : 'bg-transparent'
      )}
    />
  );
}

// Empty bucket drop zone
interface EmptyBucketDropZoneProps {
  bucket: TimeBucket;
  isActive: boolean;
}

function EmptyBucketDropZone({ bucket, isActive }: EmptyBucketDropZoneProps) {
  const dropId = `scheduled:${bucket}:empty`;
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  
  if (!isActive) return null;
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-all rounded-lg border-2 border-dashed',
        isOver 
          ? 'h-16 bg-primary/10 border-primary' 
          : 'h-10 bg-secondary/30 border-border'
      )}
    >
      <div className="h-full flex items-center justify-center">
        <span className={cn('text-xs', isOver ? 'text-primary' : 'text-muted-foreground')}>
          Drop here to schedule with time
        </span>
      </div>
    </div>
  );
}

// Helper to infer drop time
export function inferDropTime(
  bucket: TimeBucket,
  position: 'empty' | 'before' | 'after',
  referenceTime?: string
): string {
  const now = new Date();
  const ranges: Record<TimeBucket, { start: number; end: number }> = {
    anytime: { start: 0, end: 24 },
    morning: { start: 5, end: 12 },
    afternoon: { start: 12, end: 17 },
    evening: { start: 17, end: 24 },
  };
  const range = ranges[bucket];
  
  if (position === 'empty') {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour >= range.start && currentHour < range.end) {
      return `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    }
    return `${String(range.start).padStart(2, '0')}:00`;
  }
  
  if (!referenceTime) {
    return `${String(range.start).padStart(2, '0')}:00`;
  }
  
  const [refHour, refMinute] = referenceTime.split(':').map(Number);
  
  if (position === 'before') {
    let newMinute = refMinute - 30;
    let newHour = refHour;
    if (newMinute < 0) {
      newMinute += 60;
      newHour -= 1;
    }
    if (newHour < range.start) {
      newHour = range.start;
      newMinute = 0;
    }
    return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
  }
  
  let newMinute = refMinute + 30;
  let newHour = refHour;
  if (newMinute >= 60) {
    newMinute -= 60;
    newHour += 1;
  }
  if (newHour >= range.end) {
    newHour = range.end - 1;
    newMinute = 30;
  }
  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

// Hourly grid for scheduled items
interface HourlyGridProps {
  bucket: TimeBucket;
  scheduledTasks: Task[];
  scheduledHabits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  isCurrentBucket?: boolean;
  activeId?: string | null;
}

function HourlyGrid({ bucket, scheduledTasks, scheduledHabits, onTaskClick, onHabitClick, isCurrentBucket, activeId }: HourlyGridProps) {
  const { compactMode, showCurrentTimeIndicator } = usePlannerStore();
  const isDragging = !!activeId;
  const range = TIME_BUCKET_RANGES[bucket];
  
  const [currentTime, setCurrentTime] = useState<{ hour: number; minute: number } | null>(null);
  
  useEffect(() => {
    if (!isCurrentBucket) {
      setCurrentTime(null);
      return;
    }
    
    const updateTime = () => {
      const now = new Date();
      setCurrentTime({ hour: now.getHours(), minute: now.getMinutes() });
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [isCurrentBucket]);
  
  // Group items by hour
  const itemsByHour: Record<number, { tasks: Task[]; habits: Habit[] }> = {};
  
  scheduledTasks.forEach((task) => {
    if (task.startTime) {
      const hour = parseInt(task.startTime.split(':')[0]);
      if (!itemsByHour[hour]) itemsByHour[hour] = { tasks: [], habits: [] };
      itemsByHour[hour].tasks.push(task);
    }
  });

  scheduledHabits.forEach((habit) => {
    if (habit.startTime) {
      const hour = parseInt(habit.startTime.split(':')[0]);
      if (!itemsByHour[hour]) itemsByHour[hour] = { tasks: [], habits: [] };
      itemsByHour[hour].habits.push(habit);
    }
  });

  let hoursWithItems = Object.keys(itemsByHour)
    .map(Number)
    .filter((h) => h >= range.start && h < range.end)
    .sort((a, b) => a - b);

  if (isCurrentBucket && currentTime && currentTime.hour >= range.start && currentTime.hour < range.end) {
    if (!hoursWithItems.includes(currentTime.hour)) {
      hoursWithItems = [...hoursWithItems, currentTime.hour].sort((a, b) => a - b);
      if (!itemsByHour[currentTime.hour]) {
        itemsByHour[currentTime.hour] = { tasks: [], habits: [] };
      }
    }
  }

  if (hoursWithItems.length === 0) {
    if (isDragging && bucket !== 'anytime') {
      return <EmptyBucketDropZone bucket={bucket} isActive={true} />;
    }
    return null;
  }

  const timeFormatStr = useTimeFormat();
  const formatHour = (hour: number) => {
    if (timeFormatStr === 'HH:mm') {
      return `${String(hour).padStart(2, '0')}:00`;
    }
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  };

  const displayRows: { type: 'hour' | 'separator'; hour?: number; items?: { tasks: Task[]; habits: Habit[] } }[] = [];
  
  hoursWithItems.forEach((hour, index) => {
    if (index > 0) {
      const prevHour = hoursWithItems[index - 1];
      if (hour - prevHour > 1) {
        displayRows.push({ type: 'separator' });
      }
    }
    displayRows.push({ type: 'hour', hour, items: itemsByHour[hour] });
  });

  return (
    <div className="space-y-0">
      {displayRows.map((row, index) => {
        if (row.type === 'separator') {
          if (compactMode) return null;
          return (
            <div key={`sep-${index}`} className="flex items-center gap-3 py-2">
              <div className="w-14" />
              <div className="flex-1 flex items-center">
                <div className="flex-1 border-t border-dashed border-border" />
                <span className="px-3 text-xs text-muted-foreground/50">...</span>
                <div className="flex-1 border-t border-dashed border-border" />
              </div>
            </div>
          );
        }
        
        const { hour, items } = row;
        if (!hour || !items) return null;
        
        const isCurrentHour = currentTime && currentTime.hour === hour;
        
        return (
          <div key={hour} className="flex gap-3 relative">
            <div className="w-14 text-xs text-muted-foreground pt-3 text-right tabular-nums font-medium flex-shrink-0">
              {formatHour(hour)}
            </div>
            <div className={cn('flex-1 border-l-2 border-border/50 pl-4 relative', compactMode ? 'py-1' : 'py-2')}>
              {/* Current time indicator */}
              {showCurrentTimeIndicator && isCurrentHour && currentTime && (
                <div
                  className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                  style={{ top: `${(currentTime.minute / 60) * 100}%` }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary -ml-1" />
                  <div className="flex-1 h-0.5 bg-primary/50" />
                </div>
              )}
              
              <div className={compactMode ? 'space-y-1.5' : 'space-y-2'}>
                {(() => {
                  const allItems = [
                    ...items.habits.map(h => ({ type: 'habit' as const, item: h, time: h.startTime || '00:00' })),
                    ...items.tasks.map(t => ({ type: 'task' as const, item: t, time: t.startTime || '00:00' })),
                  ].sort((a, b) => a.time.localeCompare(b.time));
                  
                  return allItems.map((entry, idx) => (
                    <div key={entry.item.id}>
                      <ScheduledDropZone
                        dropId={`scheduled:${bucket}:before:${entry.type}:${entry.item.id}`}
                        isActive={isDragging}
                      />
                      {entry.type === 'habit' ? (
                        <HabitCard habit={entry.item as Habit} onClick={() => onHabitClick(entry.item as Habit)} />
                      ) : (
                        <TaskCard task={entry.item as Task} onClick={() => onTaskClick(entry.item as Task)} />
                      )}
                      {idx === allItems.length - 1 && (
                        <ScheduledDropZone
                          dropId={`scheduled:${bucket}:after:${entry.type}:${entry.item.id}`}
                          isActive={isDragging}
                        />
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Timeline bucket component - redesigned with bold left border accent
interface TimelineBucketProps {
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') => void;
  isCurrentBucket?: boolean;
  recurringProjects?: Project[];
  activeId?: string | null;
  layout?: 'single' | 'two-column';
}

function TimelineBucket({ bucket, tasks, habits, onTaskClick, onHabitClick, onAddClick, isCurrentBucket, recurringProjects = [], activeId, layout = 'single' }: TimelineBucketProps) {
  const { compactMode, chillMode, timeFormat } = usePlannerStore();
  const config = getBucketConfig(timeFormat === '24h')[bucket];
  const Icon = config.icon;
  
  const { isOver } = useDroppable({ id: bucket });
  const { isOver: isOverUnscheduled, setNodeRef: setUnscheduledRef } = useDroppable({ id: `unscheduled:${bucket}` });
  const [isHovered, setIsHovered] = useState(false);
  const showExtras = !chillMode || isHovered;

  const untimedTasks = tasks.filter((t) => !t.startTime && !t.inProjectBlock);
  const scheduledTasks = tasks.filter((t) => t.startTime && !t.inProjectBlock);
  const untimedHabits = habits.filter((h) => !h.startTime);
  const scheduledHabits = habits.filter((h) => h.startTime);

  const totalItems = tasks.length + habits.length;
  const hasScheduled = scheduledTasks.length > 0 || scheduledHabits.length > 0;
  const hasUntimed = untimedTasks.length > 0 || untimedHabits.length > 0;
  const hasProjectBlocks = recurringProjects.some((p) => p.timeBucket === bucket);

  return (
    <div
      className={cn(
        'relative rounded-xl bg-card border border-border shadow-sm transition-all overflow-hidden',
        (isOver || isOverUnscheduled) && 'ring-2 ring-primary border-primary',
        isCurrentBucket && 'ring-2 ring-primary/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Bold left border accent */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl', config.accentClass)} />
      
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between border-b border-border',
        compactMode ? 'px-5 py-3' : 'px-6 py-4',
      )}>
        <div className="flex items-center gap-3">
          <Icon className={cn('h-5 w-5', config.labelColor)} />
          <h2 className={cn('font-semibold text-foreground', compactMode ? 'text-base' : 'text-lg')}>{config.label}</h2>
          <span className={cn('text-muted-foreground transition-opacity', compactMode ? 'text-xs' : 'text-sm', !showExtras && 'opacity-0')}>{config.timeRange}</span>
          {totalItems > 0 && (
            <Badge variant="secondary" className={cn('text-xs font-medium transition-opacity', !showExtras && 'opacity-0')}>
              {totalItems}
            </Badge>
          )}
        </div>
        
        <div className={cn('flex items-center gap-1 transition-opacity', !showExtras && 'opacity-0')}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onAddClick(bucket, 'task')}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Task
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onAddClick(bucket, 'habit')}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Habit
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={cn(compactMode ? 'p-4' : 'p-5')}>
        {/* Untimed section */}
        {(hasUntimed || activeId) && (
          <div
            ref={setUnscheduledRef}
            className={cn(hasScheduled || hasProjectBlocks ? 'mb-5' : '')}
          >
            {layout === 'two-column' && (untimedTasks.length > 0 || untimedHabits.length > 0) ? (
              <div className="grid grid-cols-2 gap-3">
                {[...untimedTasks, ...untimedHabits].map((item) => (
                  'completedDates' in item ? (
                    <HabitCard key={item.id} habit={item} onClick={() => onHabitClick(item)} />
                  ) : (
                    <TaskCard key={item.id} task={item} onClick={() => onTaskClick(item)} />
                  )
                ))}
              </div>
            ) : (
              <div className={compactMode ? 'space-y-2' : 'space-y-2.5'}>
                {untimedHabits.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                ))}
                {untimedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                ))}
              </div>
            )}

            {!hasUntimed && activeId && (
              <div className="py-6 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
                Drop here to add unscheduled
              </div>
            )}
          </div>
        )}

        {/* Scheduled section */}
        {(hasScheduled || hasProjectBlocks || (activeId && hasUntimed)) && (
          <div>
            {hasUntimed && (hasScheduled || hasProjectBlocks) && bucket !== 'anytime' && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Scheduled</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {recurringProjects
              .filter((p) => p.timeBucket === bucket)
              .map((project) => {
                const projectTasks = tasks.filter((t) => t.project === project.name);
                return (
                  <ProjectBlock
                    key={project.name}
                    project={project}
                    tasks={projectTasks}
                    onTaskClick={onTaskClick}
                    activeId={activeId}
                  />
                );
              })}

            {hasScheduled && bucket !== 'anytime' && (
              <HourlyGrid
                bucket={bucket}
                scheduledTasks={scheduledTasks}
                scheduledHabits={scheduledHabits}
                onTaskClick={onTaskClick}
                onHabitClick={onHabitClick}
                isCurrentBucket={isCurrentBucket}
                activeId={activeId}
              />
            )}

            {!hasScheduled && bucket !== 'anytime' && activeId && hasUntimed && (
              <EmptyBucketDropZone bucket={bucket} isActive={true} />
            )}
          </div>
        )}

        {/* Empty state */}
        {totalItems === 0 && !hasProjectBlocks && (
          <div className="text-center py-8">
            {activeId && bucket !== 'anytime' ? (
              <EmptyBucketDropZone bucket={bucket} isActive={true} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No tasks scheduled. Drag tasks here or use the + buttons above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TimelineProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') => void;
  activeId?: string | null;
}

export function Timeline({ onTaskClick, onHabitClick, onAddClick, activeId }: TimelineProps) {
  const { tasks, habits, selectedDate, setSelectedDate, timelineItemFilter, compactMode, chillMode, navDirection, setNavDirection, showCompletedTasks, timeFormat, userTimezone, projects } = usePlannerStore();
  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [currentBucket, setCurrentBucket] = useState<TimeBucket | null>(null);
  const [mounted, setMounted] = useState(false);

  const filteredTasks = useMemo(() => {
    let result = timelineItemFilter === 'habits' ? [] : tasks;
    if (!showCompletedTasks) {
      result = result.filter((t) => t.status !== 'completed');
    }
    return result;
  }, [tasks, timelineItemFilter, showCompletedTasks]);

  const filteredHabits = useMemo(() => {
    if (timelineItemFilter === 'tasks') return [];
    const dateStr = toDateStr(selectedDate, resolvedTimezone);
    return habits.filter((h) => shouldShowOnDate(h, dateStr, resolvedTimezone));
  }, [habits, timelineItemFilter, selectedDate, resolvedTimezone]);

  useEffect(() => {
    setMounted(true);
    
    const updateCurrentBucket = () => {
      const now = new Date();
      const hour = now.getHours();
      
      const isToday = isSameDay(now, selectedDate);
      if (!isToday) {
        setCurrentBucket(null);
        return;
      }
      
      if (hour >= 5 && hour < 12) {
        setCurrentBucket('morning');
      } else if (hour >= 12 && hour < 17) {
        setCurrentBucket('afternoon');
      } else if (hour >= 17 || hour < 5) {
        setCurrentBucket('evening');
      }
    };

    updateCurrentBucket();
    const interval = setInterval(updateCurrentBucket, 60000);
    
    return () => clearInterval(interval);
  }, [selectedDate]);

  const tasksForDate = useMemo(() => {
    const selectedDateStr = toDateStr(selectedDate, resolvedTimezone);
    return filteredTasks.filter((task) => {
      if (!task.startDate) return false;
      const taskStartDateStr = task.startDate.includes('T')
        ? task.startDate.split('T')[0]
        : task.startDate;
      let matchesDate: boolean;
      if (isRecurring(task)) {
        matchesDate = shouldShowOnDate(task, selectedDateStr, resolvedTimezone) && taskStartDateStr <= selectedDateStr;
        if (matchesDate && !showCompletedTasks && isCompletedOnDate(task, selectedDateStr)) {
          return false;
        }
      } else {
        matchesDate = taskStartDateStr === selectedDateStr;
      }
      return matchesDate;
    });
  }, [filteredTasks, selectedDate, resolvedTimezone, showCompletedTasks]);

  const recurringProjectsForToday = useMemo(() => {
    const today = selectedDate.getDay();
    const dateOfMonth = selectedDate.getDate();
    return projects.filter((p) => {
      if (!p.startTime || !p.timeBucket || !p.repeatFrequency) return false;
      
      switch (p.repeatFrequency) {
        case 'daily':
          return true;
        case 'weekdays':
          return today >= 1 && today <= 5;
        case 'weekends':
          return today === 0 || today === 6;
        case 'weekly':
          return p.repeatDays?.includes(today) ?? false;
        case 'monthly':
          const targetDay = p.repeatMonthDay || 1;
          const lastDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
          return dateOfMonth === Math.min(targetDay, lastDayOfMonth);
        case 'custom':
          return p.repeatDays?.includes(today) ?? false;
        default:
          return false;
      }
    });
  }, [projects, selectedDate]);

  const scheduledTasksByBucket = useMemo(() => {
    const grouped: Record<TimeBucket, Task[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    tasksForDate
      .filter((task) => task.timeBucket)
      .sort((a, b) => {
        if (a.startTime && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
        if (a.startTime && !b.startTime) return -1;
        if (!a.startTime && b.startTime) return 1;
        return a.order - b.order;
      })
      .forEach((task) => {
        if (task.timeBucket) {
          grouped[task.timeBucket].push(task);
        }
      });

    return grouped;
  }, [tasksForDate]);

  const scheduledHabitsByBucket = useMemo(() => {
    const grouped: Record<TimeBucket, Habit[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    filteredHabits
      .filter((habit) => habit.timeBucket)
      .sort((a, b) => {
        if (a.startTime && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
        return 0;
      })
      .forEach((habit) => {
        if (habit.timeBucket) {
          grouped[habit.timeBucket].push(habit);
        }
      });

    return grouped;
  }, [filteredHabits]);

  const goToPreviousDay = () => {
    setNavDirection('right');
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
    setTimeout(() => setNavDirection(null), 600);
  };

  const goToNextDay = () => {
    setNavDirection('left');
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
    setTimeout(() => setNavDirection(null), 600);
  };

  const prevDate = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    return d;
  }, [selectedDate]);

  const nextDate = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    return d;
  }, [selectedDate]);

  const bucketOrder: TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];

  return (
    <div className="flex-1 relative h-full overflow-hidden">
      {/* Navigation buttons */}
      <button
        onClick={goToPreviousDay}
        aria-label="Go to previous day"
        className="group absolute left-0 top-0 bottom-0 w-12 z-10 flex items-center justify-center cursor-pointer bg-gradient-to-r from-background/80 to-transparent hover:from-background transition-all"
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-card border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        </div>
      </button>

      <button
        onClick={goToNextDay}
        aria-label="Go to next day"
        className="group absolute right-0 top-0 bottom-0 w-12 z-10 flex items-center justify-center cursor-pointer bg-gradient-to-l from-background/80 to-transparent hover:from-background transition-all"
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-card border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </button>

      {/* Main content */}
      <ScrollArea className="h-full">
        <div
          key={selectedDate.toISOString()}
          className={cn(
            'px-16 py-6',
            navDirection === 'left' && 'animate-slide-in-from-right',
            navDirection === 'right' && 'animate-slide-in-from-left'
          )}
        >
          {/* Anytime bucket - treated differently, sits at the top */}
          <div className="mb-6">
            <TimelineBucket
              bucket="anytime"
              tasks={scheduledTasksByBucket.anytime}
              habits={scheduledHabitsByBucket.anytime}
              onTaskClick={onTaskClick}
              onHabitClick={onHabitClick}
              onAddClick={onAddClick}
              isCurrentBucket={false}
              recurringProjects={recurringProjectsForToday}
              activeId={activeId}
              layout="two-column"
            />
          </div>

          {/* Time-anchored buckets */}
          <div className="space-y-5">
            {(['morning', 'afternoon', 'evening'] as TimeBucket[]).map((bucket) => (
              <TimelineBucket
                key={bucket}
                bucket={bucket}
                tasks={scheduledTasksByBucket[bucket]}
                habits={scheduledHabitsByBucket[bucket]}
                onTaskClick={onTaskClick}
                onHabitClick={onHabitClick}
                onAddClick={onAddClick}
                isCurrentBucket={currentBucket === bucket}
                recurringProjects={recurringProjectsForToday}
                activeId={activeId}
              />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
