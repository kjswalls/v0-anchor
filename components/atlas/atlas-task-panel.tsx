'use client';

import { Circle, CheckCircle2, Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { AtlasNode } from '@/lib/atlas-store';
import type { MockTask } from '@/lib/atlas-mock-data';

interface AtlasTaskPanelProps {
  selectedNode: AtlasNode | null;
  tasks: MockTask[];
  onClose: () => void;
}

const priorityColors = {
  high: 'text-red-500 dark:text-red-400',
  medium: 'text-yellow-500 dark:text-yellow-400',
  low: 'text-muted-foreground',
};

export function AtlasTaskPanel({
  selectedNode,
  tasks,
  onClose,
}: AtlasTaskPanelProps) {
  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a project to view tasks
      </div>
    );
  }

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPercent = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl">{selectedNode.emoji}</span>
          <div>
            <h3 className="font-semibold text-foreground">{selectedNode.name}</h3>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {tasks.length} tasks completed
            </p>
          </div>
        </div>
        
        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
      </div>
      
      {/* Task list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg transition-colors',
                'hover:bg-secondary/50 cursor-pointer',
                task.completed && 'opacity-60'
              )}
            >
              {/* Completion status */}
              {task.completed ? (
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className={cn('h-4 w-4 mt-0.5 flex-shrink-0', priorityColors[task.priority])} />
              )}
              
              {/* Task content */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm',
                  task.completed && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </p>
                
                {/* Time badge */}
                {task.dueTime && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{task.dueTime}</span>
                  </div>
                )}
              </div>
              
              {/* Priority indicator */}
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                  task.priority === 'high' && 'bg-red-500 dark:bg-red-400',
                  task.priority === 'medium' && 'bg-yellow-500 dark:bg-yellow-400',
                  task.priority === 'low' && 'bg-muted-foreground/30'
                )}
              />
            </div>
          ))}
          
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <span className="text-2xl mb-2">📭</span>
              <p className="text-sm">No tasks in this project</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
