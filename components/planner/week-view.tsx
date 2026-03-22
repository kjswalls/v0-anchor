'use client';

import { useMemo, useState, useEffect } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isToday, startOfDay, isBefore } from 'date-fns';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket, Project } from '@/lib/planner-types';
import { TIME_BUCKET_RANGES, formatBucketRange } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { Check, Clock, Flame, Plus, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDraggable, useDroppable } from '@dnd-kit/core';

interface WeekViewProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick?: (bucket: TimeBucket, type: 'task' | 'habit') => void;
}

const TIME_BUCKETS: TimeBucket[] = ['morning', 'afternoon', 'evening'];

const bucketLabels: Record<TimeBucket, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const bucketTimes: Record<TimeBucket, string> = {
  anytime: '',
  morning: formatBucketRange(TIME_BUCKET_RANGES.morning),
  afternoon: formatBucketRange(TIME_BUCKET_RANGES.afternoon),
  evening: formatBucketRange(TIME_BUCKET_RANGES.evening),
};

// Bucket styling config matching the day view
const bucketStyles: Record<TimeBucket, { borderClass: string; bgClass: string; glowColor: string }> = {
  anytime: {
    borderClass: 'border-anytime/50',
    bgClass: 'bg-anytime/30',
    glowColor: 'oklch(0.92 0.02 240 / 0.5)',
  },
  morning: {
    borderClass: 'border-morning/40',
    bgClass: 'bg-morning/20',
    glowColor: 'oklch(0.88 0.12 85 / 0.6)',
  },
  afternoon: {
    borderClass: 'border-afternoon/40',
    bgClass: 'bg-afternoon/20',
    glowColor: 'oklch(0.85 0.12 45 / 0.6)',
  },
  evening: {
    borderClass: 'border-evening/40',
    bgClass: 'bg-evening/20',
    glowColor: 'oklch(0.75 0.12 280 / 0.6)',
  },
};

// Draggable task pill for week view
interface DraggableTaskPillProps {
  task: Task;
  onClick: () => void;
}

function DraggableTaskPill({ task, onClick }: DraggableTaskPillProps) {
  const { getProjectEmoji, toggleTaskStatus } = usePlannerStore();
  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;
  
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
      className={cn(
        'w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1',
        'bg-card border border-border/50 hover:border-border transition-colors cursor-pointer',
        task.status === 'completed' && 'opacity-50',
        isDragging && 'opacity-50 shadow-lg z-50'
      )}
    >
      {/* Drag handle */}
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none">
        <GripVertical className="w-2 h-2 text-muted-foreground/40" />
      </span>
      
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'flex-shrink-0 w-2.5 h-2.5 rounded-full border flex items-center justify-center',
          task.status === 'completed' ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="w-1.5 h-1.5 text-primary-foreground" />
        )}
      </button>
      
      {/* Project emoji */}
      {projectEmoji && (
        <span className="flex-shrink-0 text-[8px]">{projectEmoji}</span>
      )}
      
      {/* Title */}
      <span 
        onClick={onClick}
        className={cn('truncate flex-1', task.status === 'completed' && 'line-through')}
      >
        {task.title}
      </span>
    </div>
  );
}

