'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { BulkActionBar } from '@/components/shell/bulk-action-bar';
import { inferDropTime } from '@/lib/dnd/infer-drop-time';
import { ItemDialog, type ItemDialogState } from '@/components/planner/item-dialog';
import { ManageCategoriesDialog } from '@/components/planner/manage-categories-dialog';
import { ManageCollectionsDialog } from '@/components/planner/manage-collections-dialog';
import { KeyboardShortcutsModal } from '@/components/planner/keyboard-shortcuts-modal';
import { EODReview } from '@/components/ai/eod-review';
import { MobileShell } from '@/components/shell/mobile-shell';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { BugReportDialog } from '@/components/bug-report/bug-report-dialog';

import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMobileNavStore } from '@/lib/mobile-nav-store';
import { useEODStore } from '@/lib/eod-store';
import { useChatStore } from '@/lib/chat-store';
import { flushSettings } from '@/lib/settings-service';
import { useUIStore, openEditFor } from '@/lib/ui-store';
import { ITEM_TYPES } from '@/lib/item-registry';
import { adoptLegacyViewPrefs, useViewStore } from '@/lib/view-store';
import { useDragStore } from '@/lib/drag-store';
import { useSelectionStore } from '@/lib/selection-store';
import { hoveredItem } from '@/lib/hovered-item';
import { resolveDrop } from '@/lib/dnd/handle-drag-end';
import { toDateStr } from '@/lib/recurrence';
import { useCommandShortcuts } from '@/hooks/use-command-shortcuts';
import { useCommandContext } from '@/hooks/use-command-context';
import { useUndoToast } from '@/hooks/use-undo-toast';
import { useTimezoneSync } from '@/hooks/use-timezone-sync';
import { useOverdueSweep } from '@/hooks/use-overdue-sweep';
import { useIsMobile } from '@/hooks/use-mobile';
import { isOnboardingComplete } from '@/lib/user-profile';
import { createClient } from '@/lib/supabase';
import type { MobileTab } from '@/lib/mobile-nav-store';

function KbdHint() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return <span>{isMac ? '⌘ + /' : 'Ctrl + /'}</span>;
}

