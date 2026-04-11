'use client';

import { useMemo, useState } from 'react';
import { Filter, ChevronDown, X, Check, Trash2, Clock, Repeat, Plus, FolderOpen, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, Habit, GroupBy, Priority, TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDraggable } from '@dnd-kit/core';

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const bucketLabels: Record<TimeBucket, string> = {
  anytime: 'Anytime',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
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
  const { toggleTaskStatus, deleteTask, updateTask, getProjectEmoji } = usePlannerStore();
  const projectEmoji = task.project ? getProjectEmoji(task.project) : null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showScheduleDrawer, setShowScheduleDrawer] = useState(false);
  
  // Local state for scheduling
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(
    task.startDate ? new Date(task.startDate) : new Date()
  );
  const [scheduleTimeBucket, setScheduleTimeBucket] = useState<TimeBucket>(task.timeBucket || 'anytime');
  const [scheduleDuration, setScheduleDuration] = useState(task.duration?.toString() || '30');
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: task.id, disabled: true });

  // DnD is disabled in the mobile To Do tab — there's nowhere to drag to across tabs.
  // Re-enable (set disabled: false) in Phase 2 when within-list reorder is added (issue #89).
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const handleScheduleSave = () => {
    if (!scheduleDate) {
      setShowScheduleDrawer(false);
      return;
    }
    
    const effectiveTimeBucket = scheduleTimeBucket || 'anytime';
    const dateStr = format(scheduleDate, 'yyyy-MM-dd');
    
    updateTask(task.id, {
      startDate: dateStr,
      timeBucket: effectiveTimeBucket,
      duration: parseInt(scheduleDuration, 10),
      isScheduled: true,
    });
    setShowScheduleDrawer(false);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          'group relative flex items-start gap-3 p-4 rounded-xl bg-card/80 backdrop-blur-sm border border-white/10 active:border-white/20 transition-all',
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
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
                task.priority === 'high' && 'bg-priority-high text-white',
                task.priority === 'medium' && 'bg-priority-medium text-black',
                task.priority === 'low' && 'bg-priority-low text-white',
              )}>
                {priorityLabels[task.priority]}
              </span>
            )}
            {task.repeatFrequency && task.repeatFrequency !== 'none' && (
              <Repeat className="h-3 w-3" />
            )}
          </div>
        </div>
        
        {/* Schedule button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            setShowScheduleDrawer(true);
          }}
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>

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
      </div>

      {/* Schedule Drawer */}
      <Drawer open={showScheduleDrawer} onOpenChange={setShowScheduleDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Schedule Task</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal bg-background border-border h-10 pr-8',
                        !scheduleDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{scheduleDate ? format(scheduleDate, 'EEEE, MMM d') : 'Select date'}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduleDate}
                      onSelect={setScheduleDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {scheduleDate && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                    onClick={(e) => { e.stopPropagation(); setScheduleDate(undefined); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Time Bucket */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Time</Label>
              <Select 
                value={scheduleDate ? (scheduleTimeBucket === 'none' ? 'anytime' : scheduleTimeBucket) : ''} 
                onValueChange={(v) => setScheduleTimeBucket(v as TimeBucket)}
                disabled={!scheduleDate}
              >
                <SelectTrigger className={cn(
                  "w-full bg-background border-border h-10",
                  !scheduleDate && "opacity-50"
                )}>
                  <SelectValue placeholder="--" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anytime">Anytime</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <Select value={scheduleDuration} onValueChange={setScheduleDuration}>
                <SelectTrigger className="w-full bg-background border-border h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Save button */}
            <Button onClick={handleScheduleSave} className="w-full h-11 mt-2">
              Save Schedule
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task.title}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id); setShowDeleteConfirm(false); }}
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

