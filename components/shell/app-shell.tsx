'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { GripVertical, Circle, Keyboard as KeyboardIcon } from 'lucide-react';
import { DesktopShell } from '@/components/shell/desktop-shell';
import { ConfirmDialog } from '@/components/shell/confirm-dialog';
import { inferDropTime } from '@/lib/dnd/infer-drop-time';
import { EditTaskDialog } from '@/components/planner/edit-task-dialog';
import { EditHabitDialog } from '@/components/planner/edit-habit-dialog';
import { AddTaskDialog } from '@/components/planner/add-task-dialog';
import { ManageCategoriesDialog } from '@/components/planner/manage-categories-dialog';
import { SettingsDialog } from '@/components/planner/settings-dialog';
import { KeyboardShortcutsModal } from '@/components/planner/keyboard-shortcuts-modal';
import { EODReview } from '@/components/ai/eod-review';
import { MobileShell } from '@/components/shell/mobile-shell';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { BugReportDialog } from '@/components/bug-report/bug-report-dialog';

import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMobileNavStore } from '@/lib/mobile-nav-store';
import { useEODStore } from '@/lib/eod-store';
import { useUIStore, openAddDialog, openEditFor } from '@/lib/ui-store';
import { adoptLegacyViewPrefs, useViewStore } from '@/lib/view-store';
import { useDragStore } from '@/lib/drag-store';
import { hoveredItem } from '@/lib/hovered-item';
import { resolveDrop } from '@/lib/dnd/handle-drag-end';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useUndoToast } from '@/hooks/use-undo-toast';
import { useTimezoneSync } from '@/hooks/use-timezone-sync';
import { useIsMobile } from '@/hooks/use-mobile';
import { isOnboardingComplete, resetOnboardingComplete } from '@/lib/user-profile';
import { createClient } from '@/lib/supabase';
import type { MobileTab } from '@/lib/mobile-nav-store';

function KbdHint() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return <span>{isMac ? '⌘ + /' : 'Ctrl + /'}</span>;
}

function DraggableTaskOverlay({ title }: { title: string }) {
  return (
    <div className="flex min-w-48 items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-soft-lg">
      <GripVertical className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <Circle className="mt-0.5 h-4 w-4 text-muted-foreground/40" />
      <div className="min-w-0 flex-1">
        <p className="font-content text-content text-foreground">{title}</p>
      </div>
    </div>
  );
}

/** Own subscriber so mounting the ghost never waits on an AppShell render. */
function DragGhost() {
  const activeId = useDragStore((s) => s.activeId);
  const title = usePlannerStore((s) =>
    activeId
      ? (s.tasks.find((t) => t.id === activeId) ?? s.habits.find((h) => h.id === activeId))?.title ??
        null
      : null
  );
  return <DragOverlay>{title !== null && <DraggableTaskOverlay title={title} />}</DragOverlay>;
}

/**
 * App shell: owns the DndContext, global keyboard shortcuts, auto-triggers
 * (EOD/morning), the dialog mount point, and the desktop/mobile split.
 * Extracted from app/page.tsx (P2 of the redesign plan).
 */