// Project block for week view
interface WeekProjectBlockProps {
  project: Project;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function WeekProjectBlock({ project, tasks, onTaskClick }: WeekProjectBlockProps) {
  const { getProjectColor } = usePlannerStore();
  const projectTasks = tasks.filter(t => t.project === project.id);
  const projectColor = getProjectColor(project.name);
  
  if (projectTasks.length === 0) return null;
  
  return (
    <div 
      className="rounded-lg border-2 border-dashed p-1.5 space-y-0.5"
      style={{ borderColor: projectColor }}
    >
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
        {project.emoji && <span>{project.emoji}</span>}
        <span className="truncate font-medium">{project.name}</span>
        {project.startTime && (
          <span className="text-muted-foreground/60">
            {project.startTime}
          </span>
        )}
      </div>
      {projectTasks.map((task) => (
        <DraggableTaskPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
      ))}
    </div>
  );
}

// Droppable cell wrapper for week view buckets
interface DroppableCellProps {
  dropId: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

function DroppableCell({ dropId, children, className, disabled, style }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({ 
    id: dropId,
    disabled: disabled,
  });
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        !disabled && isOver && 'ring-2 ring-primary ring-inset bg-primary/5'
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function WeekView({ onTaskClick, onHabitClick, onAddClick }: WeekViewProps) {
  const { selectedDate, setSelectedDate, tasks, habits, projects, compactMode, getProjectEmoji, getHabitGroupEmoji, timelineItemFilter, setTimelineItemFilter, showCurrentTimeIndicator } = usePlannerStore();

  // Hover state for navigation
  const [prevWeekHovered, setPrevWeekHovered] = useState(false);
  const [nextWeekHovered, setNextWeekHovered] = useState(false);

  // Track current time for the indicator
  const [currentTime, setCurrentTime] = useState<{ hour: number; minute: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime({ hour: now.getHours(), minute: now.getMinutes() });
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Get the start of the week (Sunday)
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 0 }), [selectedDate]);
  
  // Generate all 7 days of the week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Previous and next week dates
  const prevWeekDate = useMemo(() => subWeeks(selectedDate, 1), [selectedDate]);
  const nextWeekDate = useMemo(() => addWeeks(selectedDate, 1), [selectedDate]);

  // Get tasks and habits for a specific day
  const getItemsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayTasks = tasks.filter((task) => {
      if (!task.startDate) return false;
      // Handle both Date objects and string formats for startDate
      const taskDateStr = typeof task.startDate === 'string' 
        ? task.startDate 
        : format(task.startDate, 'yyyy-MM-dd');
      return taskDateStr === dateStr;
    });

    // For habits, check if they should show on this day
    const dayOfWeek = date.getDay();
    const dayHabits = habits.filter((habit) => {
      switch (habit.repeatFrequency) {
        case 'daily':
          return true;
        case 'weekdays':
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'weekends':
          return dayOfWeek === 0 || dayOfWeek === 6;
        case 'weekly':
          return habit.repeatDays?.includes(dayOfWeek) ?? false;
        default:
          return false;
      }
    });

    return { tasks: dayTasks, habits: dayHabits };
  };

  // Group items by bucket
  const getItemsByBucket = (date: Date, bucket: TimeBucket) => {
    const { tasks: dayTasks, habits: dayHabits } = getItemsForDay(date);
    
    return {
      tasks: timelineItemFilter === 'habits' ? [] : dayTasks.filter((t) => t.timeBucket === bucket && t.isScheduled),
      habits: timelineItemFilter === 'tasks' ? [] : dayHabits.filter((h) => h.timeBucket === bucket),
    };
  };

  // Get projects with time blocks for a bucket
  const getProjectBlocksForBucket = (date: Date, bucket: TimeBucket) => {
    const { tasks: dayTasks } = getItemsForDay(date);
    const bucketTasks = dayTasks.filter(t => t.timeBucket === bucket && t.isScheduled);
    
    // Find projects that have tasks in this bucket
    const projectIds = [...new Set(bucketTasks.filter(t => t.project).map(t => t.project!))];
    return projects.filter(p => projectIds.includes(p.id) && p.startTime && p.timeBucket === bucket);
  };

  const navigateToPrevWeek = () => {
    setSelectedDate(prevWeekDate);
  };

  const navigateToNextWeek = () => {
    setSelectedDate(nextWeekDate);
  };