function DraggableTaskOverlay({ title, count = 0 }: { title: string; count?: number }) {
  return (
    <div className="relative flex min-w-48 items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-soft-lg">
      {/* Group drag: a count badge over the primary row, so you see what you
          grabbed AND how many travel with it. */}
      {count > 1 && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground shadow-soft-sm">
          {count}
        </span>
      )}
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
  // Count travels only when the dragged row is itself part of a multi-selection.
  const groupCount = useSelectionStore((s) =>
    activeId && s.selectedIds.has(activeId) && s.selectedIds.size >= 2 ? s.selectedIds.size : 0
  );
  const title = usePlannerStore((s) =>
    activeId
      ? (s.tasks.find((t) => t.id === activeId) ?? s.habits.find((h) => h.id === activeId))?.title ??
        null
      : null
  );
  return (
    <DragOverlay>
      {title !== null && <DraggableTaskOverlay title={title} count={groupCount} />}
    </DragOverlay>
  );
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
    userTimezone,
  } = usePlannerStore();
  const { setChatExpanded } = useSidebarStore();
  const { activeDialog, openDialog, closeDialog, confirm } = useUIStore();
  const isMobile = useIsMobile();
  const commandContext = useCommandContext();

  useUndoToast();
  useTimezoneSync();
  // Opt-in past-due decay (off by default). Mounted here, above the
  // desktop/mobile split, so the once-per-day sweep runs on every platform and
  // survives view changes — and declared AFTER useUndoToast so the batched
  // unschedule it fires is picked up by the already-mounted toast subscriber.
  useOverdueSweep();

  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourUserId, setTourUserId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    adoptLegacyViewPrefs();
    // Hydrate the chat transcript here rather than waiting for
    // ChatConversation to mount. A command ("Plan my day") can send a message
    // before the panel has ever been opened, and send() persists the message
    // list it appends to — over an empty one, that wipes the saved history.
    useChatStore.getState().hydrate();
  }, []);

  // Settings writes are debounced 500ms; closing the tab inside that window
  // would otherwise drop the patch. pagehide (not beforeunload) is the event
  // that actually fires on mobile Safari.
  useEffect(() => {
    const onPageHide = () => void flushSettings();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
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

    // `!isLoading` alone is NOT "loaded" — the store initialises with
    // isLoading:false, and this effect runs before the load even starts:
    // initializeStore is called from SupabaseProvider, a PARENT, and React runs
    // child effects first. So the fast path used to fire against an EMPTY store,
    // and EODReview snapshots its pending list once on the isOpen transition and
    // never re-snapshots — leaving a permanently empty review for anyone who
    // arrived by tapping the push notification. `userId` is set in the same
    // set() as isLoading:true, so it is the signal that a load has begun.
    const isLoaded = (s: { userId: string | null; isLoading: boolean }) =>
      !!s.userId && !s.isLoading;

    if (isLoaded(usePlannerStore.getState())) {
      openAndClear();
    } else {
      const unsub = usePlannerStore.subscribe((state) => {
        if (isLoaded(state)) {
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

    // One timezone-correct day string, shared by resolveDrop and the group
    // branch below — the user's saved tz, matching how days are derived.
    const userTz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    const command = resolveDrop(itemId, over.id as string, {
      itemType: draggedTask ? 'task' : draggedHabit ? 'habit' : null,
      draggedTaskProject: draggedTask?.project,
      selectedDate,
      userTimezone: userTz,
      getRefTime: (refType, refId) =>
        refType === 'task'
          ? tasks.find((t) => t.id === refId)?.startTime
          : habits.find((h) => h.id === refId)?.startTime,
      inferDropTime,
    });

    // Group drag: when the dragged row is part of a multi-selection (>=2), the
    // whole selection moves. Routed by drop target; each verb is one undo.
    // Timed drops degrade to the target's bucket (untimed) — N items can't share
    // one clock time. Only task-likes are date-addressable/braindump-eligible,
    // so the bulk verbs quietly skip habits where that applies.
    const selection = useSelectionStore.getState();
    if (selection.selectedIds.has(itemId) && selection.selectedIds.size >= 2) {
      const overId = over.id as string;
      const groupIds = [...selection.selectedIds];
      // Task-likes are the only date-addressable / braindump-eligible members;
      // unschedule and date-move no-op on habits, so gate `acted` on this so a
      // fully-ineligible group falls through instead of silently clearing.
      const taskLikeIds = groupIds.filter((id) => tasks.some((t) => t.id === id));
      const planner = usePlannerStore.getState();
      // What the primary drop resolved to: a bucket always, and — for a TIMED
      // slot (an hour cell) — a clock time. A timed target schedules the whole
      // group AT that time so they land as visible blocks; an untimed target
      // (bare bucket / Anytime / week column) assigns the bucket untimed.
      const targetBucket = command && 'bucket' in command ? command.bucket : undefined;
      const targetTime = command && 'time' in command ? command.time : undefined;
      const selectedDayStr = toDateStr(selectedDate, userTz);
      let acted = false;
      if (overId === 'sidebar') {
        if (taskLikeIds.length) {
          planner.unscheduleTasks(groupIds);
          acted = true;
        }
      } else if (overId.startsWith('projectblock:')) {
        const proj = overId.slice('projectblock:'.length);
        const ids = groupIds.filter((id) => tasks.find((t) => t.id === id)?.project === proj);
        if (ids.length) {
          planner.moveTasksToProjectBlock(ids);
          acted = true;
        }
      } else if (overId.startsWith('week:') || overId.startsWith('weekhour:')) {
        const dateStr = overId.split(':')[1];
        if (dateStr && targetBucket && targetTime) {
          // Timed week cell (weekhour): schedule the group AT that time on that
          // day so they show as blocks.
          planner.scheduleItemsAt(groupIds, targetBucket, targetTime, dateStr);
          acted = true;
        } else if (dateStr && targetBucket && taskLikeIds.length) {
          // Untimed week column: carry to the date + bucket (habits excluded).
          planner.moveTasksToDate(groupIds, dateStr, targetBucket);
          acted = true;
        }
      } else if (targetBucket && targetTime) {
        // Day-grid hour slot: schedule AT that time on the viewed day, so a
        // multi-drop shows up where it was dropped (not untimed in Anytime).
        planner.scheduleItemsAt(groupIds, targetBucket, targetTime, selectedDayStr);
        acted = true;
      } else if (targetBucket) {
        planner.assignItemsToBucket(groupIds, targetBucket);
        acted = true;
      }
      if (acted) {
        // Same reason as the single-item path below: a group that lands in a
        // shut bucket has to be visible where it landed. This branch returns
        // early, so it needs its own call.
        if (targetBucket) useViewStore.getState().expandBucket(targetBucket);
        selection.clear();
        return;
      }
      // Target wasn't actionable for a group — fall through to single-item.
    }

    if (!command) return;

    // A shut bucket still takes drops (see bucket-card's collapse note), so it
    // has to open to show what just landed — otherwise the count ticks up
    // behind a closed sliver and the drag reads as having failed. Placed before
    // the switch so it covers every bucket-bearing verb, and it no-ops (same
    // array back) when the bucket was already open.
    if ('bucket' in command) {
      useViewStore.getState().expandBucket(command.bucket);
    }

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
    // A genuine multi-selection (>=2) wins over the hovered item: Backspace
    // deletes the whole selection (one confirm, one undo). A single selected row
    // is just the "current / open row" (every plain click selects one), so at
    // size 1 we fall through to the hovered-item path as before.
    const selection = useSelectionStore.getState();
    if (selection.selectedIds.size >= 2) {
      const ids = [...selection.selectedIds];
      const n = ids.length;
      confirm({
        title: `Delete ${n} ${n === 1 ? 'item' : 'items'}?`,
        description:
          'This will permanently delete the selected items (and any subtasks). This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => {
          usePlannerStore.getState().deleteItems(ids);
          selection.clear();
        },
      });
      return;
    }
    const { id, type } = hoveredItem;
    if (!id || !type) return;
    const item =
      type === 'task'
        ? tasks.find((t) => t.id === id)
        : habits.find((h) => h.id === id);
    if (!item) return;
    const config = ITEM_TYPES[type];
    confirm({
      title: `Delete ${config.label}?`,
      description: config.form.deleteDescription(item.title),
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => (type === 'task' ? deleteTask(item.id) : deleteHabit(item.id)),
    });
  }, [tasks, habits, confirm, deleteTask, deleteHabit]);

  // Every other binding is owned by its command in lib/commands/registry.ts.
  // These two stay here because they act on the item under the mouse, which
  // only the shell can resolve.
  useCommandShortcuts(commandContext, {
    edit_hovered: handleShortcutEdit,
    delete_hovered: handleShortcutDelete,
  });

  // Dialog state — memoized so ItemDialog's internal anti-flicker latch sees a
  // stable reference per open (a fresh object per render would loop it).
  const itemDialogState = useMemo<ItemDialogState | null>(() => {
    if (activeDialog?.type === 'add') {
      return {
        mode: 'add',
        type: activeDialog.tab,
        bucket: activeDialog.bucket,
        date: activeDialog.date,
        title: activeDialog.title,
      };
    }
    if (activeDialog?.type === 'edit-item') {
      return { mode: 'edit', item: activeDialog.item };
    }
    return null;
  }, [activeDialog]);

  // Render skeleton during SSR to avoid hydration mismatch from dnd-kit
  if (!mounted) {
    return (
      <>
        {/* Desktop skeleton */}
        <div className="hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
          <div className="w-80 rounded-panel bg-sidebar" />
          <main className="flex-1 rounded-panel bg-canvas" />
        </div>
        {/* Mobile skeleton — matches the floating-chrome silhouette (header
            pill · content panel · bottom dock) so there's no flash of flat bars. */}
        <div className="flex h-[100dvh] flex-col bg-surface-0 md:hidden">
          <div className="mx-3 mt-2 h-11 flex-shrink-0 rounded-[16px] bg-surface-2" />
          <div className="mx-2 my-2 flex-1 rounded-[24px] border border-surface-3 bg-canvas" />
          <div className="mx-3 mb-3 h-24 flex-shrink-0 rounded-[24px] bg-surface-3" />
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

      {/* Add is always the modal. Desktop EDIT is the docked panel, which
          DesktopShell mounts as a layout sibling of the canvas; mobile edit
          stays the bottom sheet, where there is no room to dock anything. */}
      <ItemDialog
        state={itemDialogState?.mode === 'add' || isMobile ? itemDialogState : null}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <ManageCategoriesDialog
        open={activeDialog?.type === 'manage-categories'}
        defaultTab={activeDialog?.type === 'manage-categories' ? activeDialog.tab : undefined}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <ManageCollectionsDialog
        open={activeDialog?.type === 'manage-collections'}
        defaultTab={activeDialog?.type === 'manage-collections' ? activeDialog.tab : undefined}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <KeyboardShortcutsModal
        open={activeDialog?.type === 'keyboard-shortcuts'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {showTour && tourUserId && (
        <OnboardingTour
          userId={tourUserId}
          onComplete={() => setShowTour(false)}
          // The tour calls handleComplete() before this fires, so navigating
          // away doesn't abandon it. Beacon is the pane the step is about.
          onOpenSettings={() => router.push('/settings/beacon')}
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

      <BulkActionBar />

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
