'use client';

import { useMemo, useState } from 'react';
import { format, isToday, isSameDay } from 'date-fns';
import { Check, Clock, Repeat, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MiniWeekNav } from './mini-week-nav';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDroppable } from '@dnd-kit/core';

const bucketConfig: Record<TimeBucket, { label: string; timeRange: string; colorClass: string }> = {
  anytime: { label: 'Anytime', timeRange: 'Flexible', colorClass: 'bg-anytime' },
  morning: { label: 'Morning', timeRange: '5am - 12pm', colorClass: 'bg-morning' },
  afternoon: { label: 'Afternoon', timeRange: '12pm - 5pm', colorClass: 'bg-afternoon' },
  evening: { label: 'Evening', timeRange: '5pm - 12am', colorClass: 'bg-evening' },
};

interface MobileSchedulePanelProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') => void;
  activeId: string | null;
}

const bucketLabels: Record<TimeBucket, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

// Quick Reschedule Sheet for scheduled tasks
function QuickRescheduleSheet({ 
  task, 
  open, 
  onOpenChange 
}: { 
  task: Task | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { scheduleTask } = usePlannerStore();

  const handleReschedule = (bucket: TimeBucket) => {
    if (!task) return;
    scheduleTask(task.id, bucket);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Reschedule Task</SheetTitle>
          {task && (
            <p className="text-sm text-muted-foreground line-clamp-1">{task.title}</p>
          )}
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3 mt-6 pb-4">
          {(['anytime', 'morning', 'afternoon', 'evening'] as TimeBucket[]).map((bucket) => (
            <Button
              key={bucket}
              variant={task?.timeBucket === bucket ? 'default' : 'outline'}
              className="h-14 flex flex-col items-center justify-center gap-1"
              onClick={() => handleReschedule(bucket)}
            >
              <span className="text-sm font-medium">{bucketLabels[bucket]}</span>
              <span className="text-[10px] text-muted-foreground">
                {bucket === 'anytime' && 'Flexible'}
                {bucket === 'morning' && '5am - 12pm'}
                {bucket === 'afternoon' && '12pm - 5pm'}
                {bucket === 'evening' && '5pm - 12am'}
              </span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Mobile Scheduled Task Item
function MobileScheduledTask({ task, onClick, onReschedule }: { task: Task; onClick: () => void; onReschedule: (task: Task) => void }) {
  const { toggleTaskStatus, deleteTask, unscheduleTask, getProjectEmoji } = usePlannerStore();
  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50 active:border-border transition-all',
        task.status === 'completed' && 'opacity-60'
      )}
      onClick={onClick}
    >
      {projectEmoji && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl opacity-[0.06] select-none pointer-events-none">
          {projectEmoji}
        </span>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5',
          task.status === 'completed'
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 active:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="h-3 w-3 text-primary-foreground" />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm font-medium text-foreground leading-tight',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}>
            {task.title}
          </p>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onReschedule(task); }}>
                Reschedule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); unscheduleTask(task.id); }}>
                Move to sidebar
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {task.startTime && <span>{task.startTime}</span>}
          {task.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {task.duration}m
            </span>
          )}
          {task.repeatFrequency && task.repeatFrequency !== 'none' && (
            <Repeat className="h-3 w-3" />
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task.title}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTask(task.id)}
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

