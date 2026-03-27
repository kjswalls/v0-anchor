'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import type {
  Task,
  Habit,
  ViewMode,
  GroupBy,
  FilterState,
  TimeBucket,
  TaskStatus,
  HabitStatus,
  RepeatFrequency,
  Project,
  HabitGroupType,
} from './planner-types';
import { TIME_BUCKET_RANGES } from './planner-types';
import {
  fetchTasks,
  fetchHabits,
  fetchProjects,
  fetchHabitGroups,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  createHabit as dbCreateHabit,
  updateHabit as dbUpdateHabit,
  deleteHabit as dbDeleteHabit,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  createHabitGroup as dbCreateHabitGroup,
  updateHabitGroup as dbUpdateHabitGroup,
  deleteHabitGroup as dbDeleteHabitGroup,
} from './db';

interface PlannerStore {
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
  toggleTaskStatus: (id: string) => void;
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
  updateProject: (name: string, updates: Partial<Project>) => void;
  removeProject: (name: string) => void;
  getProjectEmoji: (name: string) => string;
  getProjectColor: (name: string) => string;
  getProject: (name: string) => Project | undefined;
  moveTaskToProjectBlock: (taskId: string) => void;
  moveTasksToProjectBlock: (taskIds: string[]) => void;
  moveTaskOutOfProjectBlock: (taskId: string) => void;

  // Habit group actions
  addHabitGroup: (name: string, emoji: string, color?: string) => void;
  updateHabitGroup: (name: string, updates: Partial<HabitGroupType>) => void;
  removeHabitGroup: (name: string) => void;
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

const getDateString = (date: Date) => date.toISOString().split('T')[0];

// History management for undo/redo
interface HistoryState {
  tasks: Task[];
  habits: Habit[];
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
    tasks: JSON.parse(JSON.stringify(state.tasks)),
    habits: JSON.parse(JSON.stringify(state.habits)),
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

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      habits: [],
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
      setCompactMode: (compact) => set({ compactMode: compact }),
      navDirection: null,
      setNavDirection: (direction) => set({ navDirection: direction }),
      chillMode: false,
      setChillMode: (chill) => set({ chillMode: chill }),
      showCurrentTimeIndicator: true,
      setShowCurrentTimeIndicator: (show) => set({ showCurrentTimeIndicator: show }),
      hoveredItemId: null,
      hoveredItemType: null,
      setHoveredItem: (id, type) => set({ hoveredItemId: id, hoveredItemType: type }),

      // Supabase state
      userId: null,
      isLoading: false,
      error: null,

      initializeStore: async (userId: string) => {
        // Reset history for new session
        historyStack = [];
        historyIndex = -1;
        actionLog = [];
        prevStateJson = null;

        set({ userId, isLoading: true, error: null });

        try {
          const [tasks, habits, projects, habitGroups] = await Promise.all([
            fetchTasks(userId),
            fetchHabits(userId),
            fetchProjects(userId),
            fetchHabitGroups(userId),
          ]);

          const snapshot = { tasks, habits, projects, habitGroups };

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
            tasks,
            habits,
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
          tasks: [],
          habits: [],
          projects: [],
          habitGroups: [],
          isLoading: false,
          error: null,
          canUndo: false,
          canRedo: false,
          actionLog: [],
          historyIndex: -1,
        });
        isUpdatingUndoRedo = false;
      },

      addTask: (taskData) => {
        setNextActionLabel(`Add task: ${taskData.title}`);
        // Auto-correct bucket based on start time
        let timeBucket = taskData.timeBucket;
        if (taskData.startTime && timeBucket && timeBucket !== 'anytime') {
          const correctBucket = getBucketForTime(taskData.startTime);
          if (correctBucket !== timeBucket) {
            timeBucket = correctBucket;
          }
        }

        const task: Task = {
          ...taskData,
          timeBucket,
          id: crypto.randomUUID(),
          status: 'pending',
          isScheduled: !!timeBucket,
          order: get().tasks.length,
        };
        set((state) => ({ tasks: [...state.tasks, task] }));

        const userId = get().userId;
        if (userId) dbCreateTask(userId, task).catch(console.error);
      },

