'use client';

import { useMemo, useState, useEffect } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X, SkipForward, Flame, GripVertical, Plus, Repeat, Minus, Trash2, ArrowLeftToLine, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { isSameDay } from 'date-fns';

const bucketConfig: Record<TimeBucket, {
  icon: typeof Clock;
  label: string;
  timeRange: string;
  bgClass: string;
  borderClass: string;
}> = {
  anytime: {
    icon: Sparkles,
    label: 'Anytime',
    timeRange: 'Flexible',
    bgClass: 'bg-anytime/30',
    borderClass: 'border-anytime/50',
  },
  morning: {
    icon: Sunrise,
    label: 'Morning',
    timeRange: formatBucketRange(TIME_BUCKET_RANGES.morning),
    bgClass: 'bg-morning/20',
    borderClass: 'border-morning/40',
  },
  afternoon: {
    icon: Sun,
    label: 'Afternoon',
    timeRange: formatBucketRange(TIME_BUCKET_RANGES.afternoon),
    bgClass: 'bg-afternoon/20',
    borderClass: 'border-afternoon/40',
  },
  evening: {
    icon: Moon,
    label: 'Evening',
    timeRange: formatBucketRange(TIME_BUCKET_RANGES.evening),
    bgClass: 'bg-evening/20',
    borderClass: 'border-evening/40',
  },
};

const priorityDots: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