export function AppShell() {
  const {
    tasks,
    habits,
    scheduleTask,
    assignHabitToBucket,
    unscheduleTask,
    scheduleHabit,
    deleteTask,
    deleteHabit,
    moveTaskToProjectBlock,
    selectedDate,
    undo,
    redo,
  } = usePlannerStore();
  const { toggleLeftSidebar, toggleChat, setChatExpanded } = useSidebarStore();
  const { activeDialog, openDialog, closeDialog, confirm } = useUIStore();
  const isMobile = useIsMobile();

  useUndoToast();
  useTimezoneSync();

  const [mounted, setMounted] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourUserId, setTourUserId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    adoptLegacyViewPrefs();
  }, []);

  // Content typeface toggle — stamp <html data-type-mode> so the CSS token
  // pair in globals.css flips item-title family/weight/size app-wide.
  const typeMode = useViewStore((s) => s.typeMode);
  useEffect(() => {
    document.documentElement.dataset.typeMode = typeMode;
  }, [typeMode]);

  // Check onboarding status on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const done = await isOnboardingComplete(uid);
      if (!done) {
        setTourUserId(uid);
        setShowTour(true);
      }
    });
  }, []);

  // EOD deep link: ?eod=1 opens the EOD review modal (e.g. tapped from a push notification)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('eod') !== '1') return;

    const openAndClear = () => {
      useEODStore.getState().open();
      window.history.replaceState({}, '', '/');
    };

    if (!usePlannerStore.getState().isLoading) {
      openAndClear();
    } else {
      const unsub = usePlannerStore.subscribe((state) => {
        if (!state.isLoading) {
          openAndClear();
          unsub();
        }
      });
      return unsub;
    }
  }, []);

  // EOD auto-trigger: open the EOD review modal when the review time has passed today
  const eodStore = useEODStore();
  useEffect(() => {
    if (!eodStore.eodReviewEnabled) return;

    const userTz =
      usePlannerStore.getState().userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    if (eodStore.lastEodReviewDate === todayStr) return;

    const currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: userTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    if (currentTime >= eodStore.eodReviewTime) {
      eodStore.open();
    }
  }, [eodStore.eodReviewEnabled, eodStore.eodReviewTime]);

  // Global keyboard shortcuts (chrome-level; item shortcuts via useKeyboardShortcuts below)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (e.key === '[') {
        e.preventDefault();
        toggleLeftSidebar();
      }
      if (e.key === ']') {
        e.preventDefault();
        toggleChat();
      }
      if (e.key === '/') {
        e.preventDefault();
        openDialog({ type: 'keyboard-shortcuts' });
      }
      if (e.key === ',') {
        e.preventDefault();
        openDialog({ type: 'settings' });
      }
      if (key === 'k') {
        e.preventDefault();
        useUIStore.getState().focusOmnibar();
      }
      // Undo/redo (moved from top-nav)
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleLeftSidebar, toggleChat, openDialog, undo, redo]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // 5px: low enough that the ghost appears near-instantly, high enough
        // that a jittery click doesn't register as a drag (rows open the edit
        // dialog on click).
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  // Drag state lives in lib/drag-store (NOT useState here): a shell-level
  // setState re-rendered the whole app tree before the ghost could paint.
  const handleDragStart = (event: DragStartEvent) => {
    useDragStore.getState().setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    useDragStore.getState().setActiveId(null);
    if (!over) return;

    const itemId = active.id as string;
    const draggedTask = tasks.find((t) => t.id === itemId);
    const draggedHabit = habits.find((h) => h.id === itemId);

    const command = resolveDrop(itemId, over.id as string, {
      itemType: draggedTask ? 'task' : draggedHabit ? 'habit' : null,
      draggedTaskProject: draggedTask?.project,
      selectedDateStr: format(selectedDate, 'yyyy-MM-dd'),
      getRefTime: (refType, refId) =>
        refType === 'task'
          ? tasks.find((t) => t.id === refId)?.startTime
          : habits.find((h) => h.id === refId)?.startTime,
      inferDropTime,
    });
    if (!command) return;

    switch (command.kind) {
      case 'schedule-task':
        scheduleTask(command.taskId, command.bucket, command.time, command.dateStr);
        break;
      case 'schedule-habit':
        scheduleHabit(command.habitId, command.bucket, command.time);
        break;
      case 'assign-habit-bucket':
        assignHabitToBucket(command.habitId, command.bucket);
        break;
      case 'unschedule':
        unscheduleTask(command.itemId);
        break;
      case 'move-task-to-project-block':
        moveTaskToProjectBlock(command.taskId);
        break;
    }
  };


  // Keyboard shortcut handlers — hovered item comes from the module ref
  // (lib/hovered-item), read at keypress time. Not store state: a store write
  // per row-hover re-rendered the whole shell tree (see lib/hovered-item.ts).
  const handleShortcutEdit = useCallback(() => {
    const { id, type } = hoveredItem;
    if (!id || !type) return;
    if (type === 'task') {
      const task = tasks.find((t) => t.id === id);
      if (task) openEditFor(task, 'task');
    } else {
      const habit = habits.find((h) => h.id === id);
      if (habit) openEditFor(habit, 'habit');
    }
  }, [tasks, habits]);

  const handleShortcutDelete = useCallback(() => {
    const { id, type } = hoveredItem;
    if (!id || !type) return;
    const item =
      type === 'task'
        ? tasks.find((t) => t.id === id)
        : habits.find((h) => h.id === id);
    if (!item) return;
    confirm({
      title: `Delete ${type === 'habit' ? 'Habit' : 'Task'}?`,
      description: `This will permanently delete "${item.title}". This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => (type === 'task' ? deleteTask(item.id) : deleteHabit(item.id)),
    });
  }, [tasks, habits, confirm, deleteTask, deleteHabit]);

  useKeyboardShortcuts({
    new_task: useCallback(() => openAddDialog('task'), []),
    edit_hovered: handleShortcutEdit,
    delete_hovered: handleShortcutDelete,
    report_bug: useCallback(() => useUIStore.getState().openDialog({ type: 'bug-report' }), []),
  });

  // Dialog state — keep the last add payload so close animations don't flicker
  const addState = activeDialog?.type === 'add' ? activeDialog : null;
  const [lastAdd, setLastAdd] = useState(addState);
  if (addState && addState !== lastAdd) setLastAdd(addState);
  const editingTask = activeDialog?.type === 'edit-task' ? activeDialog.task : null;
  const editingHabit = activeDialog?.type === 'edit-habit' ? activeDialog.habit : null;

  // Render skeleton during SSR to avoid hydration mismatch from dnd-kit
  if (!mounted) {
    return (
      <>
        {/* Desktop skeleton */}
        <div className="hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
          <div className="w-80 rounded-panel bg-sidebar" />
          <main className="flex-1 rounded-panel bg-canvas" />
        </div>
        {/* Mobile skeleton */}
        <div className="flex h-[100dvh] flex-col bg-background md:hidden">
          <div className="h-14 border-b border-border bg-card" />
          <div className="flex-1 bg-background" />
          <div className="h-14 border-t border-border bg-card" />
        </div>
      </>
    );
  }

  return (
    <DndContext
      id="planner-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
    >
      {/* One shell mounts at a time (post-hydration) so the shared view
          components don't register duplicate dnd-kit droppable ids across the
          two trees — and mobile no longer pays for the desktop tree, or v.v. */}
      {isMobile ? <MobileShell /> : <DesktopShell />}

      <DragGhost />

      <AddTaskDialog
        open={!!addState}
        onOpenChange={(open) => !open && closeDialog()}
        defaultTab={lastAdd?.tab ?? 'task'}
        defaultBucket={lastAdd?.bucket}
        defaultDate={lastAdd?.date}
      />

      <EditTaskDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <EditHabitDialog
        habit={editingHabit}
        open={!!editingHabit}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <ManageCategoriesDialog
        open={activeDialog?.type === 'manage-categories'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <SettingsDialog
        open={activeDialog?.type === 'settings'}
        onOpenChange={(open) => !open && closeDialog()}
        onOpenKeyboardShortcuts={() => openDialog({ type: 'keyboard-shortcuts' })}
        onReportBug={() => openDialog({ type: 'bug-report' })}
        onReplayTour={async () => {
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          const uid = data.user?.id;
          if (!uid) return;
          await resetOnboardingComplete(uid);
          setTourUserId(uid);
          setShowTour(true);
        }}
      />

      <KeyboardShortcutsModal
        open={activeDialog?.type === 'keyboard-shortcuts'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {showTour && tourUserId && (
        <OnboardingTour
          userId={tourUserId}
          onComplete={() => setShowTour(false)}
          onOpenSettings={() => openDialog({ type: 'settings' })}
          onExpandChat={() => setChatExpanded(true)}
          onCollapseChat={() => setChatExpanded(false)}
          onSetActiveTab={(tab) => useMobileNavStore.getState().setActiveTab(tab as MobileTab)}
        />
      )}

      <EODReview />

      <BugReportDialog
        open={activeDialog?.type === 'bug-report'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <ConfirmDialog />

      {/* Persistent keyboard shortcuts hint — desktop only */}
      <div className="fixed bottom-4 right-4 z-30 hidden md:flex">
        <button
          onClick={() => openDialog({ type: 'keyboard-shortcuts' })}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-soft-sm transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <KeyboardIcon className="h-3.5 w-3.5" />
          <KbdHint />
        </button>
      </div>
    </DndContext>
  );
}
