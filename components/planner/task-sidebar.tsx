'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { GripVertical, Filter, ChevronDown, X, Check, Trash2, ChevronRight, Plus, FolderOpen, Clock, Repeat } from 'lucide-react';
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
import { REPEAT_FREQUENCY_LABELS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// ─── Task Item ────────────────────────────────────────────────────────────────

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
        'group relative flex items-start gap-2 p-3 rounded-xl bg-card border border-border/50 hover:border-border transition-all cursor-pointer w-full overflow-hidden',
        isDragging && 'opacity-50 shadow-lg z-50',
        task.status === 'completed' && 'opacity-60'
      )}
      onClick={onClick}
      onMouseEnter={() => setHoveredItem(task.id, 'task')}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      {/* Large background emoji */}
      {projectEmoji && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-5xl opacity-[0.08] select-none pointer-events-none"
          style={{ lineHeight: 1 }}
        >
          {projectEmoji}
        </span>
      )}

      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none relative z-10"
        onClick={(e) => e.stopPropagation()}
        suppressHydrationWarning
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleTaskStatus(task.id);
        }}
        className={cn(
          'mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors relative z-10',
          task.status === 'completed'
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {task.status === 'completed' && (
          <Check className="h-3 w-3 text-primary-foreground" />
        )}
      </button>
      
      <div className="flex-1 min-w-0 relative z-10">
        <p
          className={cn(
            'text-sm font-medium text-foreground leading-tight line-clamp-2',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
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
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity mt-0.5 flex-shrink-0 relative z-10"
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
              This will permanently delete "{task.title}". This action cannot be undone.
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

// ─── Habit Item ───────────────────────────────────────────────────────────────

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
        'group flex items-start gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer w-full overflow-hidden relative',
        'border-border/60 hover:border-border',
        habit.status === 'done' && 'opacity-70'
      )}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${groupColor} 12%, transparent) 0%, color-mix(in oklch, ${groupColor} 4%, transparent) 100%)`,
      }}
      onClick={onClick}
      onMouseEnter={() => setHoveredItem(habit.id, 'habit')}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      {/* Background emoji */}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl opacity-[0.08] select-none pointer-events-none" style={{ lineHeight: 1 }}>
        {groupEmoji}
      </span>

      {/* Status circle */}
      <div className={cn(
        'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors relative z-10',
        habit.status === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground/40'
      )}>
        {habit.status === 'done' && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
      </div>

      <div className="flex-1 min-w-0 relative z-10">
        <p className={cn(
          'text-sm text-foreground leading-tight',
          habit.status === 'done' && 'line-through text-muted-foreground'
        )}>
          {habit.title}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
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
              This will permanently delete "{habit.title}" and all its history. This action cannot be undone.
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

// ─── Filter Button ────────────────────────────────────────────────────────────

function FilterButton() {
  const { filters, setFilters, clearFilters, projects, getProjectEmoji } = usePlannerStore();
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const hasActiveFilters = Object.keys(filters).length > 0;

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
            'h-7 px-2 text-xs',
            hasActiveFilters && 'border-primary text-primary'
          )}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filter
          {hasActiveFilters && (
            <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {Object.keys(filters).length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">Filter by</div>
        
        <Popover open={activeSubmenu === 'project'}>
          <PopoverTrigger asChild>
            <button 
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
              onMouseEnter={() => handleMouseEnter('project')}
              onMouseLeave={handleMouseLeave}
            >
              <span>Project</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="right" align="start" className="w-36 p-1" sideOffset={0}
            onMouseEnter={() => handleMouseEnter('project')}
            onMouseLeave={handleMouseLeave}
          >
            {projects.map((project) => (
              <button key={project.name} className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectProject(project.name)}>
                {project.emoji} {project.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover open={activeSubmenu === 'priority'}>
          <PopoverTrigger asChild>
            <button 
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
              onMouseEnter={() => handleMouseEnter('priority')}
              onMouseLeave={handleMouseLeave}
            >
              <span>Priority</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="right" align="start" className="w-28 p-1" sideOffset={0}
            onMouseEnter={() => handleMouseEnter('priority')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('high')}>High</button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('medium')}>Medium</button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('low')}>Low</button>
          </PopoverContent>
        </Popover>

        <Popover open={activeSubmenu === 'status'}>
          <PopoverTrigger asChild>
            <button 
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
              onMouseEnter={() => handleMouseEnter('status')}
              onMouseLeave={handleMouseLeave}
            >
              <span>Status</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="right" align="start" className="w-28 p-1" sideOffset={0}
            onMouseEnter={() => handleMouseEnter('status')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectStatus('pending')}>Pending</button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectStatus('completed')}>Completed</button>
          </PopoverContent>
        </Popover>
        
        {hasActiveFilters && (
          <>
            <div className="h-px bg-border my-1" />
            <button
              className="w-full flex items-center px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm"
              onClick={() => { clearFilters(); setFilterOpen(false); }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Sidebar ────────────────��────────────────────────────────────────────

interface TaskSidebarProps {
  onTaskClick: (task: Task) => void;
  onHabitClick: (habit: Habit) => void;
  onAddClick: () => void;
  onAddHabitClick: () => void;
  onManageCategories: () => void;
}

export function TaskSidebar({ onTaskClick, onHabitClick, onAddClick, onAddHabitClick, onManageCategories }: TaskSidebarProps) {
  const { tasks, habits, habitGroups, groupBy, setGroupBy, filters, setFilters, clearFilters, chillMode, timelineItemFilter } = usePlannerStore();
  const [activeTab, setActiveTab] = useState<'tasks' | 'habits'>('tasks');
  const [isHovered, setIsHovered] = useState(false);
  const showControls = !chillMode || isHovered;

  // Auto-switch tab when filter changes to show only available items
  useEffect(() => {
    if (timelineItemFilter === 'tasks') {
      setActiveTab('tasks');
    } else if (timelineItemFilter === 'habits') {
      setActiveTab('habits');
    }
  }, [timelineItemFilter]);

  // Droppable for sidebar (to unschedule tasks)
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: 'sidebar',
  });

  // Filter unscheduled tasks
  const unscheduledTasks = tasks.filter((task) => {
    if (task.isScheduled) return false;
    
    // Apply filters
    if (filters.status.length > 0 && !filters.status.includes(task.status)) return false;
    if (filters.priority.length > 0 && task.priority && !filters.priority.includes(task.priority)) return false;
    if (filters.projects.length > 0 && task.project && !filters.projects.includes(task.project)) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!task.title.toLowerCase().includes(searchLower) && 
          !task.description?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });

  // Group tasks by selected grouping
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
          key = task.status.charAt(0).toUpperCase() + task.status.slice(1);
          break;
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return groups;
  }, [unscheduledTasks, groupBy]);

  // Group habits by habit group
  const habitsByGroup = useMemo(() => {
    const groups: Record<string, typeof habits> = {};
    
    habits.forEach((habit) => {
      const key = habit.group || 'Ungrouped';
      if (!groups[key]) groups[key] = [];
      groups[key].push(habit);
    });
    
    return groups;
  }, [habits]);

  return (
    <aside 
      ref={setDroppableRef}
      className={cn(
        'w-80 border-r border-border bg-sidebar flex flex-col h-full transition-colors',
        isOver && 'bg-primary/5 border-primary'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tab switcher */}
      <div className="flex border-b border-border">
        {timelineItemFilter !== 'habits' && (
          <button
            className={cn(
              'flex-1 py-3 text-base font-medium transition-colors',
              activeTab === 'tasks'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
            <span className="ml-1.5 text-muted-foreground/70 text-xs">({unscheduledTasks.length})</span>
          </button>
        )}
        {timelineItemFilter !== 'tasks' && (
          <button
            className={cn(
              'flex-1 py-3 text-base font-medium transition-colors',
              activeTab === 'habits'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('habits')}
          >
            Habits
            <span className="ml-1.5 text-muted-foreground/70 text-xs">({habits.length})</span>
          </button>
        )}
      </div>

      {/* Tasks pane */}
      {activeTab === 'tasks' && (
        <>
          <div className={cn('p-4 border-b border-border transition-opacity', !showControls && 'opacity-0 h-0 p-0 overflow-hidden')}>
            <div className="flex items-center gap-2">
              <FilterButton />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                    Group
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                    <DropdownMenuRadioItem value="none" className="text-xs">None</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="project" className="text-xs">Project</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="priority" className="text-xs">Priority</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status" className="text-xs">Status</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManageCategories} title="Manage Projects & Groups">
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddClick} title="Add task">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {filters.project && (
                  <Badge variant="secondary" className="text-xs h-5 px-2 gap-1">
                    {filters.project}
                    <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, project: undefined }); }} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.priority && (
                  <Badge variant="secondary" className="text-xs h-5 px-2 gap-1 capitalize">
                    {filters.priority}
                    <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, priority: undefined }); }} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.status && (
                  <Badge variant="secondary" className="text-xs h-5 px-2 gap-1 capitalize">
                    {filters.status}
                    <button onClick={(e) => { e.stopPropagation(); setFilters({ ...filters, status: undefined }); }} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <button
                  className="flex items-center px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm"
                  onClick={() => clearFilters()}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all
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
                      <TaskItem key={task.id} task={task} onClick={() => onTaskClick(task)} />
                    ))}
                  </div>
                </div>
              ))}
              
              {unscheduledTasks.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No tasks yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Add a task using the + button above</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Habits pane */}
      {activeTab === 'habits' && (
        <>
          <div className={cn('p-4 border-b border-border space-y-3 transition-opacity', !showControls && 'opacity-0 h-0 p-0 overflow-hidden')}>
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-7 px-2 text-xs', habitStatusFilter !== 'all' && 'border-primary text-primary')}>
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    {habitStatusFilter === 'all' ? 'Filter' : habitStatusFilter.charAt(0).toUpperCase() + habitStatusFilter.slice(1)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={habitStatusFilter} onValueChange={(v) => setHabitStatusFilter(v as typeof habitStatusFilter)}>
                    <DropdownMenuRadioItem value="all" className="text-xs">All statuses</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="pending" className="text-xs">Pending</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="done" className="text-xs">Done</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="skipped" className="text-xs">Skipped</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Group by */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                    Group
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup value={habitGroupBy} onValueChange={(v) => setHabitGroupBy(v as typeof habitGroupBy)}>
                    <DropdownMenuRadioItem value="group" className="text-xs">Group</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status" className="text-xs">Status</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="repeat" className="text-xs">Repetition</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="bucket" className="text-xs">Time bucket</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none" className="text-xs">None</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManageCategories} title="Manage Groups">
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddHabitClick} title="Add habit">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Active filter badge */}
            {habitStatusFilter !== 'all' && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs h-5 px-2 gap-1 capitalize">
                  {habitStatusFilter}
                  <button onClick={(e) => { e.stopPropagation(); setHabitStatusFilter('all'); }} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
                <button
                  className="flex items-center px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm"
                  onClick={() => setHabitStatusFilter('all')}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all
                </button>
              </div>
            )}
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
                      <HabitItem key={habit.id} habit={habit} onClick={() => onHabitClick(habit)} />
                    ))}
                  </div>
                </div>
              ))}

              {filteredHabits.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">{habits.length === 0 ? 'No habits yet' : 'No habits match the filter'}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{habits.length === 0 ? 'Add a habit using the + button above' : 'Try changing or clearing the filter'}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