  return (
    <div className="flex-1 h-full relative">
      {/* Previous week navigation - positioned relative to centered content */}
      <div 
        className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center cursor-pointer group"
        style={{ left: 'calc(50% - 36rem - 2rem)' }}
        onClick={navigateToPrevWeek}
        onMouseEnter={() => setPrevWeekHovered(true)}
        onMouseLeave={() => setPrevWeekHovered(false)}
      >
        {/* Chevron - always centered */}
        <div className="relative flex flex-col items-center">
          {/* Label appears above chevron on hover */}
          <div className={cn(
            'absolute bottom-full mb-2 text-[10px] font-medium text-muted-foreground/70 text-center leading-tight whitespace-nowrap transition-opacity',
            prevWeekHovered ? 'opacity-100' : 'opacity-0'
          )}>
            Previous<br />week
          </div>
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background/80 hover:bg-muted transition-colors">
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Main week content - centered with max width */}
      <div className={cn('h-full flex flex-col max-w-6xl mx-auto', compactMode ? 'overflow-auto' : 'overflow-hidden')}>
        <div className={cn(
          'p-4 flex flex-col',
          compactMode ? 'space-y-2' : 'flex-1 gap-2 min-h-0'
        )}>
          {/* Week header with day names and dates */}
          <div className="grid grid-cols-8 gap-1 flex-shrink-0">
            {/* Empty cell for time labels */}
            <div className="h-12" />
            
