'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { GripVertical, Filter, ChevronDown, X, Check, Trash2, ChevronRight, Plus, FolderOpen } from 'lucide-react';
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
import type { Task, GroupBy, Priority } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const priorityDots: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

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
        'group flex items-start gap-2 p-3 rounded-lg bg-card border border-border/50 hover:border-border transition-all cursor-pointer w-full',
        isDragging && 'opacity-50 shadow-lg z-50',
        task.status === 'completed' && 'opacity-60'
      )}
      onClick={onClick}
      onMouseEnter={() => setHoveredItem(task.id, 'task')}
      onMouseLeave={() => setHoveredItem(null, null)}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
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
        <p
          className={cn(
            'text-sm text-foreground leading-tight',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.priority && (
            <span className={cn('flex items-center gap-1')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', priorityDots[task.priority])} />
              <span className="text-xs text-muted-foreground capitalize">{task.priority}</span>
            </span>
          )}
          {task.project && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              {projectEmoji && <span>{projectEmoji}</span>}
              {task.project}
            </span>
          )}
          {task.duration && (
            <span className="text-xs text-muted-foreground">
              {task.duration}m
            </span>
          )}
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
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

// Filter popover with nested popovers for submenus
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
    // Clear any pending close timeout immediately
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

  // Clean up timeout on unmount
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
        
        {/* Project submenu */}
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
            side="right" 
            align="start" 
            className="w-36 p-1" 
            sideOffset={0}
            onMouseEnter={() => handleMouseEnter('project')}
            onMouseLeave={handleMouseLeave}
          >
            {projects.map((project) => (
              <button
                key={project.name}
                className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm"
                onClick={() => handleSelectProject(project.name)}
              >
                {project.emoji} {project.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Priority submenu */}
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
            side="right" 
            align="start" 
            className="w-28 p-1" 
            sideOffset={0}
            onMouseEnter={() => handleMouseEnter('priority')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('high')}>
              High
            </button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('medium')}>
              Medium
            </button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectPriority('low')}>
              Low
            </button>
          </PopoverContent>
        </Popover>

        {/* Status submenu */}
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
            side="right" 
            align="start" 
            className="w-28 p-1" 
            sideOffset={0}
            onMouseEnter={() => handleMouseEnter('status')}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectStatus('pending')}>
              Pending
            </button>
            <button className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent rounded-sm" onClick={() => handleSelectStatus('completed')}>
              Completed
            </button>
          </PopoverContent>
        </Popover>
        
        {hasActiveFilters && (
          <>
            <div className="h-px bg-border my-1" />
            <button
              className="w-full flex items-center px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm"
              onClick={() => {
                clearFilters();
                setFilterOpen(false);
              }}
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

interface TaskSidebarProps {
  onTaskClick: (task: Task) => void;
  onAddClick: () => void;
  onManageCategories: () => void;
}

export function TaskSidebar({ onTaskClick, onAddClick, onManageCategories }: TaskSidebarProps) {
  const { tasks, groupBy, setGroupBy, filters, setFilters } = usePlannerStore();
  
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: 'sidebar',
  });

  // Filter unscheduled tasks
  const unscheduledTasks = useMemo(() => {
    return tasks
      .filter((task) => !task.isScheduled)
      .filter((task) => {
        if (filters.project && task.project !== filters.project) return false;
        if (filters.priority && task.priority !== filters.priority) return false;
        if (filters.status && task.status !== filters.status) return false;
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [tasks, filters]);

  // Group tasks
  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return { 'All Tasks': unscheduledTasks };
    
    const groups: Record<string, Task[]> = {};
    
    unscheduledTasks.forEach((task) => {
      let key: string;
      
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
        default:
          key = 'All Tasks';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return groups;
  }, [unscheduledTasks, groupBy]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <aside 
      ref={setDroppableRef}
      className={cn(
        'w-80 border-r border-border bg-sidebar flex flex-col h-full transition-colors',
        isOver && 'bg-primary/5 border-primary'
      )}
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Tasks</h2>
          <span className="text-xs text-muted-foreground">
            {unscheduledTasks.length} unscheduled
          </span>
        </div>
        
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onManageCategories}
              title="Manage Projects & Groups"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onAddClick}
              title="Add task"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {filters.project && (
              <Badge variant="secondary" className="text-xs h-5 px-2 gap-1">
                {filters.project}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => setFilters({ ...filters, project: undefined })}
                />
              </Badge>
            )}
            {filters.priority && (
              <Badge variant="secondary" className="text-xs h-5 px-2 gap-1 capitalize">
                {filters.priority}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => setFilters({ ...filters, priority: undefined })}
                />
              </Badge>
            )}
            {filters.status && (
              <Badge variant="secondary" className="text-xs h-5 px-2 gap-1 capitalize">
                {filters.status}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => setFilters({ ...filters, status: undefined })}
                />
              </Badge>
            )}
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
              <p className="text-xs text-muted-foreground/70 mt-1">
                Add a task using the + button above
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
