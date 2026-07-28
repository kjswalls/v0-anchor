'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import type {
  Task,
  Habit,
  Item,
  TaskItem,
  HabitItem,
  ItemType,
  ViewMode,
  GroupBy,
  FilterState,
  TimeBucket,
  TaskStatus,
  HabitStatus,
  Project,
  HabitGroupType,
} from './planner-types';
import { TIME_BUCKET_RANGES } from './planner-types';
import {
  fetchItems,
  fetchProjects,
  fetchHabitGroups,
  createItem as dbCreateItem,
  updateItem as dbUpdateItem,
  deleteItem as dbDeleteItem,
  restoreItem as dbRestoreItem,
  setItemCompletion as dbSetItemCompletion,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  restoreProject as dbRestoreProject,
  createHabitGroup as dbCreateHabitGroup,
  updateHabitGroup as dbUpdateHabitGroup,
  deleteHabitGroup as dbDeleteHabitGroup,
  restoreHabitGroup as dbRestoreHabitGroup,
} from './db';
import { ITEM_TYPES } from './item-registry';
import { PROJECT_FIELDS, HABIT_GROUP_FIELDS } from '@anchor-app/types';
import { saveSettings } from './settings-service';
import { isRecurring, isCompletedOnDate, toDateStr } from './recurrence';
import { accentColorForName } from './accent-colors';

interface PlannerStore {
  /**
   * Source of truth: every task and habit as a unified Item. `tasks` and
   * `habits` are projections kept in sync on every mutation so existing
   * consumers keep working unchanged; new code should prefer `items`.
   */
  items: Item[];
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: Project[];
  habitGroups: HabitGroupType[];
  timelineItemFilter: 'all' | 'tasks' | 'habits';
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  navDirection: 'left' | 'right' | null;
  setNavDirection: (direction: 'left' | 'right' | null) => void;
  chillMode: boolean;
  setChillMode: (chill: boolean) => void;
  showCurrentTimeIndicator: boolean;
  setShowCurrentTimeIndicator: (show: boolean) => void;
  showCompletedTasks: boolean;
  setShowCompletedTasks: (show: boolean) => void;
  defaultView: 'day' | 'week';
  setDefaultView: (view: 'day' | 'week') => void;
  defaultTimeBucket: TimeBucket;
  setDefaultTimeBucket: (bucket: TimeBucket) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  weekStartDay: 'sunday' | 'monday' | 'saturday';
  setWeekStartDay: (day: 'sunday' | 'monday' | 'saturday') => void;
  timeFormat: '12h' | '24h';
  setTimeFormat: (format: '12h' | '24h') => void;
  /** IANA zone from user_settings (hydrated on login); use with chat timestamps, EOD, etc. */
  userTimezone: string | null;
  /** ID of the task/habit card currently under the mouse cursor — used by keyboard shortcuts */
  hoveredItemId: string | null;
  hoveredItemType: 'task' | 'habit' | null;
  setHoveredItem: (id: string | null, type: 'task' | 'habit' | null) => void;

  // Supabase state
  userId: string | null;
  isLoading: boolean;
  error: string | null;

  // Store lifecycle
  initializeStore: (userId: string) => Promise<void>;
  clearStore: () => void;

  // Task actions
  addTask: (task: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string, status?: TaskStatus, date?: Date) => void;
  scheduleTask: (id: string, bucket: TimeBucket, time?: string, date?: string) => void;
  assignTaskToBucket: (id: string, bucket: TimeBucket) => void;
  unscheduleTask: (id: string) => void;
  reorderTasks: (taskIds: string[]) => void;

  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'status' | 'completedDates' | 'skippedDates' | 'dailyCounts' | 'currentDayCount'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitStatus: (id: string, status: HabitStatus, count?: number, date?: Date) => void;
  scheduleHabit: (id: string, bucket: TimeBucket, time?: string) => void;
  assignHabitToBucket: (id: string, bucket: TimeBucket) => void;
  resetHabitStreak: (id: string) => void;

  // View actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  setTimelineItemFilter: (filter: 'all' | 'tasks' | 'habits') => void;