// Mobile Scheduled Habit Item
function MobileScheduledHabit({ habit, onClick }: { habit: Habit; onClick: () => void }) {
  const { toggleHabitStatus, getHabitGroupEmoji, getHabitGroupColor, selectedDate } = usePlannerStore();
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);
  
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isCompletedToday = habit.completedDates?.includes(dateStr);
  const isSkippedToday = habit.skippedDates?.includes(dateStr);
  const currentStatus = isCompletedToday ? 'done' : isSkippedToday ? 'skipped' : 'pending';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    toggleHabitStatus(habit.id, newStatus, undefined, selectedDate);
  };

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-xl border-2 transition-all',
        'border-border/40 active:border-border',
        currentStatus === 'done' && 'opacity-70'
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 10%, transparent) 0%, color-mix(in oklch, ${groupColor} 3%, transparent) 100%)`,
      }}
      onClick={onClick}
    >
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-3xl opacity-[0.06] select-none pointer-events-none">
        {groupEmoji}
      </span>

      <button
        onClick={handleToggle}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5',
          currentStatus === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground/40'
        )}
      >
        {currentStatus === 'done' && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium text-foreground leading-tight',
          currentStatus === 'done' && 'line-through text-muted-foreground'
        )}>
          {habit.title}
        </p>
        
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {habit.startTime && <span>{habit.startTime}</span>}
          {habit.timesPerDay && habit.timesPerDay > 1 && (
            <span>{habit.currentDayCount || 0}/{habit.timesPerDay}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Time Bucket Section
function TimeBucketSection({ 
  bucket, 
  tasks, 
  habits,
  onTaskClick,
  onHabitClick,
  onAddClick,
  onReschedule,
  isActive,
}: { 
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: () => void;
  onReschedule: (task: Task) => void;
  isActive: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const config = bucketConfig[bucket];
  const itemCount = tasks.length + habits.length;

  const { setNodeRef, isOver } = useDroppable({
    id: bucket,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        'rounded-xl border border-border/50 overflow-hidden transition-colors',
        isOver && 'border-primary bg-primary/5',
        isActive && 'ring-2 ring-primary/20'
      )}
    >
      {/* Bucket header */}
      <button
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 transition-colors',
          config.colorClass + '/10'
        )}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', config.colorClass)} />
          <span className="text-sm font-medium text-foreground">{config.label}</span>
          <span className="text-xs text-muted-foreground">({itemCount})</span>
        </div>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {/* Bucket content */}
      {!isCollapsed && (
        <div className="p-3 space-y-2 bg-background/50">
          {tasks.map((task) => (
            <MobileScheduledTask key={task.id} task={task} onClick={() => onTaskClick(task)} onReschedule={onReschedule} />
          ))}
          {habits.map((habit) => (
            <MobileScheduledHabit key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
          ))}
          
          {itemCount === 0 && (
            <button
              onClick={onAddClick}
              className="w-full py-4 text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              + Add task or habit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function MobileSchedulePanel({ onTaskClick, onHabitClick, onAddClick, activeId }: MobileSchedulePanelProps) {
  const { tasks, habits, selectedDate, timelineItemFilter } = usePlannerStore();
  const [rescheduleTask, setRescheduleTask] = useState<Task | null>(null);

  // Get items for selected date
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const scheduledItems = useMemo(() => {
    const buckets: Record<TimeBucket, { tasks: Task[]; habits: Habit[] }> = {
      anytime: { tasks: [], habits: [] },
      morning: { tasks: [], habits: [] },
      afternoon: { tasks: [], habits: [] },
      evening: { tasks: [], habits: [] },
    };

    // Filter tasks
    if (timelineItemFilter !== 'habits') {
      tasks.forEach((task) => {
        if (!task.timeBucket) return;
        // Check if task is scheduled for this date
        if (task.startDate && task.startDate !== selectedDateStr) return;
        if (!task.startDate && !isToday(selectedDate)) return;
        buckets[task.timeBucket].tasks.push(task);
      });
    }

    // Filter habits
    if (timelineItemFilter !== 'tasks') {
      habits.forEach((habit) => {
        if (!habit.timeBucket) return;
        buckets[habit.timeBucket].habits.push(habit);
      });
    }

    // Sort by time within each bucket
    Object.keys(buckets).forEach((bucket) => {
      buckets[bucket as TimeBucket].tasks.sort((a, b) => {
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });
      buckets[bucket as TimeBucket].habits.sort((a, b) => {
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });
    });

    return buckets;
  }, [tasks, habits, selectedDateStr, selectedDate, timelineItemFilter]);

  const totalItems = Object.values(scheduledItems).reduce(
    (sum, b) => sum + b.tasks.length + b.habits.length, 
    0
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mini week navigator */}
      <MiniWeekNav />
      
      {/* Date header */}
      <div className="px-4 py-3 border-b border-border bg-card">
        <h2 className="text-lg font-semibold text-foreground">
          {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMMM d')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalItems} {totalItems === 1 ? 'item' : 'items'} scheduled
        </p>
      </div>
      
      {/* Schedule content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {(['anytime', 'morning', 'afternoon', 'evening'] as TimeBucket[]).map((bucket) => (
            <TimeBucketSection
              key={bucket}
              bucket={bucket}
              tasks={scheduledItems[bucket].tasks}
              habits={scheduledItems[bucket].habits}
              onTaskClick={onTaskClick}
              onHabitClick={onHabitClick}
              onAddClick={() => onAddClick(bucket, 'task')}
              onReschedule={setRescheduleTask}
              isActive={!!activeId}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Reschedule Sheet */}
      <QuickRescheduleSheet 
        task={rescheduleTask} 
        open={!!rescheduleTask} 
        onOpenChange={(open) => !open && setRescheduleTask(null)} 
      />
    </div>
  );
}