      updateTask: (id, updates) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Edit task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== id) return t;

            let newUpdates = { ...updates };

            // Auto-correct bucket if start time changes
            if (updates.startTime && (t.timeBucket || updates.timeBucket)) {
              const bucket = updates.timeBucket || t.timeBucket;
              if (bucket && bucket !== 'anytime') {
                const correctBucket = getBucketForTime(updates.startTime);
                if (correctBucket !== bucket) {
                  newUpdates.timeBucket = correctBucket;
                }
              }
            }

            return { ...t, ...newUpdates };
          }),
        }));

        dbUpdateTask(id, updates).catch(console.error);
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Delete task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        }));

        dbDeleteTask(id).catch(console.error);
      },

      toggleTaskStatus: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        const newStatus: TaskStatus = task?.status === 'completed' ? 'pending' : 'completed';
        setNextActionLabel(`${newStatus === 'completed' ? 'Complete' : 'Uncomplete'} task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
              : t
          ),
        }));

        dbUpdateTask(id, { status: newStatus }).catch(console.error);
      },

      scheduleTask: (id, bucket, time, date) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Schedule task: ${task?.title || 'Unknown'}`);
        // Auto-correct bucket based on time
        let finalBucket = bucket;
        if (time && bucket !== 'anytime') {
          const correctBucket = getBucketForTime(time);
          if (correctBucket !== bucket) {
            finalBucket = correctBucket;
          }
        }

        const updates: Partial<Task> = {
          isScheduled: true,
          timeBucket: finalBucket,
          startTime: time,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
          ...(date ? { startDate: date } : {}),
        };

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));

        dbUpdateTask(id, updates).catch(console.error);
      },

      assignTaskToBucket: (id, bucket) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Move task to ${bucket}: ${task?.title || 'Unknown'}`);
        const updates: Partial<Task> = {
          isScheduled: false,
          timeBucket: bucket,
          startTime: undefined,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
        };

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));

        dbUpdateTask(id, updates).catch(console.error);
      },

      unscheduleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Unschedule task: ${task?.title || 'Unknown'}`);
        const updates: Partial<Task> = { isScheduled: false, timeBucket: undefined, startTime: undefined, startDate: undefined };

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));

        dbUpdateTask(id, updates).catch(console.error);
      },

      reorderTasks: (taskIds) => {
        setNextActionLabel('Reorder tasks');
        const updatedTasks = taskIds.map((id, index) => {
          const task = get().tasks.find((t) => t.id === id);
          return task ? { ...task, order: index } : null;
        }).filter(Boolean) as Task[];

        set({ tasks: updatedTasks });

        updatedTasks.forEach((t) =>
          dbUpdateTask(t.id, { order: t.order }).catch(console.error)
        );
      },

      addHabit: (habitData) => {
        setNextActionLabel(`Add habit: ${habitData.title}`);
        // Auto-correct bucket based on start time
        let timeBucket = habitData.timeBucket;
        if (habitData.startTime && timeBucket && timeBucket !== 'anytime') {
          const correctBucket = getBucketForTime(habitData.startTime);
          if (correctBucket !== timeBucket) {
            timeBucket = correctBucket;
          }
        }

        const habit: Habit = {
          ...habitData,
          timeBucket,
          id: crypto.randomUUID(),
          streak: 0,
          status: 'pending',
          completedDates: [],
          skippedDates: [],
          dailyCounts: {},
          currentDayCount: 0,
        };
        set((state) => ({ habits: [...state.habits, habit] }));

        const userId = get().userId;
        if (userId) dbCreateHabit(userId, habit).catch(console.error);
      },

      updateHabit: (id, updates) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Edit habit: ${habit?.title || 'Unknown'}`);
        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== id) return h;

            let newUpdates = { ...updates };

            // Auto-correct bucket if start time changes
            if (updates.startTime && (h.timeBucket || updates.timeBucket)) {
              const bucket = updates.timeBucket || h.timeBucket;
              if (bucket && bucket !== 'anytime') {
                const correctBucket = getBucketForTime(updates.startTime);
                if (correctBucket !== bucket) {
                  newUpdates.timeBucket = correctBucket;
                }
              }
            }

            return { ...h, ...newUpdates };
          }),
        }));

        dbUpdateHabit(id, updates).catch(console.error);
      },

      deleteHabit: (id) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Delete habit: ${habit?.title || 'Unknown'}`);
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));

        dbDeleteHabit(id).catch(console.error);
      },

      toggleHabitStatus: (id, status, count, date) => {
        const habit = get().habits.find((h) => h.id === id);
        const statusLabel = status === 'done' ? 'Complete' : status === 'skipped' ? 'Skip' : 'Reset';
        setNextActionLabel(`${statusLabel} habit: ${habit?.title || 'Unknown'}`);
        const dateStr = getDateString(date ?? new Date());

        let updatedHabit: Habit | null = null;

        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== id) return h;

            const wasCompleted = h.completedDates.includes(dateStr);
            const wasSkipped = (h.skippedDates ?? []).includes(dateStr);
            let newCompletedDates = [...h.completedDates];
            let newSkippedDates = [...(h.skippedDates ?? [])];
            let newDailyCounts = { ...(h.dailyCounts ?? {}) };
            let newStreak = h.streak;

            // Update completedDates
            if (status === 'done' && !wasCompleted) {
              newCompletedDates.push(dateStr);
              newStreak += 1;
            } else if (status !== 'done' && wasCompleted) {
              newCompletedDates = newCompletedDates.filter((d) => d !== dateStr);
              newStreak = Math.max(0, newStreak - 1);
            }

            // Update skippedDates
            if (status === 'skipped' && !wasSkipped) {
              newSkippedDates.push(dateStr);
            } else if (status !== 'skipped' && wasSkipped) {
              newSkippedDates = newSkippedDates.filter((d) => d !== dateStr);
            }

            // Update dailyCounts for multi-complete habits
            if (count !== undefined) {
              newDailyCounts[dateStr] = count;
            }

            updatedHabit = {
              ...h,
              status,
              completedDates: newCompletedDates,
              skippedDates: newSkippedDates,
              dailyCounts: newDailyCounts,
              currentDayCount: count !== undefined ? count : h.currentDayCount || 0,
              streak: newStreak,
            };
            return updatedHabit;
          }),
        }));

        if (updatedHabit) {
          dbUpdateHabit(id, {
            status: (updatedHabit as Habit).status,
            completedDates: (updatedHabit as Habit).completedDates,
            skippedDates: (updatedHabit as Habit).skippedDates,
            dailyCounts: (updatedHabit as Habit).dailyCounts,
            currentDayCount: (updatedHabit as Habit).currentDayCount,
            streak: (updatedHabit as Habit).streak,
          }).catch(console.error);
        }
      },

      scheduleHabit: (id, bucket, time) => {
        // Auto-correct bucket based on time
        let finalBucket = bucket;
        if (time && bucket !== 'anytime') {
          const correctBucket = getBucketForTime(time);
          if (correctBucket !== bucket) {
            finalBucket = correctBucket;
          }
        }

        const updates: Partial<Habit> = { timeBucket: finalBucket, startTime: time };

        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, ...updates } : h
          ),
        }));

        dbUpdateHabit(id, updates).catch(console.error);
      },

      assignHabitToBucket: (id, bucket) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Move habit to ${bucket}: ${habit?.title || 'Unknown'}`);
        const updates: Partial<Habit> = { timeBucket: bucket, startTime: undefined };

        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, ...updates } : h
          ),
        }));

        dbUpdateHabit(id, updates).catch(console.error);
      },

      resetHabitStreak: (id) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Reset streak: ${habit?.title || 'Unknown'}`);
        const updates: Partial<Habit> = { streak: 0, completedDates: [] };

        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, ...updates } : h
          ),
        }));

        dbUpdateHabit(id, updates).catch(console.error);
      },

      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setTimelineItemFilter: (timelineItemFilter) => set({ timelineItemFilter }),

      addProject: (name, emoji) => {
        setNextActionLabel(`Add project: ${name}`);
        const alreadyExists = get().projects.some((p) => p.name === name);
        if (alreadyExists) return;

        const project: Project = { name, emoji };
        set((state) => ({ projects: [...state.projects, project] }));

        const userId = get().userId;
        if (userId) dbCreateProject(userId, project).catch(console.error);
      },

      updateProject: (name, updates) => {
        setNextActionLabel(`Edit project: ${name}`);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.name === name ? { ...p, ...updates } : p
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateProject(userId, name, updates).catch(console.error);
      },

      removeProject: (name) => {
        setNextActionLabel(`Delete project: ${name}`);
        set((state) => ({
          projects: state.projects.filter((p) => p.name !== name),
          tasks: state.tasks.map((t) =>
            t.project === name ? { ...t, project: undefined } : t
          ),
        }));

        const userId = get().userId;
        if (userId) dbDeleteProject(userId, name).catch(console.error);
      },

      getProjectEmoji: (name) => {
        const project = get().projects.find((p) => p.name === name);
        return project?.emoji || '';
      },

      getProjectColor: (name) => {
        // Generate consistent color from project name
        const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hues = [200, 150, 280, 30, 340]; // blue, teal, purple, orange, pink
        return `oklch(0.7 0.15 ${hues[hash % hues.length]})`;
      },

      getProject: (name) => {
        return get().projects.find((p) => p.name === name);
      },

      moveTaskToProjectBlock: (taskId) => {
        const selectedDate = get().selectedDate;
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.tasks.find((t) => t.id === taskId);
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

          return {
            tasks: state.tasks.map((t) =>
              t.id === taskId ? { ...t, ...taskUpdates! } : t
            ),
          };
        });

        if (taskUpdates) dbUpdateTask(taskId, taskUpdates).catch(console.error);
      },

      moveTasksToProjectBlock: (taskIds) => {
        const selectedDate = get().selectedDate;
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        const updatesMap = new Map<string, Partial<Task>>();

        set((state) => {
          const firstTask = state.tasks.find(t => taskIds.includes(t.id));
          if (!firstTask || !firstTask.project) return state;

          const project = state.projects.find((p) => p.name === firstTask.project);
          if (!project || !project.startTime || !project.timeBucket) return state;

          return {
            tasks: state.tasks.map((t) => {
              if (!taskIds.includes(t.id)) return t;
              const updates: Partial<Task> = {
                inProjectBlock: true,
                previousStartTime: t.startTime,
                previousStartDate: t.startDate,
                startTime: undefined,
                timeBucket: project.timeBucket,
                isScheduled: true,
                startDate: selectedDateStr,
              };
              updatesMap.set(t.id, updates);
              return { ...t, ...updates };
            }),
          };
        });

        updatesMap.forEach((updates, id) =>
          dbUpdateTask(id, updates).catch(console.error)
        );
      },

      moveTaskOutOfProjectBlock: (taskId) => {
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.tasks.find(t => t.id === taskId);
          if (!task) return state;
          taskUpdates = {
            inProjectBlock: false,
            startTime: task.previousStartTime,
            startDate: task.previousStartDate,
            previousStartTime: undefined,
            previousStartDate: undefined,
          };
          return {
            tasks: state.tasks.map((t) =>
              t.id === taskId ? { ...t, ...taskUpdates! } : t
            ),
          };
        });

        if (taskUpdates) dbUpdateTask(taskId, taskUpdates).catch(console.error);
      },

      addHabitGroup: (name, emoji, color) => {
        const normalized = name.toLowerCase();
        const alreadyExists = get().habitGroups.some((g) => g.name.toLowerCase() === normalized);
        if (alreadyExists) return;

        const group: HabitGroupType = { name, emoji, color };
        set((state) => ({ habitGroups: [...state.habitGroups, group] }));

        const userId = get().userId;
        if (userId) dbCreateHabitGroup(userId, group).catch(console.error);
      },

      updateHabitGroup: (name, updates) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.name.toLowerCase() === normalized ? { ...g, ...updates } : g
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateHabitGroup(userId, name, updates).catch(console.error);
      },

      removeHabitGroup: (name) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.name.toLowerCase() !== normalized),
          habits: state.habits.map((h) =>
            h.group.toLowerCase() === normalized
              ? { ...h, group: state.habitGroups.find(g => g.name.toLowerCase() !== normalized)?.name || 'Personal' }
              : h
          ),
        }));

        const userId = get().userId;
        if (userId) dbDeleteHabitGroup(userId, name).catch(console.error);
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

        // Generate consistent color from group name
        const colorMap: Record<string, string> = {
          wellness: 'oklch(0.7 0.15 160)',
          work: 'oklch(0.65 0.15 250)',
          personal: 'oklch(0.7 0.15 320)',
        };
        if (colorMap[normalized]) return colorMap[normalized];

        const hash = normalized.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hues = [160, 250, 320, 30, 200]; // teal, blue, pink, orange, cyan
        return `oklch(0.7 0.15 ${hues[hash % hues.length]})`;
      },

      cleanupOrphanedReferences: () => {
        const state = get();
        const projectNames = new Set(state.projects.map(p => p.name));
        const groupNames = new Set(state.habitGroups.map(g => g.name));

        set({
          tasks: state.tasks.map(t =>
            t.project && !projectNames.has(t.project)
              ? { ...t, project: undefined }
              : t
          ),
          habits: state.habits.map(h =>
            !groupNames.has(h.group)
              ? { ...h, group: state.habitGroups[0]?.name || 'Personal' }
              : h
          ),
        });
      },

      // Undo/Redo
      canUndo: false,
      canRedo: false,

      undo: () => {
        if (historyIndex <= 0) return;

        isUndoRedoAction = true;
        historyIndex--;
        const prevState = historyStack[historyIndex];

        const restoredTasks = JSON.parse(JSON.stringify(prevState.tasks));
        const restoredHabits = JSON.parse(JSON.stringify(prevState.habits));
        const restoredProjects = JSON.parse(JSON.stringify(prevState.projects));
        const restoredGroups = JSON.parse(JSON.stringify(prevState.habitGroups));

        const info = getHistoryInfo();
        set({
          tasks: restoredTasks,
          habits: restoredHabits,
          projects: restoredProjects,
          habitGroups: restoredGroups,
          canUndo: historyIndex > 0,
          canRedo: true,
          actionLog: info.actionLog,
          historyIndex: info.currentIndex,
        });

        updatePrevStateBaseline({ tasks: restoredTasks, habits: restoredHabits, projects: restoredProjects, habitGroups: restoredGroups });

        isUndoRedoAction = false;
      },

      redo: () => {
        if (historyIndex >= historyStack.length - 1) return;

        isUndoRedoAction = true;
        historyIndex++;
        const nextState = historyStack[historyIndex];

        const restoredTasks = JSON.parse(JSON.stringify(nextState.tasks));
        const restoredHabits = JSON.parse(JSON.stringify(nextState.habits));
        const restoredProjects = JSON.parse(JSON.stringify(nextState.projects));
        const restoredGroups = JSON.parse(JSON.stringify(nextState.habitGroups));

        const info = getHistoryInfo();
        set({
          tasks: restoredTasks,
          habits: restoredHabits,
          projects: restoredProjects,
          habitGroups: restoredGroups,
          canUndo: true,
          canRedo: historyIndex < historyStack.length - 1,
          actionLog: info.actionLog,
          historyIndex: info.currentIndex,
        });

        updatePrevStateBaseline({ tasks: restoredTasks, habits: restoredHabits, projects: restoredProjects, habitGroups: restoredGroups });

        isUndoRedoAction = false;
      },
    }),
    {
      name: 'planner-storage',
      partialize: (state) => ({
        compactMode: state.compactMode,
        viewMode: state.viewMode,
        chillMode: state.chillMode,
        groupBy: state.groupBy,
        showCurrentTimeIndicator: state.showCurrentTimeIndicator,
        timelineItemFilter: state.timelineItemFilter,
      }),
    }
  )
);

// Subscribe to changes and save to history
let prevStateJson: string | null = null;
let isUpdatingUndoRedo = false;

// Function to update baseline from undo/redo actions
const updatePrevStateBaseline = (state: { tasks: Task[]; habits: Habit[]; projects: Project[]; habitGroups: HabitGroupType[] }) => {
  prevStateJson = JSON.stringify(state);
};

usePlannerStore.subscribe((state) => {
  if (isUndoRedoAction || isUpdatingUndoRedo) return;

  const currentState = {
    tasks: state.tasks,
    habits: state.habits,
    projects: state.projects,
    habitGroups: state.habitGroups,
  };

  const currentStateJson = JSON.stringify(currentState);

  // Only save if data actually changed (not just view state)
  if (prevStateJson && currentStateJson !== prevStateJson) {
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
