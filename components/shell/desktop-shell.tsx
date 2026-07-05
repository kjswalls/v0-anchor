'use client';

import { Sidebar } from '@/components/sidebar/sidebar';
import { Timeline } from '@/components/planner/timeline';
import { WeekView } from '@/components/planner/week-view';
import { ChatSidebar } from '@/components/ai/chat-sidebar';
import { MorningCheck } from '@/components/ai/morning-check';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { Button } from '@/components/ui/button';
import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useViewStore } from '@/lib/view-store';
import { useEODStore } from '@/lib/eod-store';
import { useMorningStore } from '@/lib/morning-store';
import { useUIStore, openAddDialog, openEditFor } from '@/lib/ui-store';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';

/**
 * Desktop layout: sidebar v2 + canvas panel on the warm backdrop.
 * Chat migrates into the sidebar in P4; the views are rewritten in P5.
 */
export function DesktopShell({ activeId }: { activeId: string | null }) {
  const { scope } = useViewStore();
  const { openDialog } = useUIStore();
  const eodStore = useEODStore();
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    leftSidebarHoverEnabled,
    rightSidebarHoverEnabled,
    setLeftSidebarHovered,
    setRightSidebarHovered,
  } = useSidebarStore();

  const handleTaskClick = (task: Task) => openEditFor(task, 'task');
  const handleHabitClick = (habit: Habit) => openEditFor(habit, 'habit');
  const handleAddFromTimeline = (bucket: TimeBucket, type: 'task' | 'habit') =>
    openAddDialog(type, bucket, usePlannerStore.getState().selectedDate);

  return (
    <div className="hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
      <Sidebar />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-panel bg-canvas shadow-soft-md">
        {/* Left hover zone - shows sidebar when collapsed (if enabled) */}
        {!leftSidebarOpen && leftSidebarHoverEnabled && (
          <div
            className="absolute left-0 top-0 bottom-0 z-40 w-3 cursor-pointer transition-colors hover:bg-primary/10"
            onMouseEnter={() => setLeftSidebarHovered(true)}
          />
        )}

        {/* Canvas header — capsule left, dev triggers right */}
        <div className="flex flex-shrink-0 items-start justify-between px-6 pt-5 pb-2">
          <HeaderCapsule />
          <div className="flex items-center gap-2">
            {/* DEV: manual trigger buttons for testing — remove before launch */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => useMorningStore.setState({ morningCheckDismissedDate: null })}
              title="[DEV] Reset morning check (clears dismissed state)"
            >
              ☀️
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => eodStore.open()}
              title="[DEV] Trigger EOD review"
            >
              🌙
            </Button>
          </div>
        </div>

        <MorningCheck />

        <div data-tour="timeline" className="flex flex-1 flex-col overflow-hidden">
          {scope === 'day' ? (
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

        {/* Right hover zone - shows chat sidebar when collapsed (if enabled) */}
        {!rightSidebarOpen && rightSidebarHoverEnabled && (
          <div
            className="absolute right-0 top-0 bottom-0 z-40 w-3 cursor-pointer transition-colors hover:bg-primary/10"
            onMouseEnter={() => setRightSidebarHovered(true)}
          />
        )}

        <ChatSidebar onOpenSettings={() => openDialog({ type: 'settings' })} />
      </main>
    </div>
  );
}
