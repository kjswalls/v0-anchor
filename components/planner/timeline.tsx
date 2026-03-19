'use client';

import { useMemo } from 'react';
import { Clock, Sunrise, Sun, Moon, Sparkles, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, TimeBucket, Priority } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDroppable } from '@dnd-kit/core';

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
    bgClass: 'bg-anytime',
    borderClass: 'border-anytime',
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

interface ScheduledTaskCardProps {
  task: Task;
}

function ScheduledTaskCard({ task }: ScheduledTaskCardProps) {
  const { toggleTaskStatus, unscheduleTask } = usePlannerStore();
  const durationHeight = task.duration ? Math.max(task.duration / 15 * 16, 48) : 48;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-border transition-all',
        task.status === 'completed' && 'opacity-60'
      )}
      style={{ minHeight: durationHeight }}
    >
      <button
        onClick={() => toggleTaskStatus(task.id)}
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
            onClick={() => unscheduleTask(task.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.scheduledTime && (
            <span className="text-xs text-muted-foreground font-medium">
              {task.scheduledTime}
            </span>
          )}
          {task.priority && (
            <span className="flex items-center gap-1">
              <span className={cn('w-1.5 h-1.5 rounded-full', priorityDots[task.priority])} />
              <span className="text-xs text-muted-foreground capitalize">{task.priority}</span>
            </span>
          )}
          {task.project && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal">
              {task.project}
            </Badge>
          )}
          {task.duration && (
            <span className="text-xs text-muted-foreground">
              {task.duration}m
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface TimelineBucketProps {
  bucket: TimeBucket;
  tasks: Task[];
}

function TimelineBucket({ bucket, tasks }: TimelineBucketProps) {
  const config = bucketConfig[bucket];
  const Icon = config.icon;
  
  const { isOver, setNodeRef } = useDroppable({
    id: bucket,
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
      <div className={cn('px-4 py-3 rounded-t-lg', bucket !== 'anytime' && config.bgClass)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
          <span className="text-xs text-muted-foreground">{config.timeRange}</span>
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 ml-auto">
              {tasks.length}
            </Badge>
          )}
        </div>
      </div>
      
      <div className="p-3">
        {tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task) => (
              <ScheduledTaskCard key={task.id} task={task} />
            ))}
          </div>
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

export function Timeline() {
  const { tasks } = usePlannerStore();

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
        // Sort by scheduled time if available
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

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-4 max-w-2xl mx-auto">
        {/* Anytime bucket pinned at top */}
        <TimelineBucket bucket="anytime" tasks={scheduledTasks.anytime} />
        
        {/* Time-specific buckets */}
        <TimelineBucket bucket="morning" tasks={scheduledTasks.morning} />
        <TimelineBucket bucket="afternoon" tasks={scheduledTasks.afternoon} />
        <TimelineBucket bucket="evening" tasks={scheduledTasks.evening} />
      </div>
    </ScrollArea>
  );
}