  // Project actions
  addProject: (name: string, emoji: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  getProjectEmoji: (name: string) => string;
  getProjectColor: (name: string) => string;
  getProject: (name: string) => Project | undefined;
  moveTaskToProjectBlock: (taskId: string) => void;
  moveTasksToProjectBlock: (taskIds: string[]) => void;
  moveTaskOutOfProjectBlock: (taskId: string) => void;

  // Habit group actions
  addHabitGroup: (name: string, emoji: string, color?: string) => void;
  updateHabitGroup: (id: string, updates: Partial<HabitGroupType>) => void;
  removeHabitGroup: (id: string) => void;
  getHabitGroupEmoji: (name: string) => string;
  getHabitGroupColor: (name: string) => string;

  // Cleanup orphaned references
  cleanupOrphanedReferences: () => void;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Action log for displaying undo/redo history
  actionLog: ActionLogEntry[];
  historyIndex: number;
  refreshActionLog: () => void;
}

// Projections: keep `tasks`/`habits` derived from `items` in the same set()
// so every consumer sees a consistent snapshot. TaskItem/HabitItem are
// structurally assignable to Task/Habit (the extra `type` key is inert).
const projectItems = (items: Item[]) => ({
  items,
  tasks: items.filter((i): i is TaskItem => i.type === 'task'),
  habits: items.filter((i): i is HabitItem => i.type === 'habit'),
});

// History management for undo/redo
interface HistoryState {
  items: Item[];
  projects: Project[];
  habitGroups: HabitGroupType[];
}

export type ActionLogEntry = {
  id: string;
  label: string;
  timestamp: number;
};

const MAX_HISTORY_SIZE = 50;
let historyStack: HistoryState[] = [];
let historyIndex = -1;
let isUndoRedoAction = false;
let actionLog: ActionLogEntry[] = [];
let pendingActionLabel: string | null = null;

// Set the label for the next action that will be saved to history
export const setNextActionLabel = (label: string) => {
  pendingActionLabel = label;
};

// Get the current action log
export const getActionLog = (): ActionLogEntry[] => {
  return [...actionLog].reverse(); // Most recent first
};

// Get the current history index for highlighting current position
export const getHistoryInfo = () => ({
  currentIndex: historyIndex,
  totalEntries: historyStack.length,
  actionLog: [...actionLog].reverse(),
});

const saveToHistory = (state: HistoryState) => {
  if (isUndoRedoAction) return;

  // If we're not at the end of history, truncate forward history
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
    actionLog = actionLog.slice(0, historyIndex + 1);
  }

  // Deep clone the state to avoid reference issues
  const snapshot: HistoryState = {
    items: JSON.parse(JSON.stringify(state.items)),
    projects: JSON.parse(JSON.stringify(state.projects)),
    habitGroups: JSON.parse(JSON.stringify(state.habitGroups)),
  };

  historyStack.push(snapshot);

  // Add action log entry
  actionLog.push({
    id: crypto.randomUUID(),
    label: pendingActionLabel || 'Unknown action',
    timestamp: Date.now(),
  });
  pendingActionLabel = null;

  // Limit history size
  if (historyStack.length > MAX_HISTORY_SIZE) {
    historyStack.shift();
    actionLog.shift();
  } else {
    historyIndex++;
  }
};

// Get appropriate bucket for a given time
const getBucketForTime = (time: string): TimeBucket => {
  const hour = parseInt(time.split(':')[0]);
  if (hour >= TIME_BUCKET_RANGES.morning.start && hour < TIME_BUCKET_RANGES.morning.end) {
    return 'morning';
  } else if (hour >= TIME_BUCKET_RANGES.afternoon.start && hour < TIME_BUCKET_RANGES.afternoon.end) {
    return 'afternoon';
  } else if (hour >= TIME_BUCKET_RANGES.evening.start || hour < 5) {
    return 'evening';
  }
  return 'anytime';
};

// A concrete start time overrides a mismatched bucket ('anytime' is exempt).
// Single home for the auto-correct rule that used to be copied six times.
const autoCorrectBucket = (
  time: string | undefined,
  bucket: TimeBucket | undefined,
): TimeBucket | undefined =>
  time && bucket && bucket !== 'anytime' ? getBucketForTime(time) : bucket;