// Task card component - with background emoji style (no gradient)
interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  const { compactMode, chillMode, toggleTaskStatus, unscheduleTask, deleteTask, getProjectEmoji, setHoveredItem, getProject, moveTaskToProjectBlock, moveTaskOutOfProjectBlock } = usePlannerStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const showMeta = !chillMode || isHovered;
  
  // Check if task's project has a time block
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

  const priorityLabels: Record<Priority, string> = {
    high: 'High',
    medium: 'Med',
    low: 'Low',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group relative flex items-stretch gap-1', isDragging && 'opacity-50 z-50')}
      onMouseEnter={() => { setHoveredItem(task.id, 'task'); setIsHovered(true); }}
      onMouseLeave={() => { setHoveredItem(null, null); setIsHovered(false); }}
    >
      {/* Drag handle — outside the card, to the left */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none flex items-center px-0.5 text-muted-foreground"
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
          'group/card relative flex gap-3 px-4 rounded-xl bg-card border border-border/50 hover:border-border transition-all cursor-pointer flex-1 overflow-hidden',
          compactMode ? 'py-2 min-h-[52px] items-center' : 'py-3 min-h-[72px] items-start',
          task.status === 'completed' && 'opacity-60',
        )}
      >
        {/* Large background emoji */}
        {projectEmoji && (
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl opacity-[0.08] select-none pointer-events-none"
            style={{ lineHeight: 1 }}
          >
            {projectEmoji}
          </span>
        )}

        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id);
          }}
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors relative z-10',
            compactMode ? 'self-center' : 'self-start mt-0.5',
            task.status === 'completed'
              ? 'bg-primary border-primary'
              : 'border-muted-foreground/40 hover:border-primary'
          )}
        >
          {task.status === 'completed' && (
            <Check className="h-3 w-3 text-primary-foreground" />
          )}
        </button>

        {/* Content */}
        <div className={cn('flex-1 min-w-0 relative z-10', compactMode ? 'flex flex-row flex-wrap gap-2 items-center' : 'flex flex-col gap-1')}>
          {/* Title */}
          <p
            className={cn(
              'font-medium text-foreground leading-tight line-clamp-2',
              compactMode ? 'text-xs' : 'text-sm',
              task.status === 'completed' && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>

          {/* Meta row - emoji, duration, priority, time */}
          <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', compactMode && 'flex-shrink-0')}>
            {projectEmoji && task.project && (
              <span className={cn('flex items-center gap-1 leading-none transition-opacity', !showMeta && 'opacity-0')}>
                <span className="text-sm">{projectEmoji}</span>
                <span>{task.project}</span>
              </span>
            )}
            {task.startTime && (
              <span className={cn('font-medium transition-opacity', !showMeta && 'opacity-0')}>{task.startTime}</span>
            )}
            {task.duration && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {task.duration}m
              </span>
            )}
            {task.priority && (
              <span className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-opacity',
                task.priority === 'high' && 'bg-priority-high/15 text-priority-high',
                task.priority === 'medium' && 'bg-priority-medium/15 text-priority-medium',
                task.priority === 'low' && 'bg-priority-low/15 text-priority-low',
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

        {/* Action buttons - back to sidebar and delete */}
        <div className={cn(
          'flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0 relative z-10 self-center',
        )}>
          {/* Move to project block button */}
          {canMoveToBlock && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                moveTaskToProjectBlock(task.id);
              }}
              title={`Move to ${project?.name} block`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          
          {/* Move out of project block button */}
          {canMoveOutOfBlock && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                moveTaskOutOfProjectBlock(task.id);
              }}
              title="Restore original time"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          )}
          
          {/* Back to sidebar button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              unscheduleTask(task.id);
            }}
            title="Move to sidebar"
          >
            <ArrowLeftToLine className="h-3.5 w-3.5" />
          </Button>
          
          {/* Delete button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
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
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{task.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteTask(task.id); setShowDeleteConfirm(false); }}
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

// Habit card component - with carbon fiber pattern background
// Skipped habits are compact with an undo button
interface HabitCardProps {
  habit: Habit;
  onClick: () => void;
}

function HabitCard({ habit, onClick }: HabitCardProps) {
  const { toggleHabitStatus, getHabitGroupEmoji, getHabitGroupColor, setHoveredItem, compactMode, chillMode } = usePlannerStore();
  const [isHovered, setIsHovered] = useState(false);
  const showMeta = !chillMode || isHovered;
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);

  // Handle increment for multi-complete habits
  const handleIncrement = () => {
    if (habit.timesPerDay && habit.timesPerDay > 1) {
      if (habit.status === 'done') {
        // Uncheck: drop back to one below the target
        toggleHabitStatus(habit.id, 'pending', habit.timesPerDay - 1);
      } else if (habit.status === 'pending') {
        const newCount = (habit.currentDayCount || 0) + 1;
        if (newCount >= habit.timesPerDay) {
          toggleHabitStatus(habit.id, 'done', habit.timesPerDay);
        } else {
          toggleHabitStatus(habit.id, 'pending', newCount);
        }
      }
    } else {
      // Regular toggle
      const getNextStatus = (currentStatus: HabitStatus): HabitStatus => {
        switch (currentStatus) {
          case 'pending': return 'done';
          case 'done': return 'pending';
          case 'skipped': return 'pending';
        }
      };
      toggleHabitStatus(habit.id, getNextStatus(habit.status));
    }
  };

  // Handle decrement for multi-complete habits
  const handleDecrement = () => {
    if (habit.timesPerDay && habit.timesPerDay > 1 && habit.currentDayCount && habit.currentDayCount > 0) {
      toggleHabitStatus(habit.id, 'pending', habit.currentDayCount - 1);
    }
  };

  const showMultiCompleteControls = habit.timesPerDay && habit.timesPerDay > 1 && habit.status === 'pending' && habit.currentDayCount && habit.currentDayCount > 0;

  // Skipped state - compact card
  if (habit.status === 'skipped') {
    return (
      <div className="flex items-stretch gap-1">
        <div className="w-5 flex-shrink-0" />
        <div
          onClick={onClick}
          className={cn(
            'group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer flex-1 overflow-hidden',
            'border-border/40 bg-muted/30 hover:bg-muted/50'
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
            toggleHabitStatus(habit.id, 'pending');
          }}
        >
            Unskip
          </Button>
        </div>
      </div>
    );
  }

  // Normal state (pending or done)
  return (
    <div
      className="group relative flex items-stretch gap-1"
      onMouseEnter={() => { setHoveredItem(habit.id, 'habit'); setIsHovered(true); }}
      onMouseLeave={() => { setHoveredItem(null, null); setIsHovered(false); }}
    >
      {/* Spacer matching the drag handle width on TaskCards */}
      <div className="w-5 flex-shrink-0" />

      {/* Card */}
      <div
        onClick={onClick}
        className={cn(
          'relative flex items-center gap-3 px-4 rounded-xl border-2 transition-all cursor-pointer flex-1 overflow-hidden',
          compactMode ? 'py-2 min-h-[52px]' : 'py-3 min-h-[72px]',
          'border-border/60 hover:border-border',
          habit.status === 'done' && 'ring-2 ring-primary/20 border-primary/30'
        )}
        style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 15%, transparent) 0%, color-mix(in oklch, ${groupColor} 5%, transparent) 100%)`,
        backgroundImage: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.02) 2px,
            rgba(255, 255, 255, 0.02) 4px
          ),
          repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.02) 2px,
            rgba(0, 0, 0, 0.02) 4px
          ),
          linear-gradient(135deg, color-mix(in oklch, ${groupColor} 15%, transparent) 0%, color-mix(in oklch, ${groupColor} 5%, transparent) 100%)
        `,
      }}
    >
      {/* Large background emoji */}
      <span 
        className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl opacity-[0.1] select-none pointer-events-none"
        style={{ lineHeight: 1 }}
      >
        {groupEmoji}
      </span>
      
      {/* Content */}
      <div className="relative z-10 flex items-center gap-3 w-full">
        {/* Checkbox / Multi-complete counter */}
        {showMultiCompleteControls ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDecrement();
              }}
              className="w-5 h-5 rounded-full border border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all"
            >
              <Minus className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
            <span className="text-sm font-bold text-primary w-4 text-center animate-in scale-in duration-300">
              {habit.currentDayCount}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleIncrement();
              }}
              className="w-5 h-5 rounded-full border border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all"
            >
              <Plus className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleIncrement();
            }}
            className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 relative',
              habit.status === 'done' && 'bg-primary border-primary',
              habit.status === 'pending' && 'border-muted-foreground/40 hover:border-primary'
            )}
          >
            {habit.status === 'done' && (
              <Check className="h-3 w-3 text-primary-foreground animate-in fade-in duration-200" />
            )}
          </button>
        )}
        
        <div className={cn('flex-1 min-w-0 relative z-10', compactMode ? 'flex flex-row flex-wrap gap-2 items-center' : 'flex flex-col gap-1')}>
          <span
            className={cn(
              'font-medium text-foreground leading-tight line-clamp-2',
              compactMode ? 'text-xs' : 'text-sm',
              habit.status === 'done' && 'line-through text-muted-foreground'
            )}
          >
            {habit.title}
          </span>
          
          {/* Meta row - group, times per day, start time */}
          <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', compactMode && 'flex-shrink-0')}>
            {habit.group && (
              <span className={cn('flex items-center gap-1 leading-none transition-opacity', !showMeta && 'opacity-0')}>
                {groupEmoji && <span className="text-sm">{groupEmoji}</span>}
                <span>{habit.group}</span>
              </span>
            )}
            {habit.startTime && (
              <span className={cn('font-medium transition-opacity', !showMeta && 'opacity-0')}>{habit.startTime}</span>
            )}
            {habit.timesPerDay && habit.timesPerDay > 1 && (
              <span>{habit.currentDayCount || 0}/{habit.timesPerDay} today</span>
            )}
            {habit.repeatFrequency && habit.repeatFrequency !== 'none' && habit.repeatFrequency !== 'daily' && (
              <Repeat className={cn('h-3 w-3 transition-opacity', !showMeta && 'opacity-0')} />
            )}
          </div>
        </div>
        
        {/* Streak badge */}
        {habit.streak > 0 && (
          <div className="flex items-center gap-0.5 bg-orange-500/15 px-2 py-1 rounded-md flex-shrink-0">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{habit.streak}</span>
          </div>
        )}

        {/* Skip button - always visible for pending habits */}
        {habit.status === 'pending' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleHabitStatus(habit.id, 'skipped');
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

// Project time block component
interface ProjectBlockProps {
  project: Project;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function ProjectBlock({ project, tasks, onTaskClick }: ProjectBlockProps) {
  const { compactMode, moveTaskToProjectBlock, moveTaskOutOfProjectBlock, toggleTaskStatus, getProjectColor } = usePlannerStore();
  
  // Tasks that are inside the project block vs those with their own start times
  const tasksInBlock = tasks.filter((t) => t.inProjectBlock);
  const tasksOutsideBlock = tasks.filter((t) => !t.inProjectBlock && t.startTime);
  
  if (tasksInBlock.length === 0 && tasksOutsideBlock.length === 0 && tasks.length === 0) {
    return null;
  }

  const projectColor = getProjectColor(project.name);

  return (
    <div 
      className={cn(
        'rounded-lg border-2 border-dashed overflow-hidden',
        compactMode ? 'p-2' : 'p-3'
      )}
      style={{ borderColor: projectColor }}
    >
      {/* Project block header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{project.emoji}</span>
        <span className={cn('font-medium text-foreground', compactMode ? 'text-xs' : 'text-sm')}>
          {project.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {project.startTime} · {project.duration}m
        </span>
      </div>
      
      {/* Tasks inside the block */}
      {tasksInBlock.length > 0 ? (
        <div className={compactMode ? 'space-y-1' : 'space-y-2'}>
          {tasksInBlock.map((task) => (
            <div key={task.id} className="group/blocktask relative">
              <div
                onClick={() => onTaskClick(task)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/50 cursor-pointer hover:border-border transition-all',
                  task.status === 'completed' && 'opacity-60'
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskStatus(task.id);
                  }}
                  className={cn(
                    'flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                    task.status === 'completed'
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/40 hover:border-primary'
                  )}
                >
                  {task.status === 'completed' && (
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  )}
                </button>
                
                <span className={cn(
                  'flex-1 text-sm',
                  task.status === 'completed' && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </span>
                
                {/* Move out button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 opacity-0 group-hover/blocktask:opacity-100 text-xs text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveTaskOutOfProjectBlock(task.id);
                  }}
                  title="Restore original time"
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          No tasks in this block yet
        </p>
      )}
    </div>
  );
}

// Truncated hourly grid showing only populated hours with "..." separators
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
        'h-2 -my-0.5 transition-all rounded',
        isOver ? 'h-8 bg-primary/20 border-2 border-dashed border-primary my-1' : 'bg-transparent'
      )}
    />
  );
}

// Empty bucket drop zone that expands when dragging
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
          : 'h-10 bg-secondary/30 border-border/50'
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

// Helper to infer drop time based on position
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
    // Use current time if within bucket, otherwise bucket start
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
    // 30 minutes before reference, but not before bucket start
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
  
  // position === 'after'
  // 30 minutes after reference, but not after bucket end
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

interface HourlyGridProps {
  bucket: TimeBucket;
  scheduledTasks: Task[];
  scheduledHabits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  isCurrentBucket?: boolean;
  recurringProjects?: Project[];
  activeId?: string | null;
}

function HourlyGrid({ bucket, scheduledTasks, scheduledHabits, onTaskClick, onHabitClick, isCurrentBucket, recurringProjects = [], activeId }: HourlyGridProps) {
  const { compactMode, showCurrentTimeIndicator } = usePlannerStore();
  const isDragging = !!activeId;
  const range = TIME_BUCKET_RANGES[bucket];
  
  // Current time tracking for the glow indicator
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
    const interval = setInterval(updateTime, 60000); // Update every minute
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

  // Find hours that have items within the bucket range
  let hoursWithItems = Object.keys(itemsByHour)
    .map(Number)
    .filter((h) => h >= range.start && h < range.end)
    .sort((a, b) => a - b);

  // Add current hour to display if in current bucket (even if no items at that hour)
  if (isCurrentBucket && currentTime && currentTime.hour >= range.start && currentTime.hour < range.end) {
    if (!hoursWithItems.includes(currentTime.hour)) {
      hoursWithItems = [...hoursWithItems, currentTime.hour].sort((a, b) => a - b);
      // Initialize empty items for the current hour
      if (!itemsByHour[currentTime.hour]) {
        itemsByHour[currentTime.hour] = { tasks: [], habits: [] };
      }
    }
  }

  // If no items but dragging is active, show empty drop zone
  if (hoursWithItems.length === 0) {
    if (isDragging && bucket !== 'anytime') {
      return <EmptyBucketDropZone bucket={bucket} isActive={true} />;
    }
    return null;
  }

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  };

  // Build display rows with separators for gaps > 1 hour
  const displayRows: { type: 'hour' | 'separator'; hour?: number; items?: { tasks: Task[]; habits: Habit[] } }[] = [];
  
  hoursWithItems.forEach((hour, index) => {
    if (index > 0) {
      const prevHour = hoursWithItems[index - 1];
      if (hour - prevHour > 1) {
        // Add a separator for the gap
        displayRows.push({ type: 'separator' });
      }
    }
    displayRows.push({ type: 'hour', hour, items: itemsByHour[hour] });
  });

  return (
    <div className={compactMode ? 'space-y-0' : 'space-y-1'}>
      {displayRows.map((row, index) => {
        if (row.type === 'separator') {
          if (compactMode) return null;
          return (
            <div key={`sep-${index}`} className="flex items-center gap-2 py-1">
              <div className="w-12" />
              <div className="flex-1 flex items-center">
                <div className="flex-1 border-t border-dashed border-border" />
                <span className="px-2 text-xs text-muted-foreground/60">...</span>
                <div className="flex-1 border-t border-dashed border-border" />
              </div>
            </div>
          );
        }
        
        const { hour, items } = row;
        if (!hour || !items) return null;
        
        const isCurrentHour = currentTime && currentTime.hour === hour;
        const minuteProgress = currentTime ? currentTime.minute / 60 : 0;
        
        return (
          <div key={hour} className="flex gap-2 relative">
            <div className="w-12 text-xs text-muted-foreground pt-2 text-right tabular-nums flex-shrink-0">
              {formatHour(hour)}
            </div>
            <div className={cn('flex-1 border-l border-border/30 pl-3 relative', compactMode ? 'py-0.5' : 'py-1')}>
              {/* Current time indicator */}
              {isCurrentHour && showCurrentTimeIndicator && (
                <div 
                  className="absolute left-0 right-0 h-0.5 pointer-events-none z-20"
                  style={{ top: `${minuteProgress * 100}%` }}
                >
                  <div className="absolute left-0 w-2 h-2 -mt-[3px] rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/50" />
                  <div className="absolute left-2 right-0 h-0.5 bg-primary/60 shadow-[0_0_6px_1px] shadow-primary/30" 
                    style={{ 
                      background: 'linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.3) 100%)'
                    }} 
                  />
                </div>
              )}
              <div className={compactMode ? 'space-y-1' : 'space-y-1.5'}>
                {/* Combine all items sorted by time for drop zone placement */}
                {(() => {
                  const allItems = [
                    ...items.habits.map(h => ({ type: 'habit' as const, item: h, time: h.startTime || '00:00' })),
                    ...items.tasks.map(t => ({ type: 'task' as const, item: t, time: t.startTime || '00:00' })),
                  ].sort((a, b) => a.time.localeCompare(b.time));
                  
                  return allItems.map((entry, idx) => (
                    <div key={entry.item.id}>
                      {/* Drop zone before this item */}
                      <ScheduledDropZone
                        dropId={`scheduled:${bucket}:before:${entry.type}:${entry.item.id}`}
                        isActive={isDragging}
                      />
                      {entry.type === 'habit' ? (
                        <HabitCard habit={entry.item as Habit} onClick={() => onHabitClick(entry.item as Habit)} />
                      ) : (
                        <TaskCard task={entry.item as Task} onClick={() => onTaskClick(entry.item as Task)} />
                      )}
                      {/* Drop zone after last item */}
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

// Timeline bucket component
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
}

function TimelineBucket({ bucket, tasks, habits, onTaskClick, onHabitClick, onAddClick, isCurrentBucket, recurringProjects = [], activeId }: TimelineBucketProps) {
  const config = bucketConfig[bucket];
  const Icon = config.icon;
  const { compactMode, chillMode } = usePlannerStore();
  // The outer droppable covers the entire bucket for unscheduled assignment
  const { isOver, setNodeRef } = useDroppable({ id: bucket });
  const [isHovered, setIsHovered] = useState(false);
  const showExtras = !chillMode || isHovered;

  // Separate into untimed and scheduled
  const untimedTasks = tasks.filter((t) => !t.startTime);
  const scheduledTasks = tasks.filter((t) => t.startTime);
  const untimedHabits = habits.filter((h) => !h.startTime);
  const scheduledHabits = habits.filter((h) => h.startTime);

  const totalItems = tasks.length + habits.length;
  const hasScheduled = scheduledTasks.length > 0 || scheduledHabits.length > 0;
  const hasUntimed = untimedTasks.length > 0 || untimedHabits.length > 0;

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed transition-all',
        config.borderClass,
        isOver && 'border-solid border-primary bg-primary/5',
        isCurrentBucket && 'shadow-[0_0_25px_-3px] shadow-primary/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header + untimed section wrapped together as the unscheduled drop zone */}
      <div ref={setNodeRef}>
        {/* Header */}
        <div className={cn(
          'rounded-t-lg flex items-center justify-between',
          compactMode ? 'px-4 py-2' : 'px-4 py-3',
          config.bgClass,
        )}>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <h3 className={cn('font-medium text-foreground', compactMode ? 'text-xs' : 'text-sm')}>{config.label}</h3>
            <span className={cn('text-muted-foreground transition-opacity', compactMode ? 'text-[10px]' : 'text-xs', !showExtras && 'opacity-0')}>{config.timeRange}</span>
            {totalItems > 0 && (
              <Badge variant="secondary" className={cn('text-xs h-5 px-1.5 transition-opacity', !showExtras && 'opacity-0')}>
                {totalItems}
              </Badge>
            )}
          </div>
          
          {/* Add buttons */}
          <div className={cn('flex items-center gap-1 transition-opacity', !showExtras && 'opacity-0')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onAddClick(bucket, 'task')}
            >
              <Plus className="h-3 w-3 mr-1" />
              Task
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onAddClick(bucket, 'habit')}
            >
              <Plus className="h-3 w-3 mr-1" />
              Habit
            </Button>
          </div>
        </div>

        {/* Untimed section — part of the unscheduled drop zone */}
        {(hasUntimed || (activeId && !hasScheduled)) && (
          <div className={cn(compactMode ? 'px-2 pt-2 space-y-1' : 'px-3 pt-3 space-y-3')}>
            {/* Untimed Habits */}
            {untimedHabits.length > 0 && (
              <div className="flex gap-2">
                <div className="w-12 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right flex-shrink-0 pt-2">
                  Habits
                </div>
                <div className={cn('flex-1 border-l border-border/30 pl-3 py-1', compactMode ? 'space-y-1' : 'space-y-2')}>
                  {untimedHabits.map((habit) => (
                    <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                  ))}
                </div>
              </div>
            )}

            {/* Untimed Tasks */}
            {untimedTasks.length > 0 && (
              <div className="flex gap-2">
                <div className="w-12 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right flex-shrink-0 pt-2">
                  Tasks
                </div>
                <div className={cn('flex-1 border-l border-border/30 pl-3 py-1', compactMode ? 'space-y-1' : 'space-y-2')}>
                  {untimedTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                  ))}
                </div>
              </div>
            )}

            {/* Placeholder when dragging and no untimed items but also no scheduled items */}
            {!hasUntimed && activeId && !hasScheduled && (
              <div className="py-4 text-center text-xs text-muted-foreground/50">
                Drop here to add unscheduled
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scheduled section — separate from the unscheduled drop zone */}
      {(hasScheduled || (activeId && hasUntimed)) && (
        <div className={cn(compactMode ? 'px-2 pb-2' : 'px-3 pb-3')}>
          {/* Divider */}
          {hasUntimed && hasScheduled && bucket !== 'anytime' && (
            <div className={cn('flex items-center gap-2', compactMode ? 'py-1 mt-1' : 'py-1 mt-3')}>
              <div className="flex-1 h-px bg-border" />
              <Clock className="h-3 w-3 text-muted-foreground/50" />
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Project blocks */}
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
                />
              );
            })}

          {/* Scheduled hourly grid */}
          {hasScheduled && bucket !== 'anytime' && (
            <HourlyGrid
              bucket={bucket}
              scheduledTasks={scheduledTasks}
              scheduledHabits={scheduledHabits}
              onTaskClick={onTaskClick}
              onHabitClick={onHabitClick}
              isCurrentBucket={isCurrentBucket}
              recurringProjects={recurringProjects}
              activeId={activeId}
            />
          )}

          {/* Empty schedule drop zone when dragging and there are untimed items but no scheduled ones */}
          {!hasScheduled && bucket !== 'anytime' && activeId && hasUntimed && (
            <div className={cn(compactMode ? 'mt-1' : 'mt-3')}>
              <EmptyBucketDropZone bucket={bucket} isActive={true} />
            </div>
          )}
        </div>
      )}

      {/* Completely empty bucket */}
      {totalItems === 0 && (
        <div className={cn('text-center', compactMode ? 'p-2' : 'p-3')}>
          {activeId && bucket !== 'anytime' ? (
            <EmptyBucketDropZone bucket={bucket} isActive={true} />
          ) : (
            <p className="text-sm text-muted-foreground/70">
              Drag tasks here or use + buttons above
            </p>
          )}
        </div>
      )}
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
  const { tasks, habits, selectedDate, timelineItemFilter, setTimelineItemFilter, compactMode } = usePlannerStore();
  const [currentBucket, setCurrentBucket] = useState<TimeBucket | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Filter tasks and habits based on timeline filter
  const filteredTasks = timelineItemFilter === 'habits' ? [] : tasks;
  const filteredHabits = timelineItemFilter === 'tasks' ? [] : habits;

  // Determine current time bucket and update every minute
  useEffect(() => {
    setMounted(true);
    
    const updateCurrentBucket = () => {
      const now = new Date();
      const hour = now.getHours();
      
      // Only show glow if viewing today
      const isToday = isSameDay(now, selectedDate);
      if (!isToday) {
        setCurrentBucket(null);
        return;
      }
      
      // Determine bucket based on hour
      if (hour >= 5 && hour < 12) {
        setCurrentBucket('morning');
      } else if (hour >= 12 && hour < 17) {
        setCurrentBucket('afternoon');
      } else if (hour >= 17 || hour < 5) {
        setCurrentBucket('evening');
      }
    };

    updateCurrentBucket();
    const interval = setInterval(updateCurrentBucket, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Avoid using searchQuery from store - it's been removed
  const searchQuery = '';

  // Filter tasks by selected date and search query
  const tasksForDate = useMemo(() => {
    return filteredTasks.filter((task) => {
      // If no start date, show in sidebar only (not on timeline)
      if (!task.startDate) return false;
      // Check if task's start date matches selected date
      const matchesDate = isSameDay(new Date(task.startDate), selectedDate);
      // Check search query
      const matchesSearch = !searchQuery || task.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [filteredTasks, selectedDate, searchQuery]);

  // Filter habits by search query
  const filteredHabitsForDate = useMemo(() => {
    if (!searchQuery) return filteredHabits;
    return filteredHabits.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [filteredHabits, searchQuery]);

  // Get projects with time blocks for the current day
  const { projects, getProject } = usePlannerStore();
  
  const recurringProjectsForToday = useMemo(() => {
    const today = selectedDate.getDay(); // 0 = Sunday
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
          // For weekly, check if today matches any of the repeat days
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

    // Include all tasks that have a timeBucket assigned (scheduled or unscheduled)
    tasksForDate
      .filter((task) => task.timeBucket)
      .sort((a, b) => {
        // Scheduled tasks (with startTime) come first, sorted by time
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

  // Habits are always shown (they repeat)
  const scheduledHabitsByBucket = useMemo(() => {
    const grouped: Record<TimeBucket, Habit[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    filteredHabitsForDate
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
  }, [filteredHabitsForDate]);

  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="relative">
        {/* Previous day wireframe preview */}
        <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none">
          <div className="h-full flex flex-col justify-center gap-4 pr-2 opacity-20">
            <div className="h-16 w-full bg-gradient-to-r from-transparent to-border rounded-r-lg" />
            <div className="h-24 w-full bg-gradient-to-r from-transparent to-border rounded-r-lg" />
            <div className="h-20 w-full bg-gradient-to-r from-transparent to-border rounded-r-lg" />
            <div className="h-16 w-full bg-gradient-to-r from-transparent to-border rounded-r-lg" />
          </div>
          <button
            onClick={goToPreviousDay}
            className="absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer hover:bg-background/50 transition-colors group"
          >
            <ChevronLeft className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        {/* Next day wireframe preview */}
        <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none">
          <div className="h-full flex flex-col justify-center gap-4 pl-2 opacity-20">
            <div className="h-16 w-full bg-gradient-to-l from-transparent to-border rounded-l-lg" />
            <div className="h-20 w-full bg-gradient-to-l from-transparent to-border rounded-l-lg" />
            <div className="h-28 w-full bg-gradient-to-l from-transparent to-border rounded-l-lg" />
            <div className="h-16 w-full bg-gradient-to-l from-transparent to-border rounded-l-lg" />
          </div>
          <button
            onClick={goToNextDay}
            className="absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer hover:bg-background/50 transition-colors group"
          >
            <ChevronRight className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        <div className={cn('max-w-3xl mx-auto pb-20', compactMode ? 'p-3 space-y-2' : 'p-6 space-y-4')}>
        {/* Search results indicator */}
        {searchQuery && (
          <div className="text-sm text-muted-foreground mb-2">
            Showing results for "{searchQuery}"
          </div>
        )}

        {/* Anytime bucket pinned at top */}
<TimelineBucket
  bucket="anytime"
  tasks={scheduledTasksByBucket.anytime}
  habits={scheduledHabitsByBucket.anytime}
  onTaskClick={onTaskClick}
  onHabitClick={onHabitClick}
  onAddClick={onAddClick}
  activeId={activeId}
/>
        
        {/* Time-specific buckets */}
<TimelineBucket
  bucket="morning"
  tasks={scheduledTasksByBucket.morning}
  habits={scheduledHabitsByBucket.morning}
  onTaskClick={onTaskClick}
  onHabitClick={onHabitClick}
  onAddClick={onAddClick}
  isCurrentBucket={mounted && currentBucket === 'morning'}
  recurringProjects={recurringProjectsForToday}
  activeId={activeId}
/>
<TimelineBucket
  bucket="afternoon"
  tasks={scheduledTasksByBucket.afternoon}
  habits={scheduledHabitsByBucket.afternoon}
  onTaskClick={onTaskClick}
  onHabitClick={onHabitClick}
  onAddClick={onAddClick}
  isCurrentBucket={mounted && currentBucket === 'afternoon'}
  recurringProjects={recurringProjectsForToday}
  activeId={activeId}
/>
<TimelineBucket
  bucket="evening"
  tasks={scheduledTasksByBucket.evening}
  habits={scheduledHabitsByBucket.evening}
  onTaskClick={onTaskClick}
  onHabitClick={onHabitClick}
  onAddClick={onAddClick}
  isCurrentBucket={mounted && currentBucket === 'evening'}
  recurringProjects={recurringProjectsForToday}
  activeId={activeId}
/>
        </div>
      </div>
    </ScrollArea>
  );
}
