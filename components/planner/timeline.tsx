'use client';

import { useMemo, useState } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X, Minus, Flame, GripVertical, Plus, ListTodo, Repeat } from 'lucide-react';
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

const getGroupColor = (group: string): { bg: string; text: string; border: string; left: string } => {
  const colors: Record<string, { bg: string; text: string; border: string; left: string }> = {
    wellness: {
      bg: 'bg-habit-wellness/10',
      text: 'text-habit-wellness',
      border: 'border-habit-wellness/30',
      left: 'border-l-habit-wellness',
    },
    work: {
      bg: 'bg-habit-work/10',
      text: 'text-habit-work',
      border: 'border-habit-work/30',
      left: 'border-l-habit-work',
    },
    personal: {
      bg: 'bg-habit-personal/10',
      text: 'text-habit-personal',
      border: 'border-habit-personal/30',
      left: 'border-l-habit-personal',
    },
  };
  return colors[group] || colors.personal;
};

const getProjectColor = (project?: string): string => {
  const colors: Record<string, string> = {
    Work: 'border-l-habit-work bg-habit-work/5',
    Wellness: 'border-l-habit-wellness bg-habit-wellness/5',
    Personal: 'border-l-habit-personal bg-habit-personal/5',
  };
  return colors[project || ''] || 'border-l-muted bg-muted/30';
};

// Task card component
interface TaskCardProps {
  task: Task;
  onClick: () => void;
  compact?: boolean;
}