// Per-type diff for undo/redo db sync — fields come from the schema-derived
// registry lists, so a new schema field can never silently drop out of sync.
const diffItem = (from: Item, to: Item): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const key of ITEM_TYPES[to.type].fields) {
    const a = (from as Record<string, unknown>)[key];
    const b = (to as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) patch[key] = b;
  }
  return patch;
};

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => {
      // ── Unified item engine (private) ──────────────────────────────────────
      const findItem = (id: string, type: ItemType): Item | undefined =>
        get().items.find((i) => i.id === id && i.type === type);

      /**
       * Optimistically apply `updates` to one item and persist. The type guard
       * is load-bearing: task actions called with a habit id (e.g. the sidebar
       * drop calling unscheduleTask for a habit) must stay a complete no-op,
       * exactly as when the kinds lived in separate arrays.
       *
       * Deliberate change from the pre-unification store: a store miss also
       * suppresses the DB write (old code issued it blindly, which could touch
       * soft-deleted trash rows).
       */
      const updateItemAction = (id: string, type: ItemType, updates: Partial<Task> | Partial<Habit>) => {
        if (!findItem(id, type)) return;
        set((state) => projectItems(
          state.items.map((i) => (i.id === id && i.type === type ? { ...i, ...updates } as Item : i)),
        ));
        dbUpdateItem(id, type, updates).catch(console.error);
      };

      const resolveDateStr = (date?: Date): string => {
        const userTimezone = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        return toDateStr(date ?? get().selectedDate, userTimezone);
      };

      return {
      ...projectItems([]),
      selectedDate: new Date(),
      viewMode: 'day',
      groupBy: 'none',
      filters: {},
      projects: [],
      habitGroups: [],
      timelineItemFilter: 'all' as const,
      actionLog: [] as ActionLogEntry[],
      historyIndex: -1,
      refreshActionLog: () => {
        const info = getHistoryInfo();
        set({ actionLog: info.actionLog, historyIndex: info.currentIndex });
      },
      compactMode: false,
      setCompactMode: (compact) => {
        set({ compactMode: compact });
        const userId = get().userId;
        if (userId) saveSettings(userId, { compact_mode: compact });
      },
      navDirection: null,
      setNavDirection: (direction) => set({ navDirection: direction }),
      chillMode: false,
      setChillMode: (chill) => {
        set({ chillMode: chill });
        const userId = get().userId;
        if (userId) saveSettings(userId, { chill_mode: chill });
      },
      showCurrentTimeIndicator: true,
      setShowCurrentTimeIndicator: (show) => {
        set({ showCurrentTimeIndicator: show });
        const userId = get().userId;
        if (userId) saveSettings(userId, { show_time_indicator: show });
      },
      showCompletedTasks: true,
      setShowCompletedTasks: (show) => {
        set({ showCompletedTasks: show });
        const userId = get().userId;
        if (userId) saveSettings(userId, { show_completed_tasks: show });
      },
      defaultView: 'day',
      setDefaultView: (view) => {
        set({ defaultView: view, viewMode: view });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_view: view });
      },
      defaultTimeBucket: 'anytime',
      setDefaultTimeBucket: (bucket) => {
        set({ defaultTimeBucket: bucket });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_time_bucket: bucket });
      },
      animationsEnabled: true,
      setAnimationsEnabled: (enabled) => {
        set({ animationsEnabled: enabled });
        const userId = get().userId;
        if (userId) saveSettings(userId, { animations_enabled: enabled });
      },
      weekStartDay: 'sunday',
      setWeekStartDay: (day) => {
        set({ weekStartDay: day });
        const userId = get().userId;
        if (userId) saveSettings(userId, { week_start_day: day });
      },
      timeFormat: '12h',
      setTimeFormat: (format) => {
        set({ timeFormat: format });
        const userId = get().userId;
        if (userId) saveSettings(userId, { time_format: format });
      },
      userTimezone: null,
      hoveredItemId: null,
      hoveredItemType: null,
      setHoveredItem: (id, type) => set({ hoveredItemId: id, hoveredItemType: type }),

      // Supabase state
      userId: null,
      isLoading: false,
      error: null,

      initializeStore: async (userId: string) => {
        // Block subscriber during initialization to prevent poisoned history entries
        isUpdatingUndoRedo = true;
        hasInitializedHistory = false;

        // Reset history for new session
        historyStack = [];
        historyIndex = -1;
        actionLog = [];
        prevStateJson = null;

        set({ userId, isLoading: true, error: null });

        try {
          const [items, projects, habitGroups] = await Promise.all([
            fetchItems(userId),
            fetchProjects(userId),
            fetchHabitGroups(userId),
          ]);

          const snapshot = { items, projects, habitGroups };

          // Manually push the initial state to history (session start)
          historyStack.push(JSON.parse(JSON.stringify(snapshot)));
          actionLog.push({
            id: crypto.randomUUID(),
            label: 'Session start',
            timestamp: Date.now(),
          });
          historyIndex = 0;

          // Set prevStateJson so the subscriber doesn't double-save
          prevStateJson = JSON.stringify(snapshot);

          isUpdatingUndoRedo = true;
          set({
            ...projectItems(items),
            projects,
            habitGroups,
            isLoading: false,
            canUndo: false,
            canRedo: false,
            actionLog: [...actionLog].reverse(),
            historyIndex: 0,
          });
          isUpdatingUndoRedo = false;
        } catch (err) {
          isUpdatingUndoRedo = false;
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load data',
          });
        }
      },

      clearStore: () => {
        historyStack = [];
        historyIndex = -1;
        actionLog = [];
        prevStateJson = null;

        isUpdatingUndoRedo = true;
        set({
          userId: null,
          ...projectItems([]),
          projects: [],
          habitGroups: [],
          isLoading: false,
          error: null,
          canUndo: false,
          canRedo: false,
          actionLog: [],
          historyIndex: -1,
          userTimezone: null,
        });
        isUpdatingUndoRedo = false;
      },

      addTask: (taskData) => {
        setNextActionLabel(`Add task: ${taskData.title}`);
        const timeBucket = autoCorrectBucket(taskData.startTime, taskData.timeBucket);

        const task: TaskItem = {
          ...taskData,
          type: 'task',
          timeBucket,
          id: crypto.randomUUID(),
          status: 'pending',
          isScheduled: !!timeBucket,
          order: get().tasks.length,
        };
        set((state) => projectItems([...state.items, task]));

        const userId = get().userId;
        if (userId) dbCreateItem(userId, task).catch(console.error);
      },

      updateTask: (id, updates) => {
        const task = findItem(id, 'task');
        setNextActionLabel(`Edit task: ${task?.title || 'Unknown'}`);

        const newUpdates = { ...updates };
        // Auto-correct bucket if start time changes
        if (updates.startTime && task) {
          const bucket = updates.timeBucket || task.timeBucket;
          const corrected = autoCorrectBucket(updates.startTime, bucket);
          if (corrected !== bucket) newUpdates.timeBucket = corrected;
        }

        updateItemAction(id, 'task', newUpdates);
      },

      deleteTask: (id) => {
        const task = findItem(id, 'task');
        setNextActionLabel(`Delete task: ${task?.title || 'Unknown'}`);
        if (!task) return;
        set((state) => projectItems(state.items.filter((i) => !(i.id === id && i.type === 'task'))));

        dbDeleteItem(id, 'task').catch(console.error);
      },

      toggleTaskStatus: (id, status?, date?) => {
        const task = findItem(id, 'task') as TaskItem | undefined;
        if (!task) return;

        if (isRecurring(task)) {
          // Per-date completion tracking — never change global status
          const dateStr = resolveDateStr(date);
          const alreadyDone = isCompletedOnDate(task, dateStr);
          const newCompletedDates = alreadyDone
            ? (task.completedDates ?? []).filter(d => d !== dateStr)
            : [...(task.completedDates ?? []), dateStr];

          setNextActionLabel(`${alreadyDone ? 'Uncomplete' : 'Complete'} task on ${dateStr}: ${task.title}`);
          set((state) => projectItems(
            state.items.map(i => i.id === id && i.type === 'task' ? { ...i, completedDates: newCompletedDates } : i),
          ));
          dbSetItemCompletion(id, 'task', dateStr, !alreadyDone).catch(console.error);
        } else {
          // One-off task — existing behavior unchanged
          const newStatus: TaskStatus = status ?? (task.status === 'completed' ? 'pending' : 'completed');
          setNextActionLabel(`${newStatus === 'completed' ? 'Complete' : 'Uncomplete'} task: ${task.title}`);
          updateItemAction(id, 'task', { status: newStatus });
        }
      },

      scheduleTask: (id, bucket, time, date) => {
        const task = findItem(id, 'task');
        setNextActionLabel(`Schedule task: ${task?.title || 'Unknown'}`);
        const finalBucket = autoCorrectBucket(time, bucket) ?? bucket;

        const updates: Partial<Task> = {
          isScheduled: true,
          timeBucket: finalBucket,
          startTime: time,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
          ...(date ? { startDate: date } : {}),
        };

        updateItemAction(id, 'task', updates);
      },

      assignTaskToBucket: (id, bucket) => {
        const task = findItem(id, 'task');
        setNextActionLabel(`Move task to ${bucket}: ${task?.title || 'Unknown'}`);
        const updates: Partial<Task> = {
          isScheduled: false,
          timeBucket: bucket,
          startTime: undefined,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
        };

        updateItemAction(id, 'task', updates);
      },

      unscheduleTask: (id) => {
        const task = findItem(id, 'task');
        if (!task) return; // habit ids no-op here by contract (sidebar drop)
        setNextActionLabel(`Unschedule task: ${task.title}`);
        updateItemAction(id, 'task', { isScheduled: false, timeBucket: undefined, startTime: undefined, startDate: undefined });
      },

      reorderTasks: (taskIds) => {
        setNextActionLabel('Reorder tasks');
        // Tasks absent from taskIds keep their current order — a partial list
        // (e.g. one filtered view) must never drop the rest of the store.
        const orderById = new Map(taskIds.map((id, index) => [id, index]));
        const changed: TaskItem[] = [];

        set((state) => projectItems(
          state.items.map((i) => {
            if (i.type !== 'task') return i;
            const order = orderById.get(i.id);
            if (order === undefined || order === i.order) return i;
            const updated = { ...i, order };
            changed.push(updated);
            return updated;
          }),
        ));

        changed.forEach((t) =>
          dbUpdateItem(t.id, 'task', { order: t.order }).catch(console.error)
        );
      },

      addHabit: (habitData) => {
        setNextActionLabel(`Add habit: ${habitData.title}`);
        const timeBucket = autoCorrectBucket(habitData.startTime, habitData.timeBucket);

        const habit: HabitItem = {
          ...habitData,
          type: 'habit',
          timeBucket,
          id: crypto.randomUUID(),
          streak: 0,
          status: 'pending',
          completedDates: [],
          skippedDates: [],
          dailyCounts: {},
          currentDayCount: 0,
        };
        set((state) => projectItems([...state.items, habit]));

        const userId = get().userId;
        if (userId) dbCreateItem(userId, habit).catch(console.error);
      },

      updateHabit: (id, updates) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Edit habit: ${habit?.title || 'Unknown'}`);

        const newUpdates = { ...updates };
        // Auto-correct bucket if start time changes
        if (updates.startTime && habit) {
          const bucket = updates.timeBucket || habit.timeBucket;
          const corrected = autoCorrectBucket(updates.startTime, bucket);
          if (corrected !== bucket) newUpdates.timeBucket = corrected;
        }

        updateItemAction(id, 'habit', newUpdates);
      },

      deleteHabit: (id) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Delete habit: ${habit?.title || 'Unknown'}`);
        if (!habit) return;
        set((state) => projectItems(state.items.filter((i) => !(i.id === id && i.type === 'habit'))));

        dbDeleteItem(id, 'habit').catch(console.error);
      },

      toggleHabitStatus: (id, status, count, date) => {
        const habit = findItem(id, 'habit') as HabitItem | undefined;
        if (!habit) return;
        const statusLabel = status === 'done' ? 'Complete' : status === 'skipped' ? 'Skip' : 'Reset';
        setNextActionLabel(`${statusLabel} habit: ${habit.title}`);
        const dateStr = resolveDateStr(date);

        const wasCompleted = habit.completedDates.includes(dateStr);
        const wasSkipped = (habit.skippedDates ?? []).includes(dateStr);
        let newCompletedDates = [...habit.completedDates];
        let newSkippedDates = [...(habit.skippedDates ?? [])];
        const newDailyCounts = { ...(habit.dailyCounts ?? {}) };
        let newStreak = habit.streak;

        // Completion goes through the intent-based atomic RPC: it sets the
        // desired end state for the date and owns the streak transition
        // server-side (streak moves only if the array actually changes), so
        // streak and completion history can't desync under partial failure,
        // stale clients, or rapid double-toggles. The optimistic values below
        // are UI-only; the companion update deliberately excludes
        // completedDates AND streak.
        if (status === 'done' && !wasCompleted) {
          newCompletedDates.push(dateStr);
          newStreak += 1;
        } else if (status !== 'done' && wasCompleted) {
          newCompletedDates = newCompletedDates.filter((d) => d !== dateStr);
          newStreak = Math.max(0, newStreak - 1);
        }

        if (status === 'skipped' && !wasSkipped) {
          newSkippedDates.push(dateStr);
        } else if (status !== 'skipped' && wasSkipped) {
          newSkippedDates = newSkippedDates.filter((d) => d !== dateStr);
        }

        if (count !== undefined) {
          newDailyCounts[dateStr] = count;
        }

        const optimistic: Partial<Habit> = {
          status,
          completedDates: newCompletedDates,
          skippedDates: newSkippedDates,
          dailyCounts: newDailyCounts,
          currentDayCount: count !== undefined ? count : habit.currentDayCount || 0,
          streak: newStreak,
        };

        set((state) => projectItems(
          state.items.map((i) => (i.id === id && i.type === 'habit' ? { ...i, ...optimistic } as Item : i)),
        ));

        dbSetItemCompletion(id, 'habit', dateStr, status === 'done').catch(console.error);
        const { completedDates: _cd, streak: _st, ...rest } = optimistic;
        dbUpdateItem(id, 'habit', rest).catch(console.error);
      },

      scheduleHabit: (id, bucket, time) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Schedule habit: ${habit?.title || 'Unknown'}`);
        const finalBucket = autoCorrectBucket(time, bucket) ?? bucket;
        updateItemAction(id, 'habit', { timeBucket: finalBucket, startTime: time });
      },

      assignHabitToBucket: (id, bucket) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Move habit to ${bucket}: ${habit?.title || 'Unknown'}`);
        updateItemAction(id, 'habit', { timeBucket: bucket, startTime: undefined });
      },

      resetHabitStreak: (id) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Reset streak: ${habit?.title || 'Unknown'}`);
        // Streak counter only — completedDates/dailyCounts are completion
        // history on unified items and must survive a streak reset. The
        // confirm dialog copy in edit-habit-dialog matches this wording.
        updateItemAction(id, 'habit', { streak: 0 });
      },

      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (viewMode) => {
        set({ viewMode, defaultView: viewMode });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_view: viewMode });
      },
      setGroupBy: (groupBy) => set({ groupBy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setTimelineItemFilter: (timelineItemFilter) => set({ timelineItemFilter }),

      addProject: (name, emoji) => {
        setNextActionLabel(`Add project: ${name}`);
        const alreadyExists = get().projects.some((p) => p.name === name);
        if (alreadyExists) return;

        const project: Project = { id: crypto.randomUUID(), name, emoji };
        set((state) => ({ projects: [...state.projects, project] }));

        const userId = get().userId;
        if (userId) dbCreateProject(userId, project).catch(console.error);
      },

      updateProject: (id, updates) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Edit project: ${project?.name || 'Unknown'}`);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateProject(userId, id, updates).catch(console.error);
      },

      removeProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Delete project: ${project?.name || 'Unknown'}`);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          ...projectItems(state.items.map((i) =>
            i.type === 'task' && i.project === project?.name ? { ...i, project: undefined } : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteProject(userId, id).catch(console.error);
      },

      getProjectEmoji: (name) => {
        const project = get().projects.find((p) => p.name === name);
        return project?.emoji || '';
      },

      getProjectColor: (name) => accentColorForName(name),

      getProject: (name) => {
        return get().projects.find((p) => p.name === name);
      },

      moveTaskToProjectBlock: (taskId) => {
        const moved = findItem(taskId, 'task');
        setNextActionLabel(`Move task into project block: ${moved?.title || 'Unknown'}`);
        const selectedDate = get().selectedDate;
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.items.find((i) => i.id === taskId && i.type === 'task') as TaskItem | undefined;
          if (!task || !task.project) return state;

          const project = state.projects.find((p) => p.name === task.project);
          if (!project || !project.startTime || !project.timeBucket) return state;

          taskUpdates = {
            inProjectBlock: true,
            previousStartTime: task.startTime,
            previousStartDate: task.startDate,
            startTime: undefined,
            timeBucket: project.timeBucket,
            isScheduled: true,
            startDate: selectedDateStr,
          };

          return projectItems(state.items.map((i) =>
            i.id === taskId && i.type === 'task' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, 'task', taskUpdates).catch(console.error);
      },

      moveTasksToProjectBlock: (taskIds) => {
        setNextActionLabel(`Move ${taskIds.length} tasks into project block`);
        const selectedDate = get().selectedDate;
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        const updatesMap = new Map<string, Partial<Task>>();

        set((state) => {
          const firstTask = state.items.find(
            (i): i is TaskItem => i.type === 'task' && taskIds.includes(i.id)
          );
          if (!firstTask || !firstTask.project) return state;

          const project = state.projects.find((p) => p.name === firstTask.project);
          if (!project || !project.startTime || !project.timeBucket) return state;

          return projectItems(state.items.map((i) => {
            if (i.type !== 'task' || !taskIds.includes(i.id)) return i;
            const updates: Partial<Task> = {
              inProjectBlock: true,
              previousStartTime: i.startTime,
              previousStartDate: i.startDate,
              startTime: undefined,
              timeBucket: project.timeBucket,
              isScheduled: true,
              startDate: selectedDateStr,
            };
            updatesMap.set(i.id, updates);
            return { ...i, ...updates } as Item;
          }));
        });

        updatesMap.forEach((updates, id) =>
          dbUpdateItem(id, 'task', updates).catch(console.error)
        );
      },

      moveTaskOutOfProjectBlock: (taskId) => {
        const moved = findItem(taskId, 'task');
        setNextActionLabel(`Move task out of project block: ${moved?.title || 'Unknown'}`);
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.items.find((i) => i.id === taskId && i.type === 'task') as TaskItem | undefined;
          if (!task) return state;
          taskUpdates = {
            inProjectBlock: false,
            startTime: task.previousStartTime,
            startDate: task.previousStartDate,
            previousStartTime: undefined,
            previousStartDate: undefined,
          };
          return projectItems(state.items.map((i) =>
            i.id === taskId && i.type === 'task' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, 'task', taskUpdates).catch(console.error);
      },

      addHabitGroup: (name, emoji, color) => {
        const normalized = name.toLowerCase();
        const alreadyExists = get().habitGroups.some((g) => g.name.toLowerCase() === normalized);
        if (alreadyExists) return;

        const group: HabitGroupType = { id: crypto.randomUUID(), name, emoji, color };
        set((state) => ({ habitGroups: [...state.habitGroups, group] }));

        const userId = get().userId;
        if (userId) dbCreateHabitGroup(userId, group).catch(console.error);
      },

      updateHabitGroup: (id, updates) => {
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateHabitGroup(userId, id, updates).catch(console.error);
      },

      removeHabitGroup: (id) => {
        const group = get().habitGroups.find((g) => g.id === id);
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.id !== id),
          ...projectItems(state.items.map((i) =>
            i.type === 'habit' && i.group === group?.name
              ? { ...i, group: state.habitGroups.find(g => g.id !== id)?.name || 'Personal' }
              : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteHabitGroup(userId, id).catch(console.error);
      },

      getHabitGroupEmoji: (name) => {
        const normalized = name.toLowerCase();
        const group = get().habitGroups.find((g) => g.name.toLowerCase() === normalized);
        return group?.emoji || '';
      },

      getHabitGroupColor: (name) => {
        const normalized = name.toLowerCase();
        const group = get().habitGroups.find((g) => g.name.toLowerCase() === normalized);
        if (group?.color) return group.color;

        // Theme-aware tokens (app/globals.css). Stored group.color above passes
        // through untouched — the DB column is free text, incl. legacy raw oklch.
        const colorMap: Record<string, string> = {
          wellness: 'var(--habit-wellness)',
          work: 'var(--habit-work)',
          personal: 'var(--habit-personal)',
        };
        if (colorMap[normalized]) return colorMap[normalized];

        return accentColorForName(normalized);
      },

      cleanupOrphanedReferences: () => {
        const state = get();
        const projectNames = new Set(state.projects.map(p => p.name));
        const groupNames = new Set(state.habitGroups.map(g => g.name));

        set(projectItems(state.items.map((i) => {
          if (i.type === 'task' && i.project && !projectNames.has(i.project)) {
            return { ...i, project: undefined };
          }
          if (i.type === 'habit' && !groupNames.has(i.group)) {
            return { ...i, group: state.habitGroups[0]?.name || 'Personal' };
          }
          return i;
        })));
      },

      // Undo/Redo
      canUndo: false,
      canRedo: false,

      undo: () => {
        if (historyIndex <= 0) return;

        const currentState = get();
        const userId = currentState.userId;

        isUndoRedoAction = true;
        historyIndex--;
        const prevState = historyStack[historyIndex];

        if (!prevState) {
          historyIndex++;
          isUndoRedoAction = false;
          return;
        }

        applyHistoryState(prevState, currentState, {
          canUndo: historyIndex > 0,
          canRedo: true,
        }, userId, set);

        isUndoRedoAction = false;
      },

      redo: () => {
        if (historyIndex >= historyStack.length - 1) return;

        const currentState = get();
        const userId = currentState.userId;

        isUndoRedoAction = true;
        historyIndex++;
        const nextState = historyStack[historyIndex];

        if (!nextState) {
          historyIndex--;
          isUndoRedoAction = false;
          return;
        }

        applyHistoryState(nextState, currentState, {
          canUndo: true,
          canRedo: historyIndex < historyStack.length - 1,
        }, userId, set);

        isUndoRedoAction = false;
      },
      };
    },
    {
      name: 'planner-storage',
      partialize: (state) => ({
        compactMode: state.compactMode,
        viewMode: state.viewMode,
        chillMode: state.chillMode,
        groupBy: state.groupBy,
        showCurrentTimeIndicator: state.showCurrentTimeIndicator,
        timelineItemFilter: state.timelineItemFilter,
        showCompletedTasks: state.showCompletedTasks,
        defaultView: state.defaultView,
        defaultTimeBucket: state.defaultTimeBucket,
        animationsEnabled: state.animationsEnabled,
        weekStartDay: state.weekStartDay,
        timeFormat: state.timeFormat,
      }),
    }
  )
);

/**
 * Restore a history snapshot into the store and sync the delta to the DB.
 * One generic path for both kinds (the old per-kind version synced habit
 * edits only when status changed — undoing a habit title edit never
 * persisted); items missing from one side restore or soft-delete.
 */
function applyHistoryState(
  target: HistoryState,
  currentState: { items: Item[]; projects: Project[]; habitGroups: HabitGroupType[] },
  flags: { canUndo: boolean; canRedo: boolean },
  userId: string | null,
  set: (partial: Partial<PlannerStore>) => void,
) {
  const restoredItems: Item[] = JSON.parse(JSON.stringify(target.items));
  const restoredProjects: Project[] = JSON.parse(JSON.stringify(target.projects));
  const restoredGroups: HabitGroupType[] = JSON.parse(JSON.stringify(target.habitGroups));

  const info = getHistoryInfo();
  set({
    ...projectItems(restoredItems),
    projects: restoredProjects,
    habitGroups: restoredGroups,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    actionLog: info.actionLog,
    historyIndex: info.currentIndex,
  });

  updatePrevStateBaseline({ items: restoredItems, projects: restoredProjects, habitGroups: restoredGroups });

  if (!userId) return;

  const key = (i: Item) => `${i.type}:${i.id}`;
  const currentById = new Map(currentState.items.map((i) => [key(i), i]));
  const restoredById = new Map(restoredItems.map((i) => [key(i), i]));

  restoredItems.forEach((item) => {
    const cur = currentById.get(key(item));
    if (!cur) {
      dbRestoreItem(item.id, item.type).catch(console.error);
      return;
    }
    const patch = diffItem(cur, item);
    // completedDates must never be written as an absolute array from a
    // snapshot — the live flow's set_item_completion RPC owns that column, and
    // a clobber here would race an in-flight completion. Replay the delta as
    // per-date intents instead (adjustStreak=false: the patch below restores
    // streak absolutely).
    if ('completedDates' in patch) {
      delete patch.completedDates;
      const curDates = new Set(cur.completedDates ?? []);
      const restoredDates = new Set(item.completedDates ?? []);
      restoredDates.forEach((d) => {
        if (!curDates.has(d)) dbSetItemCompletion(item.id, item.type, d, true, false).catch(console.error);
      });
      curDates.forEach((d) => {
        if (!restoredDates.has(d)) dbSetItemCompletion(item.id, item.type, d, false, false).catch(console.error);
      });
    }
    if (Object.keys(patch).length > 0) {
      dbUpdateItem(item.id, item.type, patch).catch(console.error);
    }
  });
  currentState.items.forEach((item) => {
    if (!restoredById.has(key(item))) dbDeleteItem(item.id, item.type).catch(console.error);
  });

  // Containers diff by id, never by name — names are mutable, and a name-keyed
  // set-diff turns a rename undo into a bogus restore/delete pair (the delete
  // half would soft-delete the only copy of the row).
  syncContainers(
    currentState.projects, restoredProjects, PROJECT_FIELDS,
    (id) => dbRestoreProject(userId, id),
    (id, patch) => dbUpdateProject(userId, id, patch),
    (id) => dbDeleteProject(userId, id),
  );
  syncContainers(
    currentState.habitGroups, restoredGroups, HABIT_GROUP_FIELDS,
    (id) => dbRestoreHabitGroup(userId, id),
    (id, patch) => dbUpdateHabitGroup(userId, id, patch),
    (id) => dbDeleteHabitGroup(userId, id),
  );
}

function syncContainers<T extends { id: string }>(
  current: T[],
  restored: T[],
  fields: readonly (keyof T & string)[],
  restore: (id: string) => Promise<void>,
  update: (id: string, patch: Partial<T>) => Promise<void>,
  remove: (id: string) => Promise<void>,
) {
  const currentById = new Map(current.map((c) => [c.id, c]));
  const restoredById = new Map(restored.map((c) => [c.id, c]));

  restored.forEach((r) => {
    const cur = currentById.get(r.id);
    if (!cur) {
      // The trashed row may have drifted from the snapshot (e.g. renamed
      // before deletion) — push the full restored shape after undeleting.
      restore(r.id).catch(console.error);
      const { id: _id, ...fullPatch } = r;
      update(r.id, fullPatch as Partial<T>).catch(console.error);
      return;
    }
    const patch: Partial<T> = {};
    for (const field of fields) {
      if (field === 'id') continue;
      if (JSON.stringify(cur[field]) !== JSON.stringify(r[field])) patch[field] = r[field];
    }
    if (Object.keys(patch).length > 0) update(r.id, patch).catch(console.error);
  });
  current.forEach((c) => {
    if (!restoredById.has(c.id)) remove(c.id).catch(console.error);
  });
}

// Subscribe to changes and save to history
let isUpdatingUndoRedo = false;
let hasInitializedHistory = false;

// Initialize prevStateJson eagerly with the store's initial state
// This captures the "before" state so we can properly undo the first action
const initialStoreState = usePlannerStore.getState();
let prevStateJson: string | null = JSON.stringify({
  items: initialStoreState.items,
  projects: initialStoreState.projects,
  habitGroups: initialStoreState.habitGroups,
});

// Function to update baseline from undo/redo actions
const updatePrevStateBaseline = (state: HistoryState) => {
  prevStateJson = JSON.stringify(state);
};

usePlannerStore.subscribe((state) => {
  if (isUndoRedoAction || isUpdatingUndoRedo) return;

  const currentState = {
    items: state.items,
    projects: state.projects,
    habitGroups: state.habitGroups,
  };

  const currentStateJson = JSON.stringify(currentState);

  // Initialize history with baseline state if not already done
  // This handles the case when no user is logged in (initializeStore not called)
  if (!hasInitializedHistory && historyStack.length === 0) {
    hasInitializedHistory = true;
    // Save the PREVIOUS state as baseline (captured before this change)
    const baselineState = prevStateJson ? JSON.parse(prevStateJson) : currentState;
    historyStack.push(JSON.parse(JSON.stringify(baselineState)));
    actionLog.push({
      id: crypto.randomUUID(),
      label: 'Session start',
      timestamp: Date.now(),
    });
    historyIndex = 0;
  }

  // Only save if data actually changed (not just view state)
  if (currentStateJson !== prevStateJson) {
    saveToHistory(currentState);
    // Update canUndo/canRedo and actionLog after saving (prevent recursive trigger)
    isUpdatingUndoRedo = true;
    const info = getHistoryInfo();
    usePlannerStore.setState({
      canUndo: historyIndex > 0,
      canRedo: false,
      actionLog: info.actionLog,
      historyIndex: info.currentIndex,
    });
    isUpdatingUndoRedo = false;
  }

  prevStateJson = currentStateJson;
});
