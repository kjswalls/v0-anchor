'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { GripVertical, Filter, ChevronDown, X, Check, Trash2, ChevronRight, Plus, FolderOpen, Clock, Repeat, PanelLeftClose, PanelLeft, Inbox, Flag, Layers } from 'lucide-react';
import { useSidebarStore } from '@/lib/sidebar-store';
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
import { useDraggable, useDroppable } from '@dnd-kit/core';


const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const priorityColors: Record<Priority, string> = {
  high: 'bg-priority-high/10 text-priority-high border-priority-high/20',
  medium: 'bg-priority-medium/10 text-priority-medium border-priority-medium/20',
  low: 'bg-priority-low/10 text-priority-low border-priority-low/20',
};

// Task Item
interface TaskItemProps {
  task: Task;
  onClick: () => void;
}

function TaskItem({ task, onClick }: TaskItemProps) {
  const { toggleTaskStatus, deleteTask, getProjectEmoji, setHoveredItem } = usePlannerStore();
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
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-lg bg-card border border-border shadow-sm hover:shadow-md transition-all cursor-pointer w-full overflow-hidden',
        isDragging && 'opacity-50 shadow-lg z-50',
        task.status === 'completed' && 'opacity-60'
      )}
      onClick={onClick}
      onMouseEnter={() => setHoveredItem(task.id, 'task')}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none relative z-10 flex-shrink-0 mt-0.5"
        onClick={(e) => e.stopPropagation()}
        suppressHydrationWarning
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </button>
      
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all relative z-10 mt-0.5',
          task.status === 'completed'
            ? 'bg-primary border-primary'
            : 'border-border hover:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="h-3 w-3 text-primary-foreground" />
        )}
      </button>
      
      {/* Content */}
      <div className="flex-1 min-w-0 relative z-10">
        <p
          className={cn(
            'text-sm font-medium text-foreground leading-snug',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        
        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
          {projectEmoji && task.project && (
            <span className="flex items-center gap-1 leading-none px-1.5 py-0.5 rounded bg-secondary">
              <span className="text-sm">{projectEmoji}</span>
              <span className="font-medium">{task.project}</span>
            </span>
          )}
          {task.duration && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary">
              <Clock className="h-3 w-3" />
              {task.duration}m
            </span>
          )}
          {task.priority && (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border',
              priorityColors[task.priority]
            )}>
              {priorityLabels[task.priority]}
            </span>
          )}
          {task.repeatFrequency && task.repeatFrequency !== 'none' && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary">
              <Repeat className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
      
      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0 relative z-10"
        onClick={(e) => {
          e.stopPropagation();
          setShowDeleteConfirm(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
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
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id); setShowDeleteConfirm(false); }}
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

// Habit Item
interface HabitItemProps {
  habit: Habit;
  onClick: () => void;
}

function HabitItem({ habit, onClick }: HabitItemProps) {
  const { deleteHabit, getHabitGroupEmoji, getHabitGroupColor, setHoveredItem } = usePlannerStore();
  const groupEmoji = getHabitGroupEmoji(habit.group);
  const groupColor = getHabitGroupColor(habit.group);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3 rounded-lg border-2 bg-card shadow-sm hover:shadow-md transition-all cursor-pointer w-full overflow-hidden relative',
        'border-border hover:border-border',
        habit.status === 'done' && 'opacity-70'
      )}
      onClick={onClick}
      onMouseEnter={() => setHoveredItem(habit.id, 'habit')}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      {/* Colored left accent */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: groupColor }}
      />

      {/* Spacer for drag handle alignment */}
      <div className="w-4 flex-shrink-0" />

      {/* Status circle */}
      <div className={cn(
        'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors relative z-10 mt-0.5',
        habit.status === 'done' ? 'bg-primary border-primary' : 'border-border'
      )}>
        {habit.status === 'done' && <Check className="h-3 w-3 text-primary-foreground" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 relative z-10">
        <p className={cn(
          'text-sm font-medium text-foreground leading-snug',
          habit.status === 'done' && 'line-through text-muted-foreground'
        )}>
          {habit.title}
        </p>

        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
          {habit.group && (
            <span className="flex items-center gap-1 leading-none px-1.5 py-0.5 rounded bg-secondary">
              {groupEmoji && <span className="text-sm">{groupEmoji}</span>}
              <span className="font-medium">{habit.group}</span>
            </span>
          )}
          {habit.timesPerDay && habit.timesPerDay > 1 && (
            <span className="px-1.5 py-0.5 rounded bg-secondary font-medium">
              {habit.currentDayCount || 0}/{habit.timesPerDay}
            </span>
          )}
          {habit.repeatFrequency && habit.repeatFrequency !== 'none' && habit.repeatFrequency !== 'daily' && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary">
              <Repeat className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity relative z-10"
        onClick={(e) => {
          e.stopPropagation();
          setShowDeleteConfirm(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

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
              onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); setShowDeleteConfirm(false); }}
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

// Filter Button
function FilterButton() {
  const { filters, setFilters, clearFilters, projects, getProjectEmoji } = usePlannerStore();
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length;
  const hasActiveFilters = activeFilterCount > 0;

  const handleSelectProject = (project: string) => {
    setFilters({ ...filters, project });
    setActiveSubmenu(null);
    setFilterOpen(false);
  };

  const handleSelectPriority = (priority: Priority) => {
    setFilters({ ...filters, priority });
    setActiveSubmenu(null);
    setFilterOpen(false);
  };

  const handleSelectStatus = (status: 'pending' | 'completed') => {
    setFilters({ ...filters, status });
    setActiveSubmenu(null);
    setFilterOpen(false);
  };

  const handleMouseEnter = (submenu: string) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setActiveSubmenu(submenu);
  };

  const handleMouseLeave = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Popover open={filterOpen} onOpenChange={setFilterOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 px-3 text-xs font-medium',
            hasActiveFilters && 'border-primary text-primary'
          )}
        >
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Filter
          {hasActiveFilters && (
            <span className="ml-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">Filter by</div>
        
        {projects.length > 0 && (
          <Popover open={activeSubmenu === 'project'}>
            <PopoverTrigger asChild>
              <button 
                className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                onMouseEnter={() => handleMouseEnter('project')}
                onMouseLeave={handleMouseLeave}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Project</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              side="right" align="start" className="w-40 p-1.5" sideOffset={0}
              onMouseEnter={() => handleMouseEnter('project')}
              onMouseLeave={handleMouseLeave}
            >
              {projects.map((project) => (
                <button 
                  key={project.name} 
                  className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors flex items-center gap-2" 
                  onClick={() => handleSelectProject(project.name)}
                >
                  <span>{project.emoji}</span>
                  <span>{project.name}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        <Popover open={activeSubmenu === 'priority'}>
          <PopoverTrigger asChild>
            <button 
              className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
              onMouseEnter={() => handleMouseEnter('priority')}
              onMouseLeave={handleMouseLeave}
            >
              <div className="flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Priority</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="right" align="start" className="w-32 p-1.5" sideOffset={0}
            onMouseEnter={() => handleMouseEnter('priority')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors" onClick={() => handleSelectPriority('high')}>High</button>
            <button className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors" onClick={() => handleSelectPriority('medium')}>Medium</button>
            <button className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors" onClick={() => handleSelectPriority('low')}>Low</button>
          </PopoverContent>
        </Popover>

        <Popover open={activeSubmenu === 'status'}>
          <PopoverTrigger asChild>
            <button 
              className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
              onMouseEnter={() => handleMouseEnter('status')}
              onMouseLeave={handleMouseLeave}
            >
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Status</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="right" align="start" className="w-32 p-1.5" sideOffset={0}
            onMouseEnter={() => handleMouseEnter('status')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors" onClick={() => handleSelectStatus('pending')}>Pending</button>
            <button className="w-full px-2 py-2 text-sm text-left hover:bg-accent rounded-md transition-colors" onClick={() => handleSelectStatus('completed')}>Completed</button>
          </PopoverContent>
        </Popover>
        
        {hasActiveFilters && (
          <>
            <div className="h-px bg-border my-1.5" />
            <button
              className="w-full flex items-center px-2 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              onClick={() => { clearFilters(); setFilterOpen(false); }}
            >
              <X className="h-3.5 w-3.5 mr-2" />
              Clear filters
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Main Sidebar
interface TaskSidebarProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: () => void;
  onAddHabitClick: () => void;
  onManageCategories: () => void;
}

export function TaskSidebar({ onTaskClick, onHabitClick, onAddClick, onAddHabitClick, onManageCategories }: TaskSidebarProps) {
  const { tasks, habits, habitGroups, groupBy, setGroupBy, filters, setFilters, clearFilters, chillMode, timelineItemFilter } = usePlannerStore();
  const { leftSidebarOpen, leftSidebarHovered, leftSidebarHoverEnabled, toggleLeftSidebar, setLeftSidebarHovered } = useSidebarStore();
  const isVisible = leftSidebarOpen || (leftSidebarHoverEnabled && leftSidebarHovered);
  const [activeTab, setActiveTab] = useState<'tasks' | 'habits'>('tasks');
  const [isHovered, setIsHovered] = useState(false);
  const [habitStatusFilter, setHabitStatusFilter] = useState<'all' | 'done' | 'pending' | 'skipped'>('all');
  const [habitGroupBy, setHabitGroupBy] = useState<'none' | 'group'>('group');
  const showControls = !chillMode || isHovered;

  useEffect(() => {
    if (timelineItemFilter === 'tasks') {
      setActiveTab('tasks');
    } else if (timelineItemFilter === 'habits') {
      setActiveTab('habits');
    }
  }, [timelineItemFilter]);

  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: 'sidebar',
  });

  const hasActiveFilters = !!(filters.status || filters.priority || filters.project);

  const unscheduledTasks = tasks.filter((task) => {
    if (task.isScheduled) return false;
    if (task.timeBucket) return false;
    
    if (filters.status && filters.status !== task.status) return false;
    if (filters.priority && filters.priority !== task.priority) return false;
    if (filters.project && filters.project !== task.project) return false;
    
    return true;
  });

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return { 'All Tasks': unscheduledTasks };
    
    const groups: Record<string, typeof unscheduledTasks> = {};
    
    unscheduledTasks.forEach((task) => {
      let key = '';
      switch (groupBy) {
        case 'project':
          key = task.project || 'No Project';
          break;
        case 'priority':
          key = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'No Priority';
          break;
        case 'status':
          key = task.status ? task.status.charAt(0).toUpperCase() + task.status.slice(1) : 'No Status';
          break;
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return groups;
  }, [unscheduledTasks, groupBy]);

  const groupedHabits = useMemo(() => {
    const filteredHabits = habitStatusFilter === 'all' 
      ? habits 
      : habits.filter((h) => h.status === habitStatusFilter);
    
    if (habitGroupBy === 'none') {
      return { 'All Habits': filteredHabits };
    }
    
    const groups: Record<string, typeof habits> = {};
    filteredHabits.forEach((habit) => {
      const key = habit.group || 'Ungrouped';
      if (!groups[key]) groups[key] = [];
      groups[key].push(habit);
    });
    
    return groups;
  }, [habits, habitStatusFilter, habitGroupBy]);

  return (
    <div 
      data-tour="left-sidebar"
      className="relative flex h-full"
      onMouseLeave={() => leftSidebarHovered && setLeftSidebarHovered(false)}
    >
      <aside 
        ref={setDroppableRef}
        className={cn(
          'border-r border-border bg-sidebar flex flex-col h-full overflow-hidden transition-all duration-300',
          isVisible ? 'w-80' : 'w-0 border-r-0',
          leftSidebarHovered && !leftSidebarOpen && 'shadow-2xl z-20 absolute left-0 top-0 bottom-0',
          isOver && 'bg-primary/5 border-primary'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header with title */}
        <div className={cn('px-5 pt-5 pb-3', !isVisible && 'hidden')}>
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Unscheduled tasks and habits</p>
        </div>

        {/* Tab switcher */}
        <div className={cn('flex border-b border-border mx-5', !isVisible && 'hidden')}>
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
              activeTab === 'tasks'
                ? 'text-foreground border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              {unscheduledTasks.length}
            </Badge>
          </button>
          <button
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
              activeTab === 'habits'
                ? 'text-foreground border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('habits')}
          >
            Habits
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              {habits.length}
            </Badge>
          </button>
        </div>

        {/* Tasks pane */}
        {isVisible && activeTab === 'tasks' && (
          <>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className={cn('flex items-center gap-2 transition-opacity', !showControls && 'opacity-0 pointer-events-none')}>
                  <FilterButton />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium">
                        <Layers className="h-3.5 w-3.5 mr-1.5" />
                        Group
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                        <DropdownMenuRadioItem value="none" className="text-sm">None</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="project" className="text-sm">Project</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="priority" className="text-sm">Priority</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="status" className="text-sm">Status</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onManageCategories} title="Manage Projects & Groups">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button variant="default" size="sm" className="h-8 px-3" onClick={onAddClick} title="Add task">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
              
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {filters.project && (
                    <Badge variant="secondary" className="text-xs h-6 px-2 gap-1.5 font-medium">
                      {filters.project}
                      <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, project: undefined }); }} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.priority && (
                    <Badge variant="secondary" className="text-xs h-6 px-2 gap-1.5 capitalize font-medium">
                      {filters.priority}
                      <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, priority: undefined }); }} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.status && (
                    <Badge variant="secondary" className="text-xs h-6 px-2 gap-1.5 capitalize font-medium">
                      {filters.status}
                      <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, status: undefined }); }} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  <button
                    className="flex items-center px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-md font-medium"
                    onClick={() => clearFilters()}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear all
                  </button>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-5">
                {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
                  <div key={groupName}>
                    {groupBy !== 'none' && (
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
                        {groupName}
                        <span className="ml-1.5 text-muted-foreground/60">({groupTasks.length})</span>
                      </h3>
                    )}
                    <div className="space-y-2">
                      {groupTasks.map((task) => (
                        <TaskItem key={task.id} task={task} onClick={() => onTaskClick(task)} />
                      ))}
                    </div>
                  </div>
                ))}
                
                {unscheduledTasks.length === 0 && (
                  <div className="text-center py-12 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <Inbox className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No unscheduled tasks</p>
                      <p className="text-xs text-muted-foreground mt-1">Add a task to get started</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onAddClick}
                      className="mt-2"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Task
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {/* Habits pane */}
        {isVisible && activeTab === 'habits' && (
          <>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className={cn('flex items-center gap-2 transition-opacity', !showControls && 'opacity-0 pointer-events-none')}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('h-8 px-3 text-xs font-medium', habitStatusFilter !== 'all' && 'border-primary text-primary')}>
                        <Filter className="h-3.5 w-3.5 mr-1.5" />
                        {habitStatusFilter === 'all' ? 'Filter' : habitStatusFilter.charAt(0).toUpperCase() + habitStatusFilter.slice(1)}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={habitStatusFilter} onValueChange={(v) => setHabitStatusFilter(v as typeof habitStatusFilter)}>
                        <DropdownMenuRadioItem value="all" className="text-sm">All statuses</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="pending" className="text-sm">Pending</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="done" className="text-sm">Done</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="skipped" className="text-sm">Skipped</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium">
                        <Layers className="h-3.5 w-3.5 mr-1.5" />
                        Group
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={habitGroupBy} onValueChange={(v) => setHabitGroupBy(v as typeof habitGroupBy)}>
                        <DropdownMenuRadioItem value="group" className="text-sm">Group</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="none" className="text-sm">None</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onManageCategories} title="Manage Groups">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button variant="default" size="sm" className="h-8 px-3" onClick={onAddHabitClick} title="Add habit">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              {habitStatusFilter !== 'all' && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge variant="secondary" className="text-xs h-6 px-2 gap-1.5 capitalize font-medium">
                    {habitStatusFilter}
                    <button onClick={(e) => { e.stopPropagation(); setHabitStatusFilter('all'); }} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                  <button
                    className="flex items-center px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-md font-medium"
                    onClick={() => setHabitStatusFilter('all')}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear all
                  </button>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-5">
                {Object.entries(groupedHabits).map(([groupName, groupHabits]) => (
                  <div key={groupName}>
                    {habitGroupBy !== 'none' && (
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
                        {groupName}
                        <span className="ml-1.5 text-muted-foreground/60">({groupHabits.length})</span>
                      </h3>
                    )}
                    <div className="space-y-2">
                      {groupHabits.map((habit) => (
                        <HabitItem key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                      ))}
                    </div>
                  </div>
                ))}

                {Object.values(groupedHabits).flat().length === 0 && (
                  <div className="text-center py-12 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <Repeat className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {habits.length === 0 ? 'No habits yet' : 'No habits match the filter'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {habits.length === 0 ? 'Build a streak by adding your first habit' : 'Try changing or clearing the filter'}
                      </p>
                    </div>
                    {habits.length === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onAddHabitClick}
                        className="mt-2"
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Habit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </aside>

      {/* Toggle button */}
      <button
        onClick={toggleLeftSidebar}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-30',
          'flex items-center justify-center',
          'w-6 h-12 rounded-r-lg',
          'border border-l-0 border-border',
          'bg-card text-muted-foreground shadow-md',
          'hover:bg-accent hover:text-foreground transition-colors duration-200',
        )}
        style={{ left: isVisible ? 'calc(20rem - 1px)' : '-1px' }}
        title={leftSidebarOpen ? 'Collapse sidebar (Cmd+[)' : 'Expand sidebar (Cmd+[)'}
      >
        {leftSidebarOpen ? (
          <PanelLeftClose className="h-3.5 w-3.5" />
        ) : (
          <PanelLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
