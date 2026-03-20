'use client';

import { useMemo } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X, Minus, Flame, GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket, Priority, HabitStatus, HabitGroup } from '@/lib/planner-types';
import { TIME_BUCKET_RANGES } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDroppable, useDraggable } from '@dnd-kit/core';

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
    timeRange: '5am – 12pm',
    bgClass: 'bg-morning/20',
    borderClass: 'border-morning/40',
  },
  afternoon: {
    icon: Sun,
    label: 'Afternoon',
    timeRange: '12pm – 5pm',
    bgClass: 'bg-afternoon/20',
    borderClass: 'border-afternoon/40',
  },
  evening: {
    icon: Moon,
    label: 'Evening',
    timeRange: '5pm – 12am',
    bgClass: 'bg-evening/20',
    borderClass: 'border-evening/40',
  },
};

const priorityDots: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

const groupColors: Record<HabitGroup, { bg: string; text: string; border: string }> = {
  wellness: {
    bg: 'bg-habit-wellness/10',
    text: 'text-habit-wellness',
    border: 'border-habit-wellness/30',
  },
  work: {
    bg: 'bg-habit-work/10',
    text: 'text-habit-work',
    border: 'border-habit-work/30',
  },
  personal: {
    bg: 'bg-habit-personal/10',
    text: 'text-habit-personal',
    border: 'border-habit-personal/30',
  },
};

const projectColors: Record<string, string> = {
  Work: 'border-l-habit-work bg-habit-work/5',
  Wellness: 'border-l-habit-wellness bg-habit-wellness/5',
  Personal: 'border-l-habit-personal bg-habit-personal/5',
};

interface ScheduledTaskCardProps {
  task: Task;
  onClick: () => void;
  compact?: boolean;
}