function TaskCard({ task, onClick, compact = false }: TaskCardProps) {
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
            {task.repeatFrequency && task.repeatFrequency !== 'none' && (
              <Repeat className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Habit card component - shorter and taller with fire icon
interface HabitCardProps {
  habit: Habit;
  onClick: () => void;
}

function HabitCard({ habit, onClick }: HabitCardProps) {
  const { toggleHabitStatus } = usePlannerStore();
  const colors = getGroupColor(habit.group);

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
        'group flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all cursor-pointer',
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
      
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={cn(
            'text-sm font-medium text-foreground truncate',
            (habit.status === 'done' || habit.status === 'skipped') && 'line-through text-muted-foreground'
          )}
        >
          {habit.title}
        </span>
        {habit.timesPerDay && habit.timesPerDay > 1 && (
          <span className="text-xs text-muted-foreground">
            {habit.currentDayCount || 0}/{habit.timesPerDay}
          </span>
        )}
      </div>
      
      {/* Fire icon for streak */}
      {habit.streak > 0 && (
        <div className="flex items-center gap-0.5 bg-orange-500/10 px-1.5 py-0.5 rounded-md">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-semibold text-orange-500">{habit.streak}</span>
        </div>
      )}
    </div>
  );
}

// Truncated hourly grid with gaps between clusters
interface HourlyGridProps {
  bucket: TimeBucket;
  scheduledTasks: Task[];
  scheduledHabits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
}

function HourlyGrid({ bucket, scheduledTasks, scheduledHabits, onTaskClick, onHabitClick }: HourlyGridProps) {
  const range = TIME_BUCKET_RANGES[bucket];
  
  // Group items by hour
  const itemsByHour: Record<number, { tasks: Task[]; habits: Habit[] }> = {};
  
  scheduledTasks.forEach((task) => {
    if (task.scheduledTime) {
      const hour = parseInt(task.scheduledTime.split(':')[0]);
      if (!itemsByHour[hour]) itemsByHour[hour] = { tasks: [], habits: [] };
      itemsByHour[hour].tasks.push(task);
    }
  });

  scheduledHabits.forEach((habit) => {
    if (habit.scheduledTime) {
      const hour = parseInt(habit.scheduledTime.split(':')[0]);
      if (!itemsByHour[hour]) itemsByHour[hour] = { tasks: [], habits: [] };
      itemsByHour[hour].habits.push(habit);
    }
  });

  // Find hours that have items
  const hoursWithItems = Object.keys(itemsByHour)
    .map(Number)
    .filter((h) => h >= range.start && h < range.end)
    .sort((a, b) => a - b);

  if (hoursWithItems.length === 0) return null;

  // Find clusters (consecutive hours with items)
  const clusters: number[][] = [];
  let currentCluster: number[] = [];

  hoursWithItems.forEach((hour, index) => {
    if (currentCluster.length === 0) {
      currentCluster.push(hour);
    } else {
      const lastHour = currentCluster[currentCluster.length - 1];
      if (hour - lastHour <= 2) {
        // Include hours up to this one
        for (let h = lastHour + 1; h <= hour; h++) {
          currentCluster.push(h);
        }
      } else {
        clusters.push([...currentCluster]);
        currentCluster = [hour];
      }
    }
    
    if (index === hoursWithItems.length - 1) {
      clusters.push(currentCluster);
    }
  });

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  };

  return (
    <div className="space-y-4">
      {clusters.map((cluster, clusterIndex) => (
        <div key={clusterIndex}>
          {clusterIndex > 0 && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span>...</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          <div className="space-y-0.5">
            {cluster.map((hour) => {
              const hourItems = itemsByHour[hour] || { tasks: [], habits: [] };
              const hasItems = hourItems.tasks.length > 0 || hourItems.habits.length > 0;
              
              return (
                <div key={hour} className="flex gap-3">
                  <div className="w-12 text-xs text-muted-foreground pt-2 text-right tabular-nums">
                    {formatHour(hour)}
                  </div>
                  <div className="flex-1 border-l border-border/30 pl-3 min-h-[32px]">
                    {hasItems && (
                      <div className="space-y-1.5 py-1">
                        {hourItems.habits.map((habit) => (
                          <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                        ))}
                        {hourItems.tasks.map((task) => (
                          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} compact />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
}

function TimelineBucket({ bucket, tasks, habits, onTaskClick, onHabitClick, onAddClick }: TimelineBucketProps) {
  const config = bucketConfig[bucket];
  const Icon = config.icon;
  
  const { isOver, setNodeRef } = useDroppable({ id: bucket });

  // Separate into untimed and scheduled
  const untimedTasks = tasks.filter((t) => !t.scheduledTime);
  const scheduledTasks = tasks.filter((t) => t.scheduledTime);
  const untimedHabits = habits.filter((h) => !h.scheduledTime);
  const scheduledHabits = habits.filter((h) => h.scheduledTime);

  const totalItems = tasks.length + habits.length;

  // Group untimed items by project/group
  const untimedTasksByProject: Record<string, Task[]> = {};
  untimedTasks.forEach((task) => {
    const project = task.project || 'Other';
    if (!untimedTasksByProject[project]) untimedTasksByProject[project] = [];
    untimedTasksByProject[project].push(task);
  });

  const untimedHabitsByGroup: Record<string, Habit[]> = {};
  untimedHabits.forEach((habit) => {
    const group = habit.group.charAt(0).toUpperCase() + habit.group.slice(1);
    if (!untimedHabitsByGroup[group]) untimedHabitsByGroup[group] = [];
    untimedHabitsByGroup[group].push(habit);
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border-2 border-dashed transition-all',
        config.borderClass,
        isOver && 'border-solid border-primary bg-primary/5'
      )}
    >
      {/* Header */}
      <div className={cn('px-4 py-3 rounded-t-lg flex items-center justify-between', config.bgClass)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
          <span className="text-xs text-muted-foreground">{config.timeRange}</span>
          {totalItems > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {totalItems}
            </Badge>
          )}
        </div>
        
        {/* Add buttons */}
        <div className="flex items-center gap-1">
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
      
      {/* Content */}
      <div className="p-3 space-y-4">
        {totalItems > 0 ? (
          <>
            {/* Untimed Habits Section */}
            {untimedHabits.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Repeat className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Habits</span>
                </div>
                {Object.entries(untimedHabitsByGroup).map(([groupName, groupHabits]) => (
                  <div
                    key={groupName}
                    className={cn(
                      'rounded-lg border-l-4 p-2',
                      getGroupColor(groupName.toLowerCase()).left,
                      getGroupColor(groupName.toLowerCase()).bg
                    )}
                  >
                    <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
                      {groupName}
                    </div>
                    <div className="space-y-1.5">
                      {groupHabits.map((habit) => (
                        <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Untimed Tasks Section */}
            {untimedTasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tasks</span>
                </div>
                {Object.entries(untimedTasksByProject).map(([projectName, projectTasks]) => (
                  <div
                    key={projectName}
                    className={cn(
                      'rounded-lg border-l-4 p-2',
                      getProjectColor(projectName)
                    )}
                  >
                    <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
                      {projectName}
                    </div>
                    <div className="space-y-1.5">
                      {projectTasks.map((task) => (
                        <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} compact />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scheduled Section (hourly grid) */}
            {(scheduledTasks.length > 0 || scheduledHabits.length > 0) && bucket !== 'anytime' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduled</span>
                </div>
                <HourlyGrid
                  bucket={bucket}
                  scheduledTasks={scheduledTasks}
                  scheduledHabits={scheduledHabits}
                  onTaskClick={onTaskClick}
                  onHabitClick={onHabitClick}
                />
              </div>
            )}
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground/70">
              Drag tasks here or use + buttons above
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
  onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') => void;
}

export function Timeline({ onTaskClick, onHabitClick, onAddClick }: TimelineProps) {
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
    <ScrollArea className="flex-1 h-full">
      <div className="p-6 space-y-4 max-w-2xl mx-auto pb-20">
        <TimelineBucket
          bucket="anytime"
          tasks={scheduledTasks.anytime}
          habits={scheduledHabits.anytime}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
        <TimelineBucket
          bucket="morning"
          tasks={scheduledTasks.morning}
          habits={scheduledHabits.morning}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
        <TimelineBucket
          bucket="afternoon"
          tasks={scheduledTasks.afternoon}
          habits={scheduledHabits.afternoon}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
        <TimelineBucket
          bucket="evening"
          tasks={scheduledTasks.evening}
          habits={scheduledHabits.evening}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
      </div>
    </ScrollArea>
  );
}
