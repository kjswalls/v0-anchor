'use client';

import { useMemo, useState } from 'react';
import { format, isToday, isSameDay } from 'date-fns';
import { Check, Clock, Repeat, ChevronDown, ChevronUp, MoreHorizontal, Trash2, ArrowRight, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { Task, Habit, TimeBucket, Project } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { shouldShowOnDate, isRecurring, isCompletedOnDate, toDateStr } from '@/lib/recurrence';
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

// Mobile Scheduled Task Item
function MobileScheduledTask({ task, onClick }: { task: Task; onClick: () => void }) {
  const { toggleTaskStatus, deleteTask, unscheduleTask, getProjectEmoji, selectedDate, userTimezone } = usePlannerStore();
  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // For recurring tasks, derive completion from completedDates for the viewed date
  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedDateStr = toDateStr(selectedDate, resolvedTimezone);
  const taskIsRecurring = isRecurring(task);
  const isTaskDone = taskIsRecurring
    ? isCompletedOnDate(task, selectedDateStr)
    : task.status === 'completed';

  return (
    <>
      <div
        data-testid="mobile-task-card"
        className={cn(
          'group relative flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50 active:border-border transition-all',
          isTaskDone && 'opacity-60'
        )}
        onClick={onClick}
      >
        {projectEmoji && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl opacity-[0.06] select-none pointer-events-none">
            {projectEmoji}
          </span>
        )}

        <button
          data-testid="mobile-task-complete-button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id);
          }}
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5',
            isTaskDone
              ? 'bg-primary border-primary'
              : 'border-muted-foreground/40 active:border-primary'
          )}
        >
          {isTaskDone && (
            <Check className="h-3 w-3 text-primary-foreground" />
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              'text-sm font-medium text-foreground leading-tight',
              isTaskDone && 'line-through text-muted-foreground'
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
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task.title}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                deleteTask(task.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
      data-testid="mobile-habit-card"
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

// Mobile Project Block Component
interface MobileProjectBlockProps {
  project: Project;
  tasks: Task[];
  allTasks: Task[];
  onTaskClick: (task: Task) => void;
}

function MobileProjectBlock({ project, tasks, allTasks, onTaskClick }: MobileProjectBlockProps) {
  const { getProjectColor, moveTaskToProjectBlock, moveTasksToProjectBlock, toggleTaskStatus } = usePlannerStore();
  const projectColor = getProjectColor(project.name);
  
  // Tasks that are inside the project block
  const tasksInBlock = tasks.filter((t) => t.inProjectBlock);
  
  // All incomplete tasks for this project that are NOT in a project block
  const availableTasks = allTasks.filter(
    (t) => t.project === project.name && t.status !== 'completed' && !t.inProjectBlock
  );
  
  const handleMoveAll = () => {
    const taskIds = availableTasks.map((t) => t.id);
    moveTasksToProjectBlock(taskIds);
  };

  const handleToggleStatus = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    toggleTaskStatus(taskId);
  };

  return (
    <div
      className="rounded-xl border-2 border-dashed p-3 space-y-2"
      style={{ borderColor: projectColor }}
    >
      {/* Project header */}
      <div className="flex items-center gap-2">
        {project.emoji && <span className="text-lg">{project.emoji}</span>}
        <span className="font-medium text-sm text-foreground">{project.name}</span>
        {project.startTime && (
          <span className="text-xs text-muted-foreground">
            {project.startTime} · {project.duration}m
          </span>
        )}
      </div>
      
      {/* Tasks inside the block */}
      {tasksInBlock.length > 0 && (
        <div className="space-y-2">
          {tasksInBlock.map((task) => (
            <div
              key={task.id}
              onClick={() => onTaskClick(task)}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-lg bg-background/80 border border-border/30 transition-colors',
                task.status === 'completed' && 'opacity-60'
              )}
            >
              <button
                onClick={(e) => handleToggleStatus(e, task.id)}
                className={cn(
                  'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5',
                  task.status === 'completed' ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                )}
              >
                {task.status === 'completed' && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium text-foreground',
                  task.status === 'completed' && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </p>
                {(task.startTime || task.duration) && (
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {task.startTime && <span>{task.startTime}</span>}
                    {task.duration && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {task.duration}m
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available tasks preview */}
      {availableTasks.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/50 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {availableTasks.length} task{availableTasks.length !== 1 ? 's' : ''} available
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary"
              onClick={handleMoveAll}
            >
              <ChevronsRight className="h-3 w-3 mr-1" />
              Move all
            </Button>
          </div>
          <div className="space-y-1.5">
            {availableTasks.slice(0, 4).map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="flex items-center gap-2 rounded-lg bg-muted/50 hover:bg-muted px-2.5 py-2 cursor-pointer transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {task.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    {task.timeBucket && !task.startTime && (
                      <span className="capitalize">{task.timeBucket}</span>
                    )}
                    {task.startTime && <span className="font-medium">{task.startTime}</span>}
                    {task.duration && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {task.duration}m
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveTaskToProjectBlock(task.id);
                  }}
                  title="Move to block"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {availableTasks.length > 4 && (
              <p className="text-xs text-muted-foreground/70 text-center py-1">
                +{availableTasks.length - 4} more
              </p>
            )}
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {tasksInBlock.length === 0 && availableTasks.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-3">
          No tasks for this project
        </div>
      )}
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
  isActive,
  projectBlocks,
  allTasks,
}: { 
  bucket: TimeBucket;
  tasks: Task[];
  habits: Habit[];
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: () => void;
  isActive: boolean;
  projectBlocks: Project[];
  allTasks: Task[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const config = bucketConfig[bucket];
  
  // Filter out tasks that are in project blocks (they'll be shown inside the block)
  const tasksNotInBlocks = tasks.filter(t => !projectBlocks.some(p => p.name === t.project && t.inProjectBlock));
  const itemCount = tasksNotInBlocks.length + habits.length + projectBlocks.length;

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
          {/* Tasks not in project blocks */}
          {tasksNotInBlocks.map((task) => (
            <MobileScheduledTask key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
          
          {/* Habits */}
          {habits.map((habit) => (
            <MobileScheduledHabit key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
          ))}
          
          {/* Project blocks */}
          {projectBlocks.map((project) => (
            <MobileProjectBlock
              key={project.id}
              project={project}
              tasks={tasks.filter(t => t.project === project.name)}
              allTasks={allTasks}
              onTaskClick={onTaskClick}
            />
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
  const { tasks, habits, projects, selectedDate, timelineItemFilter, userTimezone, showCompletedTasks } = usePlannerStore();
  const resolvedTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Get items for selected date
  const selectedDateStr = toDateStr(selectedDate, resolvedTimezone);

  // Get recurring projects for the selected date
  const recurringProjectsForDate = useMemo(() => {
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday
    const dateOfMonth = selectedDate.getDate(); // 1-31
    return projects.filter((p) => {
      if (!p.startTime || !p.timeBucket || !p.repeatFrequency) return false;
      
      if (p.repeatFrequency === 'daily') return true;
      if (p.repeatFrequency === 'weekly' && p.repeatDays?.includes(dayOfWeek)) return true;
      if (p.repeatFrequency === 'monthly' && p.repeatMonthDay === dateOfMonth) return true;
      if (p.repeatFrequency === 'custom' && p.repeatDays?.includes(dayOfWeek)) return true;
      
      return false;
    });
  }, [projects, selectedDate]);

  // Get project blocks by bucket
  const projectBlocksByBucket = useMemo(() => {
    const buckets: Record<TimeBucket, Project[]> = {
      anytime: [],
      morning: [],
      afternoon: [],
      evening: [],
    };
    
    recurringProjectsForDate.forEach((project) => {
      if (project.timeBucket) {
        buckets[project.timeBucket].push(project);
      }
    });
    
    return buckets;
  }, [recurringProjectsForDate]);

  const scheduledItems = useMemo(() => {
    const buckets: Record<TimeBucket, { tasks: Task[]; habits: Habit[] }> = {
      anytime: { tasks: [], habits: [] },
      morning: { tasks: [], habits: [] },
      afternoon: { tasks: [], habits: [] },
      evening: { tasks: [], habits: [] },
    };

    // Filter tasks
    const todayDateStr = toDateStr(new Date(), resolvedTimezone);
    if (timelineItemFilter !== 'habits') {
      tasks.forEach((task) => {
        if (!task.timeBucket) return;
        if (!task.startDate) {
          // Unscheduled tasks: only show today
          if (selectedDateStr !== todayDateStr) return;
        } else if (isRecurring(task)) {
          // Recurring tasks: show if recurrence matches AND startDate ≤ selectedDate
          // Use .split('T')[0] to avoid UTC-midnight timezone shift when parsing date-only strings
          const taskStartDateStr = task.startDate.split('T')[0];
          if (!shouldShowOnDate(task, selectedDateStr, resolvedTimezone)) return;
          if (taskStartDateStr > selectedDateStr) return;
          // Exclude if completed on this date and showCompletedTasks is false
          if (!showCompletedTasks && isCompletedOnDate(task, selectedDateStr)) return;
        } else {
          // One-off tasks: exact date match
          // Use .split('T')[0] to avoid UTC-midnight timezone shift when parsing date-only strings
          const taskStartDateStr = task.startDate.split('T')[0];
          if (taskStartDateStr !== selectedDateStr) return;
        }
        buckets[task.timeBucket].tasks.push(task);
      });
    }

    // Filter habits
    if (timelineItemFilter !== 'tasks') {
      habits.forEach((habit) => {
        if (!habit.timeBucket) return;
        if (!shouldShowOnDate(habit, selectedDateStr, resolvedTimezone)) return;
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
  }, [tasks, habits, selectedDateStr, selectedDate, timelineItemFilter, resolvedTimezone, showCompletedTasks]);

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
          {format(selectedDate, 'EEEE, MMMM d')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalItems} {totalItems === 1 ? 'item' : 'items'} scheduled
        </p>
      </div>
      
      {/* Schedule content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 pb-6 space-y-3">
          {(['anytime', 'morning', 'afternoon', 'evening'] as TimeBucket[]).map((bucket) => (
            <TimeBucketSection
              key={bucket}
              bucket={bucket}
              tasks={scheduledItems[bucket].tasks}
              habits={scheduledItems[bucket].habits}
              onTaskClick={onTaskClick}
              onHabitClick={onHabitClick}
              onAddClick={() => onAddClick(bucket, 'task')}
              isActive={!!activeId}
              projectBlocks={projectBlocksByBucket[bucket]}
              allTasks={tasks}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
