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
import { shouldShowOnDate, toDateStr } from '@/lib/recurrence';

interface WeekViewProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick?: (bucket: TimeBucket, type: 'task' | 'habit') => void;
}

const TIME_BUCKETS: TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];

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
  allTasks: Task[];
  onTaskClick: (task: Task) => void;
}

function WeekProjectBlock({ project, tasks, allTasks, onTaskClick }: WeekProjectBlockProps) {
  const { getProjectColor } = usePlannerStore();
  const projectColor = getProjectColor(project.name);
  
  // Tasks that are inside the project block (for this bucket/day)
  const tasksInBlock = tasks.filter(t => t.project === project.name && t.inProjectBlock);
  
  // All incomplete tasks for this project that are NOT in a project block (available to add)
  const availableTasks = allTasks.filter(
    t => t.project === project.name && t.status !== 'completed' && !t.inProjectBlock
  );
  
  // Show block if there are tasks inside or available tasks
  const hasContent = tasksInBlock.length > 0 || availableTasks.length > 0;
  
  return (
    <div 
      className="rounded-lg border-2 border-dashed p-1.5 space-y-0.5"
      style={{ borderColor: projectColor }}
    >
      {/* Project header */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground mb-0.5">
        {project.emoji && <span>{project.emoji}</span>}
        <span className="truncate font-medium">{project.name}</span>
        {project.startTime && (
          <span className="text-muted-foreground/60">
            {project.startTime}
          </span>
        )}
      </div>
      
      {/* Tasks inside the block */}
      {tasksInBlock.map((task) => (
        <DraggableTaskPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
      ))}
      
      {/* Available tasks preview (compact) */}
      {availableTasks.length > 0 && (
        <div className="border-t border-border/30 pt-0.5 mt-0.5">
          <div className="text-[8px] text-muted-foreground/60 mb-0.5">
            {availableTasks.length} available
          </div>
          {availableTasks.slice(0, 2).map((task) => (
            <div
              key={task.id}
              onClick={() => onTaskClick(task)}
              className="text-[9px] text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors pl-1"
            >
              {task.title}
            </div>
          ))}
          {availableTasks.length > 2 && (
            <div className="text-[8px] text-muted-foreground/50 pl-1">
              +{availableTasks.length - 2} more
            </div>
          )}
        </div>
      )}
      
      {/* Show empty state if recurring block has no content */}
      {!hasContent && (
        <div className="text-[8px] text-muted-foreground/50 text-center py-0.5">
          No tasks
        </div>
      )}
    </div>
  );
}

// Droppable cell wrapper for week view buckets
interface DroppableCellProps {
  dropId: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  glowColor?: string;
}

function DroppableCell({ dropId, children, className, disabled, glowColor }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({ 
    id: dropId,
    disabled: disabled,
  });
  
  // Combine glow effect with drop zone ring effect
  // Both use box-shadow, so we need to merge them
  // Use the same blue as Tailwind's ring-primary (hsl(221.2 83.2% 53.3%))
  const combinedStyle: React.CSSProperties | undefined = (() => {
    const glowShadow = glowColor ? `0 0 25px -3px ${glowColor}` : null;
    const ringShadow = !disabled && isOver ? 'inset 0 0 0 2px hsl(221.2 83.2% 53.3%)' : null;
    
    if (glowShadow && ringShadow) {
      return { boxShadow: `${glowShadow}, ${ringShadow}` };
    } else if (glowShadow) {
      return { boxShadow: glowShadow };
    } else if (ringShadow) {
      return { boxShadow: ringShadow };
    }
    return undefined;
  })();
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        !disabled && isOver && 'bg-primary/5'
      )}
      style={combinedStyle}
    >
      {children}
    </div>
  );
}

