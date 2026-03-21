'use client';

import { useMemo, useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';
import { TIME_BUCKET_RANGES, formatBucketRange } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { Check, Clock, Flame } from 'lucide-react';

interface WeekViewProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
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

export function WeekView({ onTaskClick, onHabitClick }: WeekViewProps) {
  const { selectedDate, setSelectedDate, tasks, habits, compactMode, getProjectEmoji, getHabitGroupEmoji, timelineItemFilter, setTimelineItemFilter, showCurrentTimeIndicator } = usePlannerStore();

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

  // Get tasks and habits for a specific day
  const getItemsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayTasks = tasks.filter((task) => {
      if (!task.startDate) return false;
      const taskDate = new Date(task.startDate);
      return format(taskDate, 'yyyy-MM-dd') === dateStr;
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

  return (
    <div className={cn('flex-1 h-full flex flex-col', compactMode ? 'overflow-auto' : 'overflow-hidden')}>
      <div className={cn(
        'flex-1 flex flex-col w-full px-4',
        compactMode ? 'space-y-2 py-4' : 'gap-2 min-h-0 py-4'
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
              const isSelected = isSameDay(day, selectedDate);
              
              // Determine if the current time falls in this bucket for today
              const bucketRanges: Record<TimeBucket, { start: number; end: number }> = {
                anytime: { start: 0, end: 24 },
                morning: { start: 5, end: 12 },
                afternoon: { start: 12, end: 17 },
                evening: { start: 17, end: 24 },
              };
              const range = bucketRanges[bucket];
              const isCurrentCell = showCurrentTimeIndicator &&
                isToday(day) &&
                currentTime !== null &&
                currentTime.hour >= range.start &&
                currentTime.hour < range.end;
              const minuteProgress = currentTime
                ? ((currentTime.hour - range.start) * 60 + currentTime.minute) / ((range.end - range.start) * 60)
                : 0;
              
              return (
                <div
                  key={`${day.toISOString()}-${bucket}`}
                  className={cn(
                    'relative rounded-lg border border-border/50 p-1.5 space-y-1 overflow-y-auto',
                    compactMode ? 'min-h-[80px]' : 'min-h-0',
                    isSelected && 'border-primary/30 bg-primary/5',
                    isToday(day) && !isSelected && 'bg-secondary/30'
                  )}
                >
                  {/* Current time indicator */}
                  {isCurrentCell && (
                    <div
                      className="absolute left-0 right-0 h-0.5 pointer-events-none z-20"
                      style={{ top: `${minuteProgress * 100}%` }}
                    >
                      <div className="absolute left-0 w-1.5 h-1.5 -mt-[2px] rounded-full bg-primary shadow-[0_0_6px_2px] shadow-primary/50" />
                      <div
                        className="absolute left-1.5 right-0 h-0.5"
                        style={{ background: 'linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.2) 100%)' }}
                      />
                    </div>
                  )}
                  {/* Compact task pills */}
                  {bucketTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={cn(
                        'w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1',
                        'bg-card border border-border/50 hover:border-border transition-colors',
                        task.status === 'completed' && 'opacity-50 line-through'
                      )}
                    >
                      <span className={cn(
                        'flex-shrink-0 w-2 h-2 rounded-full border',
                        task.status === 'completed' ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      )}>
                        {task.status === 'completed' && (
                          <Check className="w-2 h-2 text-primary-foreground" />
                        )}
                      </span>
                      <span className="truncate">{task.title}</span>
                    </button>
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
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
