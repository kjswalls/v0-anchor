'use client';

import { TaskSidebar } from '@/components/planner/task-sidebar';
import { Timeline } from '@/components/planner/timeline';
import { WeekView } from '@/components/planner/week-view';
import { ChatSidebar } from '@/components/ai/chat-sidebar';
import { MorningCheck } from '@/components/ai/morning-check';
import { ActionFeed } from '@/components/planner/action-feed';
import { UserProfileDropdown } from '@/components/planner/user-profile-dropdown';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { SearchButton } from '@/components/canvas/search-button';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useViewStore } from '@/lib/view-store';
import { useEODStore } from '@/lib/eod-store';
import { useMorningStore } from '@/lib/morning-store';
import { useUIStore, openAddDialog, openEditFor } from '@/lib/ui-store';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';

interface DesktopShellProps {
  activeId: string | null;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
}

/**
 * Desktop layout: legacy sidebar + canvas panel on the warm backdrop.
 * The sidebar/chat are replaced in P3/P4; the views in P5.
 */
export function DesktopShell({ activeId, searchOpen, onSearchOpenChange }: DesktopShellProps) {
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
      <TaskSidebar
        onTaskClick={handleTaskClick}
        onHabitClick={handleHabitClick}
        onAddClick={() => openAddDialog('task')}
        onAddHabitClick={() => openAddDialog('habit')}
        onManageCategories={() => openDialog({ type: 'manage-categories' })}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-panel bg-canvas shadow-soft-md">
        {/* Left hover zone - shows task sidebar when collapsed (if enabled) */}
        {!leftSidebarOpen && leftSidebarHoverEnabled && (
          <div
            className="absolute left-0 top-0 bottom-0 z-40 w-3 cursor-pointer transition-colors hover:bg-primary/10"
            onMouseEnter={() => setLeftSidebarHovered(true)}
          />
        )}

        {/* Canvas header — capsule left, transitional cluster right (P3 moves it into the sidebar) */}
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
            <ActionFeed />
            <SearchButton open={searchOpen} onOpenChange={onSearchOpenChange} />
            <UserProfileDropdown onOpenSettings={() => openDialog({ type: 'settings' })} />
            <Button
              size="sm"
              onClick={() => openAddDialog('task')}
              className="h-8 bg-primary px-3 text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
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
