'use client';

import { useMemo, useState } from 'react';
import { Filter, ChevronDown, X, Check, Trash2, Clock, Repeat, Plus, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, GroupBy, Priority } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDraggable } from '@dnd-kit/core';

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface MobileTasksPanelProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: () => void;
  onAddHabitClick: () => void;
  onManageCategories: () => void;
}

// Mobile Task Item with long-press drag support
function MobileTaskItem({ task, onClick }: { task: Task; onClick: () => void }) {
  const { toggleTaskStatus, deleteTask, getProjectEmoji } = usePlannerStore();
  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
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
      {...attributes}
      {...listeners}
      className={cn(
        'group relative flex items-start gap-3 p-4 rounded-xl bg-card border border-border/50 active:border-border transition-all touch-none',
        isDragging && 'opacity-50 shadow-lg z-50',
        task.status === 'completed' && 'opacity-60'
      )}
      onClick={onClick}
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
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors relative z-10 mt-0.5',
          task.status === 'completed'
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 active:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="h-3.5 w-3.5 text-primary-foreground" />
        )}
      </button>
      
      <div className="flex-1 min-w-0 relative z-10">
        <p
          className={cn(
            'text-sm font-medium text-foreground leading-tight',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        
        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
          {projectEmoji && task.project && (
            <span className="flex items-center gap-1 leading-none">
              <span className="text-sm">{projectEmoji}</span>
              <span>{task.project}</span>
            </span>
          )}
          {task.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {task.duration}m
            </span>
          )}
          {task.priority && (
            <span className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
              task.priority === 'high' && 'bg-priority-high/15 text-priority-high',
              task.priority === 'medium' && 'bg-priority-medium/15 text-priority-medium',
              task.priority === 'low' && 'bg-priority-low/15 text-priority-low',
            )}>
              {priorityLabels[task.priority]}
            </span>
          )}
          {task.repeatFrequency && task.repeatFrequency !== 'none' && (
            <Repeat className="h-3 w-3" />
          )}
        </div>
      </div>
      
      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          setShowDeleteConfirm(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task.title}&quot;. This action cannot be undone.
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