            {/* Day headers */}
            {weekDays.map((day) => (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'flex flex-col items-center justify-center h-12 rounded-lg transition-colors',
                  isSameDay(day, selectedDate) && 'bg-primary text-primary-foreground',
                  isToday(day) && !isSameDay(day, selectedDate) && 'bg-primary/10',
                  !isSameDay(day, selectedDate) && 'hover:bg-secondary'
                )}
              >
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {format(day, 'EEE')}
                </span>
                <span className={cn('text-sm font-medium', isToday(day) && !isSameDay(day, selectedDate) && 'text-primary')}>
                  {format(day, 'd')}
                </span>
              </button>
            ))}
          </div>

          {/* Time buckets grid */}
          {TIME_BUCKETS.map((bucket) => (
            <div
              key={bucket}
              className={cn(
                'grid grid-cols-8 gap-1',
                !compactMode && 'flex-1 min-h-0'
              )}
            >
              {/* Time label */}
              <div className="flex flex-col items-end justify-start pr-2 pt-1 flex-shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {bucketLabels[bucket]}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {bucketTimes[bucket]}
                </span>
              </div>
              
              {/* Day columns */}
              {weekDays.map((day) => {
                const { tasks: bucketTasks, habits: bucketHabits } = getItemsByBucket(day, bucket);
                const projectBlocks = getProjectBlocksForBucket(day, bucket);
                const isSelected = isSameDay(day, selectedDate);
                const isPastDay = isBefore(startOfDay(day), startOfDay(new Date()));
                
                // Get tasks not in project blocks
                const tasksNotInBlocks = bucketTasks.filter(t => !projectBlocks.some(p => p.id === t.project));
                
                // Determine if the current time falls in this bucket for today
                const style = bucketStyles[bucket];
                
                // Determine if this is the current time bucket
                // Evening wraps around midnight (5pm-5am)
                let isCurrentCell = false;
                let minuteProgress = 0;
                
                if (isToday(day) && currentTime !== null) {
                  const hour = currentTime.hour;
                  const minute = currentTime.minute;
                  
                  if (bucket === 'morning' && hour >= 5 && hour < 12) {
                    isCurrentCell = true;
                    minuteProgress = ((hour - 5) * 60 + minute) / (7 * 60);
                  } else if (bucket === 'afternoon' && hour >= 12 && hour < 17) {
                    isCurrentCell = true;
                    minuteProgress = ((hour - 12) * 60 + minute) / (5 * 60);
                  } else if (bucket === 'evening' && hour >= 17 && hour < 24) {
                    // Evening: 5pm-12am (7 hours)
                    isCurrentCell = true;
                    minuteProgress = ((hour - 17) * 60 + minute) / (7 * 60);
                  } else if (bucket === 'anytime') {
                    // Anytime is always "current" if viewing today
                    isCurrentCell = true;
                    minuteProgress = (hour * 60 + minute) / (24 * 60);
                  }
                }
                
                // Generate drop ID that matches the format expected by DnD handler
                const dropId = `week:${format(day, 'yyyy-MM-dd')}:${bucket}`;
                
                return (
                  <DroppableCell
                    key={`${day.toISOString()}-${bucket}`}
                    dropId={dropId}
                    disabled={isPastDay}
                    className={cn(
                      'relative rounded-lg border-2 border-dashed p-1.5 space-y-1 transition-all',
                      style.borderClass,
                      compactMode ? 'min-h-[80px] overflow-y-auto' : 'min-h-0',
                      isSelected && 'border-primary/30 bg-primary/5',
                      isToday(day) && !isSelected && style.bgClass
                    )}
                    style={isCurrentCell ? { 
                      boxShadow: `0 0 25px -3px ${style.glowColor}`,
                    } as React.CSSProperties : undefined}
                  >
                    {/* Add button - only for today and future days */}
                    {onAddClick && !isPastDay && (
                      <div className="flex justify-end mb-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground/40 hover:text-foreground hover:bg-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddClick(bucket, 'task');
                          }}
                          title="Add item"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {/* Current time indicator - subtle glowing line */}
                    {/* Uses white in dark mode, dark gray in light mode for visibility */}
                    {showCurrentTimeIndicator && isCurrentCell && minuteProgress > 0 && (
                      <div
                        className="absolute -left-4 -right-1 pointer-events-none z-10"
                        style={{ top: `${minuteProgress * 100}%` }}
                      >
                        {/* Clock icon to the left, centered vertically with dot */}
                        <Clock className="absolute left-0 w-2.5 h-2.5 text-gray-500 dark:text-white/70 top-1/2 -translate-y-[calc(50%-1px)]" strokeWidth={3} />
                        {/* Glowing dot */}
                        <div className="absolute left-3.5 w-1.5 h-1.5 -mt-[2px] rounded-full bg-gray-500 dark:bg-white/70 shadow-[0_0_4px_1px] shadow-gray-400/50 dark:shadow-white/50" />
                        {/* Dashed line */}
                        <div
                          className="absolute left-5.5 right-0 h-0 border-t-[1.5px] border-dashed border-gray-400 dark:border-white/50"
                        />
                      </div>
                    )}
                    
                    {/* Project blocks */}
                    {projectBlocks.map((project) => (
                      <WeekProjectBlock
                        key={project.id}
                        project={project}
                        tasks={bucketTasks}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                    
                    {/* Tasks not in project blocks - draggable */}
                    {tasksNotInBlocks.map((task) => (
                      <DraggableTaskPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                    
                    {/* Compact habit pills */}
                    {bucketHabits.map((habit) => (
                      <button
                        key={habit.id}
                        onClick={() => onHabitClick(habit)}
                        className={cn(
                          'w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1',
                          'bg-primary/10 border border-primary/20 hover:border-primary/40 transition-colors',
                          habit.status === 'done' && 'opacity-50'
                        )}
                      >
                        <Flame className="w-2 h-2 text-primary flex-shrink-0" />
                        <span className="truncate">{habit.title}</span>
                      </button>
                    ))}
                  </DroppableCell>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Next week navigation - positioned relative to centered content */}
      <div 
        className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center cursor-pointer group"
        style={{ left: 'calc(50% + 36rem + 1rem)' }}
        onClick={navigateToNextWeek}
        onMouseEnter={() => setNextWeekHovered(true)}
        onMouseLeave={() => setNextWeekHovered(false)}
      >
        {/* Chevron - always centered */}
        <div className="relative flex flex-col items-center">
          {/* Label appears above chevron on hover */}
          <div className={cn(
            'absolute bottom-full mb-2 text-[10px] font-medium text-muted-foreground/70 text-center leading-tight whitespace-nowrap transition-opacity',
            nextWeekHovered ? 'opacity-100' : 'opacity-0'
          )}>
            Next<br />week
          </div>
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background/80 hover:bg-muted transition-colors">
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
