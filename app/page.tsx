'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopNav } from '@/components/planner/top-nav';
import { TaskSidebar } from '@/components/planner/task-sidebar';
import { Timeline, inferDropTime } from '@/components/planner/timeline';
import { WeekView } from '@/components/planner/week-view';
import { EditTaskDialog } from '@/components/planner/edit-task-dialog';
import { EditHabitDialog } from '@/components/planner/edit-habit-dialog';
import { AddTaskDialog } from '@/components/planner/add-task-dialog';
import { ManageCategoriesDialog } from '@/components/planner/manage-categories-dialog';
import { SettingsDialog } from '@/components/planner/settings-dialog';
import { ActionFeed } from '@/components/planner/action-feed';
import { MorningCheck } from '@/components/ai/morning-check';
import { EODReview } from '@/components/ai/eod-review';
import { ChatSidebar } from '@/components/ai/chat-sidebar';
import { usePlannerStore } from '@/lib/planner-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';
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
import { Button } from '@/components/ui/button';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { GripVertical, Circle } from 'lucide-react';
import { format } from 'date-fns';

function DraggableTaskOverlay({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-card border border-border shadow-xl min-w-48">
      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5" />
      <Circle className="h-4 w-4 text-muted-foreground/40 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-tight">{title}</p>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const { tasks, habits, scheduleTask, assignTaskToBucket, unscheduleTask, scheduleHabit, assignHabitToBucket, deleteTask, deleteHabit, hoveredItemId, hoveredItemType, viewMode, timelineItemFilter, setTimelineItemFilter, moveTaskToProjectBlock, selectedDate } = usePlannerStore();

  const [mounted, setMounted] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogTab, setAddDialogTab] = useState<'task' | 'habit'>('task');
  const [addDialogBucket, setAddDialogBucket] = useState<TimeBucket | undefined>();
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Keyboard shortcut delete confirmation
  const [shortcutDeleteTarget, setShortcutDeleteTarget] = useState<{ id: string; type: 'task' | 'habit'; title: string } | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // EOD auto-trigger intentionally removed for web — needs push notifications (PWA/mobile).
  // The EOD review can still be triggered manually via the toolbar button.
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (over) {
      const itemId = active.id as string;
      const target = over.id as string;
      
      // Determine if dragged item is a task or habit
      const draggedTask = tasks.find(t => t.id === itemId);
      const draggedHabit = habits.find(h => h.id === itemId);
      const itemType = draggedTask ? 'task' : draggedHabit ? 'habit' : null;
      
      // Check if dropping on a scheduled section with time
      if (target.startsWith('scheduled:')) {
        // Format: scheduled:{bucket}:{position}:{itemType}:{itemId} or scheduled:{bucket}:empty
        const parts = target.split(':');
        const bucket = parts[1] as TimeBucket;
        const position = parts[2] as 'before' | 'after' | 'empty';
        
        let dropTime: string;
        if (position === 'empty') {
          dropTime = inferDropTime(bucket, 'empty');
        } else {
          // Get reference item's time
          const refItemType = parts[3];
          const refItemId = parts[4];
          let refTime: string | undefined;
          
          if (refItemType === 'task') {
            const refTask = tasks.find(t => t.id === refItemId);
            refTime = refTask?.startTime;
          } else if (refItemType === 'habit') {
            const refHabit = habits.find(h => h.id === refItemId);
            refTime = refHabit?.startTime;
          }
          
          dropTime = inferDropTime(bucket, position, refTime);
        }
        
        // Pass the selected date for day view scheduling
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        if (itemType === 'task') {
          scheduleTask(itemId, bucket, dropTime, selectedDateStr);
        } else if (itemType === 'habit') {
          scheduleHabit(itemId, bucket, dropTime);
        }
      } else if (['anytime', 'morning', 'afternoon', 'evening'].includes(target)) {
        // Dropping on bucket without specific time - assign to bucket but keep unscheduled
        // Pass the selected date for day view scheduling
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        if (itemType === 'task') {
          scheduleTask(itemId, target as TimeBucket, undefined, selectedDateStr);
        } else if (itemType === 'habit') {
          assignHabitToBucket(itemId, target as TimeBucket);
        }
      } else if (target === 'sidebar') {
        // Dropped back on sidebar - unschedule
        unscheduleTask(itemId);
      } else if (target.startsWith('projectblock:')) {
        // Dropping on a project block - move task into the project block
        // Format: projectblock:{projectName}
        const projectName = target.replace('projectblock:', '');
        
        // Only allow tasks that belong to this project
        if (itemType === 'task' && draggedTask?.project === projectName) {
          moveTaskToProjectBlock(itemId);
        }
      } else if (target.startsWith('week:')) {
        // Dropping on a week view cell
        // Format: week:{date}:{bucket}
        const parts = target.split(':');
        const dateStr = parts[1];
        const bucket = parts[2] as TimeBucket;
        
        if (itemType === 'task') {
          // Schedule the task for that date and bucket
          scheduleTask(itemId, bucket, undefined, dateStr);
        } else if (itemType === 'habit') {
          // Schedule the habit for that bucket
          scheduleHabit(itemId, bucket);
        }
      }
    }
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
  };

  const handleHabitClick = (habit: Habit) => {
    setEditingHabit(habit);
  };

  const handleAddFromTopNav = () => {
    setAddDialogTab('task');
    setAddDialogBucket(undefined);
    setAddDialogOpen(true);
  };

  const handleAddHabitFromSidebar = () => {
    setAddDialogTab('habit');
    setAddDialogBucket(undefined);
    setAddDialogOpen(true);
  };

  const handleAddFromSidebar = () => {
    setAddDialogTab('task');
    setAddDialogBucket(undefined);
    setAddDialogOpen(true);
  };

  const handleAddFromTimeline = (bucket: TimeBucket, type: 'task' | 'habit') => {
    setAddDialogTab(type);
    setAddDialogBucket(bucket);
    setAddDialogOpen(true);
  };

  const handleManageCategories = () => {
    setManageCategoriesOpen(true);
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

  // Keyboard shortcut handlers
  const handleShortcutNewTask = useCallback(() => {
    setAddDialogTab('task');
    setAddDialogBucket(undefined);
    setAddDialogOpen(true);
  }, []);

  const handleShortcutEdit = useCallback(() => {
    if (!hoveredItemId || !hoveredItemType) return;
    if (hoveredItemType === 'task') {
      const task = tasks.find((t) => t.id === hoveredItemId);
      if (task) setEditingTask(task);
    } else {
      const habit = habits.find((h) => h.id === hoveredItemId);
      if (habit) setEditingHabit(habit);
    }
  }, [hoveredItemId, hoveredItemType, tasks, habits]);

  const handleShortcutDelete = useCallback(() => {
    if (!hoveredItemId || !hoveredItemType) return;
    if (hoveredItemType === 'task') {
      const task = tasks.find((t) => t.id === hoveredItemId);
      if (task) setShortcutDeleteTarget({ id: task.id, type: 'task', title: task.title });
    } else {
      const habit = habits.find((h) => h.id === hoveredItemId);
      if (habit) setShortcutDeleteTarget({ id: habit.id, type: 'habit', title: habit.title });
    }
  }, [hoveredItemId, hoveredItemType, tasks, habits]);

  useKeyboardShortcuts({
    new_task: handleShortcutNewTask,
    edit_hovered: handleShortcutEdit,
    delete_hovered: handleShortcutDelete,
  });

  // Render skeleton during SSR to avoid hydration mismatch from dnd-kit
  if (!mounted) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <div className="h-14 border-b border-border bg-card" />
        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r border-border bg-sidebar" />
          <main className="flex-1 bg-background" />
        </div>
      </div>
    );
  }

  return (
    <DndContext
      id="planner-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <TopNav 
          onAddClick={handleAddFromTopNav} 
          onManageCategories={handleManageCategories}
          onOpenSettings={handleOpenSettings}
          onTaskClick={handleTaskClick}
          onHabitClick={handleHabitClick}
        />
        <div className="flex-1 flex overflow-hidden">
          <TaskSidebar onTaskClick={handleTaskClick} onHabitClick={handleHabitClick} onAddClick={handleAddFromSidebar} onAddHabitClick={handleAddHabitFromSidebar} onManageCategories={handleManageCategories} />
          <main className="flex-1 flex flex-col overflow-hidden relative">
            {/* Item visibility toggle and action feed - toggle centered, feed on right */}
            <div className="relative flex items-center px-4 border-b border-border flex-shrink-0 h-16">
              {/* Centered visibility toggle */}
              <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary pointer-events-auto">
                  <Button
                    variant={timelineItemFilter === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setTimelineItemFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={timelineItemFilter === 'tasks' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setTimelineItemFilter('tasks')}
                  >
                    Tasks
                  </Button>
                  <Button
                    variant={timelineItemFilter === 'habits' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setTimelineItemFilter('habits')}
                  >
                    Habits
                  </Button>
                </div>
              </div>
              
              {/* Action feed on the right */}
              <div className="ml-auto z-10 flex items-center gap-2">
                <ActionFeed />
                {/* EOD button hidden until PWA/mobile push notifications */}
              </div>
            </div>

            <MorningCheck />

            <div className="flex-1 flex flex-col bg-background overflow-hidden">
              {viewMode === 'day' ? (
                <Timeline
                  onTaskClick={handleTaskClick}
                  onHabitClick={handleHabitClick}
                  onAddClick={handleAddFromTimeline}
                  activeId={activeId}
                />
              ) : (
                <WeekView
                  onTaskClick={handleTaskClick}
                  onHabitClick={handleHabitClick}
                  onAddClick={handleAddFromTimeline}
                />
              )}
            </div>
            <ChatSidebar />
          </main>
        </div>
      </div>
      
      <DragOverlay>
        {activeTask && <DraggableTaskOverlay title={activeTask.title} />}
      </DragOverlay>
      
      <AddTaskDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        defaultTab={addDialogTab}
        defaultBucket={addDialogBucket}
      />
      
      <EditTaskDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
      />
      
      <EditHabitDialog
        habit={editingHabit}
        open={!!editingHabit}
        onOpenChange={(open) => !open && setEditingHabit(null)}
      />

      <ManageCategoriesDialog
        open={manageCategoriesOpen}
        onOpenChange={setManageCategoriesOpen}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <EODReview />

      {/* Keyboard shortcut delete confirmation */}
      <AlertDialog
        open={!!shortcutDeleteTarget}
        onOpenChange={(open) => !open && setShortcutDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {shortcutDeleteTarget?.type === 'habit' ? 'Habit' : 'Task'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{shortcutDeleteTarget?.title}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!shortcutDeleteTarget) return;
                if (shortcutDeleteTarget.type === 'task') {
                  deleteTask(shortcutDeleteTarget.id);
                } else {
                  deleteHabit(shortcutDeleteTarget.id);
                }
                setShortcutDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}
