'use client';

import { useState } from 'react';
import { TopNav } from '@/components/planner/top-nav';
import { TaskSidebar } from '@/components/planner/task-sidebar';
import { HabitsSection } from '@/components/planner/habits-section';
import { Timeline } from '@/components/planner/timeline';
import { usePlannerStore } from '@/lib/planner-store';
import type { TimeBucket } from '@/lib/planner-types';
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
  const { tasks, scheduleTask } = usePlannerStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  
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
      const taskId = active.id as string;
      const bucket = over.id as string;
      
      if (['anytime', 'morning', 'afternoon', 'evening'].includes(bucket)) {
        scheduleTask(taskId, bucket as TimeBucket);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <TopNav />
        <div className="flex-1 flex overflow-hidden">
          <TaskSidebar />
          <main className="flex-1 flex flex-col bg-background overflow-hidden">
            <HabitsSection />
            <Timeline />
          </main>
        </div>
      </div>
      
      <DragOverlay>
        {activeTask && <DraggableTaskOverlay title={activeTask.title} />}
      </DragOverlay>
    </DndContext>
  );
}