export function WeekView({ onTaskClick, onHabitClick, onAddClick }: WeekViewProps) {
  const { selectedDate, setSelectedDate, tasks, habits, projects, compactMode, chillMode, getProjectEmoji, getHabitGroupEmoji, timelineItemFilter, setTimelineItemFilter, showCurrentTimeIndicator, weekStartDay, userTimezone } = usePlannerStore();
  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  // Get the start of the week based on user preference
  const weekStartsOn = weekStartDay === 'monday' ? 1 : weekStartDay === 'saturday' ? 6 : 0;
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: weekStartsOn as 0 | 1 | 6 }), [selectedDate, weekStartsOn]);
  
  // Generate all 7 days of the week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Previous and next week dates
  const prevWeekDate = useMemo(() => subWeeks(selectedDate, 1), [selectedDate]);
  const nextWeekDate = useMemo(() => addWeeks(selectedDate, 1), [selectedDate]);

  // Helper to normalize date to yyyy-MM-dd string
  // startDate is always a string; handle legacy ISO format just in case
  const normalizeDateStr = (dateValue: string): string => {
    return dateValue.includes('T')
      ? dateValue.split('T')[0]
      : dateValue;
  };

  // Get tasks and habits for a specific day
  const getItemsForDay = (date: Date) => {
    const dateStr = toDateStr(date, resolvedTimezone);

    const dayTasks = tasks.filter((task) => {
      if (!task.startDate) return false;
      const taskDateStr = normalizeDateStr(task.startDate);
      return taskDateStr === dateStr;
    });

    const dayHabits = habits.filter(h => shouldShowOnDate(h, dateStr, resolvedTimezone));

    return { tasks: dayTasks, habits: dayHabits };
  };

  // Group items by bucket - separate scheduled and unscheduled
  const getItemsByBucket = (date: Date, bucket: TimeBucket) => {
    const { tasks: dayTasks, habits: dayHabits } = getItemsForDay(date);
    
    const bucketTasks = timelineItemFilter === 'habits' ? [] : dayTasks.filter((t) => t.timeBucket === bucket && t.isScheduled);
    const bucketHabits = timelineItemFilter === 'tasks' ? [] : dayHabits.filter((h) => h.timeBucket === bucket);
    
    // Separate into scheduled (has startTime) and unscheduled
    const unscheduledHabits = bucketHabits.filter(h => !h.startTime);
    const scheduledHabits = bucketHabits.filter(h => h.startTime);
    const unscheduledTasks = bucketTasks.filter(t => !t.startTime && !t.inProjectBlock);
    const scheduledTasks = bucketTasks.filter(t => t.startTime || t.inProjectBlock);
    
    return {
      tasks: bucketTasks,
      habits: bucketHabits,
      unscheduledHabits,
      scheduledHabits,
      unscheduledTasks,
      scheduledTasks,
      dayTasks, // All tasks for this day (for project block available tasks)
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

  // Get recurring project blocks for a specific date
  const getRecurringProjectsForDate = (date: Date) => {
    const dayOfWeek = new Date(toDateStr(date, resolvedTimezone) + 'T00:00:00').getDay(); // 0 = Sunday
    const dateOfMonth = date.getDate(); // 1-31
    return projects.filter((p) => {
      if (!p.startTime || !p.timeBucket || !p.repeatFrequency) return false;

      switch (p.repeatFrequency) {
        case 'daily':
          return true;
        case 'weekdays':
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'weekends':
          return dayOfWeek === 0 || dayOfWeek === 6;
        case 'monthly':
          const targetDay = p.repeatMonthDay || 1;
          const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
          return dateOfMonth === Math.min(targetDay, lastDayOfMonth);
        case 'custom':
          return p.repeatDays?.includes(dayOfWeek) ?? false;
        default:
          return false;
      }
    });
  };

  const navigateToPrevWeek = () => {
    setSelectedDate(prevWeekDate);
  };

  const navigateToNextWeek = () => {
    setSelectedDate(nextWeekDate);
  };

  return (
    <div className="flex-1 h-full relative overflow-hidden">
      {/* Previous week preview - positioned near the centered content */}
      <button
        onClick={navigateToPrevWeek}
        aria-label="Go to previous week"
        className="group absolute top-0 bottom-0 w-24 z-10 flex flex-col cursor-pointer border-r border-border/30 bg-background hover:bg-muted/30 transition-colors"
        style={{ right: 'calc(50% + 36rem - 3.5rem)' }}
      >
        {/* Week wireframe skeleton - hidden in chill mode */}
        {!chillMode && (
          <div className={cn(
            'flex flex-col w-full h-full',
            compactMode ? 'p-1.5 gap-1.5' : 'p-2 gap-2'
          )}>
            {/* Date header placeholder */}
            <div className="h-12 flex-shrink-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-lg bg-muted/60" />
            </div>
            {/* Time buckets - aligned with main timeline */}
            <div className={cn(
              'flex flex-col',
              compactMode ? 'gap-1.5' : 'flex-1 gap-2 min-h-0'
            )}>
              {TIME_BUCKETS.map((bucket) => {
                const style = bucketStyles[bucket];
                return (
                  <div 
                    key={bucket} 
                    className={cn(
                      'rounded-lg border-2 border-dashed overflow-hidden opacity-70',
                      style.borderClass,
                      !compactMode && 'flex-1 min-h-0',
                      compactMode && 'min-h-[50px]'
                    )}
                  >
                    {/* Colored header */}
                    <div className={cn('w-full px-1.5 py-1', style.bgClass)}>
                      <div className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
                    </div>
                    {/* Placeholder item rows */}
                    <div className="px-1 py-1 space-y-1">
                      <div className="h-4 rounded bg-muted/60" />
                      <div className="h-4 rounded bg-muted/60" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Fade mask - always visible, fades toward center */}
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent z-10 pointer-events-none" />
        {/* Chevron on hover */}
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-medium text-muted-foreground">Previous</span>
            <span className="text-[9px] font-medium text-muted-foreground">week</span>
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </button>

      {/* Main week content - centered with max width */}
      <div className={cn('h-full flex flex-col max-w-6xl w-full mx-auto', compactMode ? 'overflow-auto' : 'overflow-hidden')}>
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
                const { 
                  tasks: bucketTasks, 
                  unscheduledHabits, 
                  scheduledHabits,
                  unscheduledTasks, 
                  scheduledTasks,
                  dayTasks 
                } = getItemsByBucket(day, bucket);
                const projectBlocks = getProjectBlocksForBucket(day, bucket);
                const recurringProjects = getRecurringProjectsForDate(day).filter(p => p.timeBucket === bucket);
                const isSelected = isSameDay(day, selectedDate);
                const isPastDay = isBefore(startOfDay(day), startOfDay(new Date()));
                
                // Combine project blocks and recurring projects (avoid duplicates)
                const allProjectBlocks = [
                  ...projectBlocks,
                  ...recurringProjects.filter(rp => !projectBlocks.some(pb => pb.id === rp.id))
                ];
                
                // Get tasks not in project blocks - only unscheduled tasks outside blocks
                const tasksNotInBlocks = unscheduledTasks.filter(t => !allProjectBlocks.some(p => p.name === t.project));
                
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
  // Anytime bucket is never the "current" time bucket - it has no specific hours
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
                    glowColor={isCurrentCell ? style.glowColor : undefined}
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
                    {/* Current time indicator - renders in front of cards with gradient fade */}
                    {showCurrentTimeIndicator && isCurrentCell && minuteProgress > 0 && (
                      <>
                        {/* Clock icon - z-20 to show above everything */}
                        <div
                          className="absolute -left-4 -right-1 z-20 group/indicator pointer-events-none"
                          style={{ top: `${minuteProgress * 100}%` }}
                        >
                          {/* Invisible hover area */}
                          <div className="absolute left-0 right-0 -top-1.5 -bottom-1.5 cursor-default pointer-events-auto" />
                          {/* Clock icon */}
                          <Clock className="absolute left-0 w-2.5 h-2.5 text-gray-500 dark:text-white/70 top-1/2 -translate-y-[calc(50%-1px)] opacity-0 group-hover/indicator:opacity-100 transition-opacity" strokeWidth={3} />
                        </div>
                        {/* Dashed line and dot - z-10 with gradient opacity */}
                        <div
                          className="absolute -left-4 -right-1 z-10 pointer-events-none h-2 flex items-center"
                          style={{
                            top: `${minuteProgress * 100}%`,
                            transform: 'translateY(-50%)',
                            maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,1) 92%, rgba(0,0,0,1) 100%)',
                            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,1) 92%, rgba(0,0,0,1) 100%)',
                          }}
                        >
                          {/* Spacer for clock icon area */}
                          <div className="w-3.5 shrink-0" />
                          {/* Glowing dot */}
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white/70 shadow-[0_0_4px_1px] shadow-gray-400/50 dark:shadow-white/50 shrink-0" />
                          {/* Dashed line */}
                          <div className="flex-1 h-0 border-t-[1.5px] border-dashed border-gray-400 dark:border-white/50 ml-0.5" />
                        </div>
                      </>
                    )}
                    
                    {/* 1. Unscheduled habits first (matching day view order) */}
                    {unscheduledHabits.map((habit) => (
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
                    
                    {/* 2. Unscheduled tasks not in project blocks */}
                    {tasksNotInBlocks.map((task) => (
                      <DraggableTaskPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                    
                    {/* 3. Project blocks (including recurring) - contains scheduled items */}
                    {allProjectBlocks.map((project) => (
                      <WeekProjectBlock
                        key={project.id}
                        project={project}
                        tasks={bucketTasks}
                        allTasks={tasks}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                    
                    {/* 4. Scheduled habits */}
                    {scheduledHabits.map((habit) => (
                      <button
                        key={habit.id}
                        onClick={() => onHabitClick(habit)}
                        className={cn(
                          'w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1',
                          'bg-primary/10 border border-primary/20 hover:border-primary/40 transition-colors',
                          habit.status === 'done' && 'opacity-50'
                        )}
                      >
                        <Clock className="w-2 h-2 text-primary flex-shrink-0" />
                        <span className="truncate">{habit.title}</span>
                        {habit.startTime && <span className="text-[8px] text-muted-foreground ml-auto">{habit.startTime}</span>}
                      </button>
                    ))}
                    
                    {/* 5. Scheduled tasks (with startTime, not in project blocks) */}
                    {scheduledTasks.filter(t => !allProjectBlocks.some(p => p.name === t.project)).map((task) => (
                      <DraggableTaskPill key={task.id} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                  </DroppableCell>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Next week preview - positioned near the centered content */}
      <button
        onClick={navigateToNextWeek}
        aria-label="Go to next week"
        className="group absolute top-0 bottom-0 w-24 z-10 flex flex-col cursor-pointer border-l border-border/30 bg-background hover:bg-muted/30 transition-colors"
        style={{ left: 'calc(50% + 36rem + 0.5rem)' }}
      >
        {/* Week wireframe skeleton - hidden in chill mode */}
        {!chillMode && (
          <div className={cn(
            'flex flex-col w-full h-full',
            compactMode ? 'p-1.5 gap-1.5' : 'p-2 gap-2'
          )}>
            {/* Date header placeholder */}
            <div className="h-12 flex-shrink-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-lg bg-muted/60" />
            </div>
            {/* Time buckets - aligned with main timeline */}
            <div className={cn(
              'flex flex-col',
              compactMode ? 'gap-1.5' : 'flex-1 gap-2 min-h-0'
            )}>
              {TIME_BUCKETS.map((bucket) => {
                const style = bucketStyles[bucket];
                return (
                  <div 
                    key={bucket} 
                    className={cn(
                      'rounded-lg border-2 border-dashed overflow-hidden opacity-70',
                      style.borderClass,
                      !compactMode && 'flex-1 min-h-0',
                      compactMode && 'min-h-[50px]'
                    )}
                  >
                    {/* Colored header */}
                    <div className={cn('w-full px-1.5 py-1', style.bgClass)}>
                      <div className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
                    </div>
                    {/* Placeholder item rows */}
                    <div className="px-1 py-1 space-y-1">
                      <div className="h-4 rounded bg-muted/60" />
                      <div className="h-4 rounded bg-muted/60" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Fade mask - always visible, fades toward center */}
        <div className="absolute inset-0 bg-gradient-to-l from-background/90 via-background/30 to-transparent z-10 pointer-events-none" />
        {/* Chevron on hover */}
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-medium text-muted-foreground">Next</span>
            <span className="text-[9px] font-medium text-muted-foreground">week</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </button>
    </div>
  );
}
