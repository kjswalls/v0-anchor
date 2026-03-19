'use client';

import { useMemo } from 'react';
import { GripVertical, Filter, ChevronDown, X, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlannerStore } from '@/lib/planner-store';
import type { Task, GroupBy, Priority } from '@/lib/planner-types';
import { cn } from '@/lib/utils';
import { useDraggable } from '@dnd-kit/core';

const priorityDots: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

interface TaskItemProps {
  task: Task;
}

function TaskItem({ task }: TaskItemProps) {
  const { toggleTaskStatus, deleteTask } = usePlannerStore();
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
        'group flex items-start gap-2 p-3 rounded-lg bg-card border border-border/50 hover:border-border transition-all',
        isDragging && 'opacity-50 shadow-lg z-50',
        task.status === 'completed' && 'opacity-60'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      
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
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        onClick={() => deleteTask(task.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function TaskSidebar() {
  const { tasks, groupBy, setGroupBy, filters, setFilters, clearFilters, projects } = usePlannerStore();

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
    <aside className="w-80 border-r border-border bg-sidebar flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Tasks</h2>
          <span className="text-xs text-muted-foreground">
            {unscheduledTasks.length} unscheduled
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
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
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">Project</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project}
                      className="text-xs"
                      onClick={() => setFilters({ ...filters, project })}
                    >
                      {project}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">Priority</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem className="text-xs" onClick={() => setFilters({ ...filters, priority: 'high' })}>
                    High
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => setFilters({ ...filters, priority: 'medium' })}>
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => setFilters({ ...filters, priority: 'low' })}>
                    Low
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">Status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem className="text-xs" onClick={() => setFilters({ ...filters, status: 'pending' })}>
                    Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => setFilters({ ...filters, status: 'completed' })}>
                    Completed
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs text-destructive" onClick={clearFilters}>
                    <X className="h-3 w-3 mr-1" />
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
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
                  <TaskItem key={task.id} task={task} />
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
