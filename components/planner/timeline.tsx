'use client';

import { useMemo } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X, Minus, Flame, GripVertical, Plus, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket, Priority, HabitStatus } from '@/lib/planner-types';
import { TIME_BUCKET_RANGES } from '@/lib/planner-types';
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
    timeRange: '5am - 12pm',
    bgClass: 'bg-morning/20',
    borderClass: 'border-morning/40',
  },
  afternoon: {
    icon: Sun,
    label: 'Afternoon',
    timeRange: '12pm - 5pm',
    bgClass: 'bg-afternoon/20',
    borderClass: 'border-afternoon/40',
  },
  evening: {
    icon: Moon,
    label: 'Evening',
    timeRange: '5pm - 12am',
    bgClass: 'bg-evening/20',
    borderClass: 'border-evening/40',
  },
};

const priorityDots: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

// Task card component - full width, compact height
interface TaskCardProps {
  task: Task;
  onClick: () => void;
  compact?: boolean;
}

function TaskCard({ task, onClick, compact = false }: TaskCardProps) {
  const { toggleTaskStatus, unscheduleTask, getProjectEmoji } = usePlannerStore();
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
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/50 hover:border-border transition-all cursor-pointer w-full',
        task.status === 'completed' && 'opacity-60',
        isDragging && 'opacity-50 shadow-lg z-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
        onClick={(e) => e.stopPropagation()}
        suppressHydrationWarning
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      
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

      {/* Project emoji */}
      {projectEmoji && (
        <span className="text-sm flex-shrink-0">{projectEmoji}</span>
      )}
      
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p
          className={cn(
            'text-sm text-foreground leading-tight truncate',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        
        {!compact && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {task.startTime && (
              <span className="text-xs text-muted-foreground font-medium">
                {task.startTime}
              </span>
            )}
            {task.priority && (
              <span className={cn('w-1.5 h-1.5 rounded-full', priorityDots[task.priority])} />
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
      
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          unscheduleTask(task.id);
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Habit card component - wider with gradient background and large emoji
interface HabitCardProps {
  habit: Habit;
  onClick: () => void;
}

function HabitCard({ habit, onClick }: HabitCardProps) {
  const { toggleHabitStatus, getHabitGroupEmoji, getHabitGroupColor } = usePlannerStore();
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);

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
        'group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer w-[180px] min-h-[72px] overflow-hidden',
        'border-border/60 hover:border-border',
        habit.status === 'done' && 'ring-2 ring-primary/20 border-primary/30'
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 15%, transparent) 0%, color-mix(in oklch, ${groupColor} 5%, transparent) 100%)`,
      }}
    >
      {/* Large background emoji */}
      <span 
        className="absolute -right-2 -bottom-2 text-6xl opacity-[0.08] select-none pointer-events-none"
        style={{ lineHeight: 1 }}
      >
        {groupEmoji}
      </span>
      
      {/* Content */}
      <div className="relative z-10 flex items-center gap-3 w-full">
        {/* Checkbox */}
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
              'text-sm font-medium text-foreground leading-tight line-clamp-2',
              (habit.status === 'done' || habit.status === 'skipped') && 'line-through text-muted-foreground'
            )}
          >
            {habit.title}
          </span>
          
          {/* Times per day progress */}
          {habit.timesPerDay && habit.timesPerDay > 1 && (
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              {habit.currentDayCount || 0}/{habit.timesPerDay} today
            </span>
          )}
        </div>
        
        {/* Streak badge */}
        {habit.streak > 0 && (
          <div className="flex items-center gap-0.5 bg-orange-500/15 px-1.5 py-0.5 rounded-md flex-shrink-0">
            <Flame className="h-3 w-3 text-orange-500" />
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{habit.streak}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Truncated hourly grid showing only populated hours with "..." separators
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
  const hoursWithItems = Object.keys(itemsByHour)
    .map(Number)
    .filter((h) => h >= range.start && h < range.end)
    .sort((a, b) => a - b);

  if (hoursWithItems.length === 0) return null;

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
    <div className="space-y-1">
      {displayRows.map((row, index) => {
        if (row.type === 'separator') {
          return (
            <div key={`sep-${index}`} className="flex items-center gap-3 py-1">
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
        
        return (
          <div key={hour} className="flex gap-3">
            <div className="w-12 text-xs text-muted-foreground pt-2 text-right tabular-nums flex-shrink-0">
              {formatHour(hour)}
            </div>
            <div className="flex-1 border-l border-border/30 pl-3 py-1">
              <div className="space-y-1.5">
                {/* Habits row - side by side */}
                {items.habits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {items.habits.map((habit) => (
                      <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                    ))}
                  </div>
                )}
                {/* Tasks - full width each */}
                {items.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} compact />
                ))}
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
}

function TimelineBucket({ bucket, tasks, habits, onTaskClick, onHabitClick, onAddClick }: TimelineBucketProps) {
  const config = bucketConfig[bucket];
  const Icon = config.icon;
  
  const { isOver, setNodeRef } = useDroppable({ id: bucket });

  // Separate into untimed and scheduled
  const untimedTasks = tasks.filter((t) => !t.startTime);
  const scheduledTasks = tasks.filter((t) => t.startTime);
  const untimedHabits = habits.filter((h) => !h.startTime);
  const scheduledHabits = habits.filter((h) => h.startTime);

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
            {/* Untimed Section */}
            {(untimedHabits.length > 0 || untimedTasks.length > 0) && (
              <div className="space-y-3">
                {/* Untimed Habits - side by side */}
                {untimedHabits.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">Habits</span>
                    <div className="flex flex-wrap gap-2">
                      {untimedHabits.map((habit) => (
                        <HabitCard key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Untimed Tasks - full width */}
                {untimedTasks.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">Tasks</span>
                    {untimedTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Divider between untimed and scheduled */}
            {(untimedHabits.length > 0 || untimedTasks.length > 0) && (scheduledTasks.length > 0 || scheduledHabits.length > 0) && bucket !== 'anytime' && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-border" />
                <Clock className="h-3 w-3 text-muted-foreground/50" />
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Scheduled Section (hourly grid) */}
            {(scheduledTasks.length > 0 || scheduledHabits.length > 0) && bucket !== 'anytime' && (
              <HourlyGrid
                bucket={bucket}
                scheduledTasks={scheduledTasks}
                scheduledHabits={scheduledHabits}
                onTaskClick={onTaskClick}
                onHabitClick={onHabitClick}
              />
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
  const { tasks, habits, selectedDate, searchQuery } = usePlannerStore();

  // Filter tasks by selected date and search query
  const tasksForDate = useMemo(() => {
    return tasks.filter((task) => {
      // If no start date, show in sidebar only (not on timeline)
      if (!task.startDate) return false;
      // Check if task's start date matches selected date
      const matchesDate = isSameDay(new Date(task.startDate), selectedDate);
      // Check search query
      const matchesSearch = !searchQuery || task.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [tasks, selectedDate, searchQuery]);

  // Filter habits by search query
  const filteredHabits = useMemo(() => {
    if (!searchQuery) return habits;
    return habits.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [habits, searchQuery]);

  const scheduledTasksByBucket = useMemo(() => {
    const grouped: Record<TimeBucket, Task[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    tasksForDate
      .filter((task) => task.isScheduled && task.timeBucket)
      .sort((a, b) => {
        if (a.startTime && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
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

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="p-6 space-y-4 max-w-2xl mx-auto pb-20">
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
        />
        
        {/* Time-specific buckets */}
        <TimelineBucket 
          bucket="morning" 
          tasks={scheduledTasksByBucket.morning} 
          habits={scheduledHabitsByBucket.morning}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
        <TimelineBucket 
          bucket="afternoon" 
          tasks={scheduledTasksByBucket.afternoon} 
          habits={scheduledHabitsByBucket.afternoon}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
        <TimelineBucket 
          bucket="evening" 
          tasks={scheduledTasksByBucket.evening} 
          habits={scheduledHabitsByBucket.evening}
          onTaskClick={onTaskClick}
          onHabitClick={onHabitClick}
          onAddClick={onAddClick}
        />
      </div>
    </ScrollArea>
  );
}