function ScheduledTaskCard({ task, onClick, compact = false }: ScheduledTaskCardProps) {
  const { toggleTaskStatus, unscheduleTask } = usePlannerStore();
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

  const durationHeight = compact ? 32 : (task.duration ? Math.max(task.duration / 15 * 16, 48) : 48);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        'group relative flex items-start gap-2 p-2.5 rounded-lg bg-card border border-border/50 hover:border-border transition-all cursor-pointer',
        task.status === 'completed' && 'opacity-60',
        isDragging && 'opacity-50 shadow-lg z-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          task.status === 'completed'
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm text-foreground leading-tight',
              task.status === 'completed' && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity -mt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              unscheduleTask(task.id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {!compact && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {task.scheduledTime && (
              <span className="text-xs text-muted-foreground font-medium">
                {task.scheduledTime}
              </span>
            )}
            {task.priority && (
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', priorityDots[task.priority])} />
              </span>
            )}
            {task.duration && (
              <span className="text-xs text-muted-foreground">
                {task.duration}m
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface HabitCardProps {
  habit: Habit;
  onClick: () => void;
  compact?: boolean;
}

function HabitCard({ habit, onClick, compact = false }: HabitCardProps) {
  const { toggleHabitStatus } = usePlannerStore();
  const colors = groupColors[habit.group];

  const getNextStatus = (currentStatus: HabitStatus): HabitStatus => {
    switch (currentStatus) {
      case 'pending': return 'done';
      case 'done': return 'skipped';
      case 'skipped': return 'pending';
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer',
        colors.bg,
        colors.border,
        habit.status === 'done' && 'ring-1 ring-primary/20'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleHabitStatus(habit.id, getNextStatus(habit.status));
        }}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
          habit.status === 'done' && 'bg-primary border-primary',
          habit.status === 'skipped' && 'bg-muted border-muted-foreground/30',
          habit.status === 'pending' && 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {habit.status === 'done' && <Check className="h-3 w-3 text-primary-foreground" />}
        {habit.status === 'skipped' && <Minus className="h-2.5 w-2.5 text-muted-foreground" />}
      </button>
      
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm font-medium text-foreground',
            (habit.status === 'done' || habit.status === 'skipped') && 'line-through text-muted-foreground'
          )}
        >
          {habit.title}
        </span>
        {!compact && habit.timesPerDay && habit.timesPerDay > 1 && (
          <span className="text-xs text-muted-foreground ml-2">
            {habit.currentDayCount || 0}/{habit.timesPerDay}
          </span>
        )}
      </div>
      
      {habit.streak > 0 && (
        <div className="flex items-center gap-0.5">
          <Flame className="h-3 w-3 text-orange-500" />
          <span className="text-xs font-medium text-orange-500">{habit.streak}</span>
        </div>
      )}
    </div>
  );
}

// Hourly grid for time-specific buckets
interface HourlyGridProps {
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
}

function HourlyGrid({ bucket, tasks, habits, onTaskClick, onHabitClick }: HourlyGridProps) {
  const range = TIME_BUCKET_RANGES[bucket];
  const hours = [];
  
  for (let h = range.start; h < range.end; h++) {
    hours.push(h);
  }

  // Tasks with specific times
  const timedTasks = tasks.filter((t) => t.scheduledTime);
  const untimedTasks = tasks.filter((t) => !t.scheduledTime);
  
  // Habits with specific times
  const timedHabits = habits.filter((h) => h.scheduledTime);
  const untimedHabits = habits.filter((h) => !h.scheduledTime);

  // Group items by hour
  const itemsByHour: Record<number, { tasks: Task[]; habits: Habit[] }> = {};
  hours.forEach((h) => {
    itemsByHour[h] = { tasks: [], habits: [] };
  });

  timedTasks.forEach((task) => {
    const hour = parseInt(task.scheduledTime!.split(':')[0]);
    if (itemsByHour[hour]) {
      itemsByHour[hour].tasks.push(task);
    }
  });

  timedHabits.forEach((habit) => {
    const hour = parseInt(habit.scheduledTime!.split(':')[0]);
    if (itemsByHour[hour]) {
      itemsByHour[hour].habits.push(habit);
    }
  });

  // Check if there are any timed items
  const hasTimedItems = timedTasks.length > 0 || timedHabits.length > 0;

  // Group untimed items by project/group
  const projectGroups: Record<string, { tasks: Task[]; habits: Habit[] }> = {};
  
  untimedTasks.forEach((task) => {
    const project = task.project || 'Other';
    if (!projectGroups[project]) projectGroups[project] = { tasks: [], habits: [] };
    projectGroups[project].tasks.push(task);
  });

  untimedHabits.forEach((habit) => {
    // Map habit group to project name for visual consistency
    const groupName = habit.group.charAt(0).toUpperCase() + habit.group.slice(1);
    if (!projectGroups[groupName]) projectGroups[groupName] = { tasks: [], habits: [] };
    projectGroups[groupName].habits.push(habit);
  });

  return (
    <div className="space-y-3">
      {/* Untimed items section - pinned at top */}
      {(untimedTasks.length > 0 || untimedHabits.length > 0) && (
        <div className="space-y-2">
          {Object.entries(projectGroups).map(([projectName, items]) => (
            <div
              key={projectName}
              className={cn(
                'rounded-lg border-l-4 p-2',
                projectColors[projectName] || 'border-l-muted bg-muted/30'
              )}
            >
              <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
                {projectName}
              </div>
              <div className="space-y-1.5">
                {items.habits.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} compact />
                ))}
                {items.tasks.map((task) => (
                  <ScheduledTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hourly grid for timed items */}
      {hasTimedItems && (
        <div className="border-t border-border/50 pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Scheduled</div>
          <div className="space-y-0.5">
            {hours.map((hour) => {
              const hourItems = itemsByHour[hour];
              const hasItems = hourItems.tasks.length > 0 || hourItems.habits.length > 0;
              
              if (!hasItems) return null;
              
              return (
                <div key={hour} className="flex gap-3">
                  <div className="w-12 text-xs text-muted-foreground pt-2 text-right">
                    {hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
                  </div>
                  <div className="flex-1 space-y-1.5 py-1 border-l border-border/30 pl-3">
                    {hourItems.habits.map((habit) => (
                      <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} compact />
                    ))}
                    {hourItems.tasks.map((task) => (
                      <ScheduledTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TimelineBucketProps {
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
}

function TimelineBucket({ bucket, tasks, habits, onTaskClick, onHabitClick }: TimelineBucketProps) {
  const config = bucketConfig[bucket];
  const Icon = config.icon;
  
  const { isOver, setNodeRef } = useDroppable({ id: bucket });

  const totalItems = tasks.length + habits.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border-2 border-dashed transition-all',
        config.borderClass,
        isOver && 'border-solid border-primary bg-primary/5'
      )}
    >
      <div className={cn('px-4 py-3 rounded-t-lg', config.bgClass)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
          <span className="text-xs text-muted-foreground">{config.timeRange}</span>
          {totalItems > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 ml-auto">
              {totalItems}
            </Badge>
          )}
        </div>
      </div>
      
      <div className="p-3">
        {totalItems > 0 ? (
          bucket === 'anytime' ? (
            // Anytime bucket - simple list
            <div className="space-y-2">
              {habits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
              ))}
              {tasks.map((task) => (
                <ScheduledTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
              ))}
            </div>
          ) : (
            // Timed buckets - show hourly grid
            <HourlyGrid
              bucket={bucket}
              tasks={tasks}
              habits={habits}
              onTaskClick={onTaskClick}
              onHabitClick={onHabitClick}
            />
          )
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground/70">
              Drag tasks here to schedule
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface TimelineProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
}

export function Timeline({ onTaskClick, onHabitClick }: TimelineProps) {
  const { tasks, habits } = usePlannerStore();

  const scheduledTasks = useMemo(() => {
    const grouped: Record<TimeBucket, Task[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    tasks
      .filter((task) => task.isScheduled && task.timeBucket)
      .sort((a, b) => {
        if (a.scheduledTime && b.scheduledTime) {
          return a.scheduledTime.localeCompare(b.scheduledTime);
        }
        return a.order - b.order;
      })
      .forEach((task) => {
        if (task.timeBucket) {
          grouped[task.timeBucket].push(task);
        }
      });

    return grouped;
  }, [tasks]);

  const scheduledHabits = useMemo(() => {
    const grouped: Record<TimeBucket, Habit[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    habits
      .filter((habit) => habit.timeBucket)
      .sort((a, b) => {
        if (a.scheduledTime && b.scheduledTime) {
          return a.scheduledTime.localeCompare(b.scheduledTime);
        }
        return 0;
      })
      .forEach((habit) => {
        if (habit.timeBucket) {
          grouped[habit.timeBucket].push(habit);
        }
      });

    return grouped;
  }, [habits]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-4 max-w-2xl mx-auto">
        <TimelineBucket
          bucket="anytime"
          tasks={scheduledTasks.anytime}
          habits={scheduledHabits.anytime}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
        />
        <TimelineBucket
          bucket="morning"
          tasks={scheduledTasks.morning}
          habits={scheduledHabits.morning}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
        />
        <TimelineBucket
          bucket="afternoon"
          tasks={scheduledTasks.afternoon}
          habits={scheduledHabits.afternoon}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
        />
        <TimelineBucket
          bucket="evening"
          tasks={scheduledTasks.evening}
          habits={scheduledHabits.evening}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
        />
      </div>
    </ScrollArea>
  );
}