// Mobile Habit Item
function MobileHabitItem({ habit, onClick }: { habit: Habit; onClick: () => void }) {
  const { deleteHabit, getHabitGroupEmoji, getHabitGroupColor } = usePlannerStore();
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer w-full overflow-hidden relative',
        'border-border/60 active:border-border',
        habit.status === 'done' && 'opacity-70'
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 12%, transparent) 0%, color-mix(in oklch, ${groupColor} 4%, transparent) 100%)`,
      }}
      onClick={onClick}
    >
      {/* Background emoji */}
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-[0.08] select-none pointer-events-none" style={{ lineHeight: 1 }}>
        {groupEmoji}
      </span>

      {/* Status circle */}
      <div className={cn(
        'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors relative z-10 mt-0.5',
        habit.status === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground/40'
      )}>
        {habit.status === 'done' && <Check className="h-3 w-3 text-primary-foreground" />}
      </div>

      <div className="flex-1 min-w-0 relative z-10">
        <p className={cn(
          'text-sm font-medium text-foreground leading-tight',
          habit.status === 'done' && 'line-through text-muted-foreground'
        )}>
          {habit.title}
        </p>

        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
          {habit.group && (
            <span className="flex items-center gap-1 leading-none">
              {groupEmoji && <span className="text-sm">{groupEmoji}</span>}
              <span>{habit.group}</span>
            </span>
          )}
          {habit.timesPerDay && habit.timesPerDay > 1 && (
            <span>{habit.currentDayCount || 0}/{habit.timesPerDay} today</span>
          )}
          {habit.repeatFrequency && habit.repeatFrequency !== 'none' && habit.repeatFrequency !== 'daily' && (
            <Repeat className="h-3 w-3" />
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Habit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{habit.title}&quot; and all its history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteHabit(habit.id); setShowDeleteConfirm(false); }}
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

export function MobileTasksPanel({ onTaskClick, onHabitClick, onAddClick, onAddHabitClick, onManageCategories }: MobileTasksPanelProps) {
  const { tasks, habits, groupBy, setGroupBy, filters, setFilters, clearFilters, projects, getProjectEmoji, getHabitGroupEmoji } = usePlannerStore();
  const [activeTab, setActiveTab] = useState<'tasks' | 'habits'>('tasks');
  const [habitStatusFilter, setHabitStatusFilter] = useState<'all' | 'pending' | 'done' | 'skipped'>('all');
  const [habitGroupBy, setHabitGroupBy] = useState<'group' | 'status' | 'repeat' | 'bucket' | 'none'>('group');

  const hasActiveFilters = Object.keys(filters).length > 0;

  // Filter unscheduled tasks
  const unscheduledTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.isScheduled || task.timeBucket) return false;
      if (filters.project && task.project !== filters.project) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.status && task.status !== filters.status) return false;
      return true;
    });
  }, [tasks, filters]);

  // Group tasks
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    
    unscheduledTasks.forEach((task) => {
      let key = 'All Tasks';
      if (groupBy === 'project') {
        key = task.project || 'No Project';
      } else if (groupBy === 'priority') {
        key = task.priority ? priorityLabels[task.priority] : 'No Priority';
      } else if (groupBy === 'status') {
        key = task.status === 'completed' ? 'Completed' : 'Pending';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return groups;
  }, [unscheduledTasks, groupBy]);

  // Group habits
  const groupedHabits = useMemo(() => {
    const filteredHabits = habits.filter((habit) => {
      if (habitStatusFilter === 'all') return true;
      return habit.status === habitStatusFilter;
    });

    const groups: Record<string, Habit[]> = {};
    
    filteredHabits.forEach((habit) => {
      let key = 'All Habits';
      if (habitGroupBy === 'group') {
        key = habit.group || 'No Group';
      } else if (habitGroupBy === 'status') {
        key = habit.status === 'done' ? 'Done' : habit.status === 'skipped' ? 'Skipped' : 'Pending';
      } else if (habitGroupBy === 'bucket') {
        key = habit.timeBucket ? bucketLabels[habit.timeBucket] : 'Unscheduled';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(habit);
    });
    
    return groups;
  }, [habits, habitStatusFilter, habitGroupBy]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            'flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center',
            activeTab === 'tasks'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground'
          )}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
          <span className="ml-1.5 text-muted-foreground/70 text-xs">({unscheduledTasks.length})</span>
        </button>
        <button
          className={cn(
            'flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center',
            activeTab === 'habits'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground'
          )}
          onClick={() => setActiveTab('habits')}
        >
          Habits
          <span className="ml-1.5 text-muted-foreground/70 text-xs">({habits.length})</span>
        </button>
      </div>

      {/* Tasks pane */}
      {activeTab === 'tasks' && (
        <>
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              {/* Filters */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8 px-3 text-xs', hasActiveFilters && 'border-primary text-primary')}>
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-48 p-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground px-2">Project</p>
                    {projects.map((p) => (
                      <button
                        key={p.name}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent',
                          filters.project === p.name && 'bg-accent'
                        )}
                        onClick={() => setFilters({ ...filters, project: p.name })}
                      >
                        <span>{getProjectEmoji(p.name)}</span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                    Group
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                    <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="project">Project</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onManageCategories}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddClick}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {filters.project && (
                  <Badge variant="secondary" className="text-xs h-6 px-2 gap-1">
                    {filters.project}
                    <button onClick={() => setFilters({ ...filters, project: undefined })} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button
                  className="flex items-center px-2 py-0.5 text-xs text-destructive"
                  onClick={() => clearFilters()}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </button>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
                <div key={groupName}>
                  {groupBy !== 'none' && (
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                      {groupName}
                      <span className="ml-1 text-muted-foreground/60">({groupTasks.length})</span>
                    </h3>
                  )}
                  <div className="space-y-2">
                    {groupTasks.map((task) => (
                      <MobileTaskItem 
                        key={task.id} 
                        task={task} 
                        onClick={() => onTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              
              {unscheduledTasks.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">No unscheduled tasks</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Tap + to add a task</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Habits pane */}
      {activeTab === 'habits' && (
        <>
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8 px-3 text-xs', habitStatusFilter !== 'all' && 'border-primary text-primary')}>
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    {habitStatusFilter === 'all' ? 'Filter' : habitStatusFilter}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={habitStatusFilter} onValueChange={(v) => setHabitStatusFilter(v as typeof habitStatusFilter)}>
                    <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="pending">Pending</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="done">Done</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="skipped">Skipped</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                    Group
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={habitGroupBy} onValueChange={(v) => setHabitGroupBy(v as typeof habitGroupBy)}>
                    <DropdownMenuRadioItem value="group">Group</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="bucket">Time</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onManageCategories}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddHabitClick}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {Object.entries(groupedHabits).map(([groupName, groupHabits]) => (
                <div key={groupName}>
                  {habitGroupBy !== 'none' && (
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                      {groupName}
                      <span className="ml-1 text-muted-foreground/60">({groupHabits.length})</span>
                    </h3>
                  )}
                  <div className="space-y-2">
                    {groupHabits.map((habit) => (
                      <MobileHabitItem key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                    ))}
                  </div>
                </div>
              ))}

              {Object.values(groupedHabits).flat().length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">{habits.length === 0 ? 'No habits yet' : 'No habits match filter'}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Tap + to add a habit</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