// Mobile Habit Item
function MobileHabitItem({ habit, onClick }: { habit: Habit; onClick: () => void }) {
  const { deleteHabit, getHabitGroupEmoji, getHabitGroupColor } = usePlannerStore();
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer w-full overflow-hidden relative',
        'border-white/10 active:border-white/20 bg-card/80 backdrop-blur-sm',
        habit.status === 'done' && 'opacity-70'
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 18%, var(--card)) 0%, color-mix(in oklch, ${groupColor} 6%, var(--card)) 100%)`,
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

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length;
  const hasActiveFilters = activeFilterCount > 0;

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
{hasActiveFilters && (
  <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
  {activeFilterCount}
  </span>
  )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <div className="space-y-3">
                    {/* Project filter - only show if there are projects */}
                    {projects.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground px-2">Project</p>
                        <div className="flex flex-wrap gap-1 px-1">
                          {projects.map((p) => (
                            <button
                              key={p.name}
                              className={cn(
                                'flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors',
                                filters.project === p.name 
                                  ? 'bg-primary text-primary-foreground border-primary' 
                                  : 'border-border hover:bg-accent'
                              )}
                              onClick={() => setFilters({ 
                                ...filters, 
                                project: filters.project === p.name ? undefined : p.name 
                              })}
                            >
                              <span>{getProjectEmoji(p.name)}</span>
                              <span>{p.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Priority filter */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-2">Priority</p>
                      <div className="flex flex-wrap gap-1 px-1">
                        {(['high', 'medium', 'low'] as const).map((priority) => (
                          <button
                            key={priority}
                            className={cn(
                              'px-2 py-1 text-xs rounded-md border transition-colors',
                              filters.priority === priority 
                                ? 'bg-primary text-primary-foreground border-primary' 
                                : 'border-border hover:bg-accent'
                            )}
                            onClick={() => setFilters({ 
                              ...filters, 
                              priority: filters.priority === priority ? undefined : priority 
                            })}
                          >
                            {priorityLabels[priority]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status filter */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-2">Status</p>
                      <div className="flex flex-wrap gap-1 px-1">
                        {(['pending', 'completed'] as const).map((status) => (
                          <button
                            key={status}
                            className={cn(
                              'px-2 py-1 text-xs rounded-md border transition-colors capitalize',
                              filters.status === status 
                                ? 'bg-primary text-primary-foreground border-primary' 
                                : 'border-border hover:bg-accent'
                            )}
                            onClick={() => setFilters({ 
                              ...filters, 
                              status: filters.status === status ? undefined : status 
                            })}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clear filters */}
                    {hasActiveFilters && (
                      <>
                        <div className="h-px bg-border" />
                        <button
                          className="w-full flex items-center justify-center px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md"
                          onClick={() => clearFilters()}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear all filters
                        </button>
                      </>
                    )}
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
                    {getProjectEmoji(filters.project)} {filters.project}
                    <button onClick={() => setFilters({ ...filters, project: undefined })} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.priority && (
                  <Badge variant="secondary" className="text-xs h-6 px-2 gap-1">
                    {priorityLabels[filters.priority]}
                    <button onClick={() => setFilters({ ...filters, priority: undefined })} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.status && (
                  <Badge variant="secondary" className="text-xs h-6 px-2 gap-1 capitalize">
                    {filters.status}
                    <button onClick={() => setFilters({ ...filters, status: undefined })} className="hover:text-destructive">
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

          <ScrollArea className="flex-1 min-h-0">
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
                <div className="text-center py-14 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground font-medium">What do you want to do today?</p>
                  <button
                    onClick={onAddClick}
                    className="text-xs text-primary hover:underline underline-offset-2"
                  >
                    + Add Task
                  </button>
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

          <ScrollArea className="flex-1 min-h-0">
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
                <div className="text-center py-14 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground font-medium">
                    {habits.length === 0 ? 'Build a streak — add your first habit' : 'No habits match filter'}
                  </p>
                  {habits.length === 0 ? (
                    <button
                      onClick={onAddHabitClick}
                      className="text-xs text-primary hover:underline underline-offset-2"
                    >
                      + Add Habit
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">Try changing or clearing the filter</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
