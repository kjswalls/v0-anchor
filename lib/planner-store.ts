'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
import { DEFAULT_PROJECTS, DEFAULT_HABIT_GROUPS, TIME_BUCKET_RANGES } from './planner-types';

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
  // Task actions
  addTask: (task: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  scheduleTask: (id: string, bucket: TimeBucket, time?: string) => void;
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

const generateId = () => Math.random().toString(36).substr(2, 9);

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
    id: generateId(),
    label: pendingActionLabel || 'Actions',
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

// Sample data for demonstration
const today = new Date();
const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Review project requirements',
    priority: 'high',
    project: 'Work',
    status: 'pending',
    isScheduled: true,
    timeBucket: 'morning',
    startTime: '09:00',
    startDate: today,
    duration: 60,
    repeatFrequency: 'weekdays',
    order: 0,
  },
  {
    id: '2',
    title: 'Meditation session',
    priority: 'medium',
    project: 'Wellness',
    status: 'pending',
    isScheduled: true,
    timeBucket: 'morning',
    startDate: today,
    duration: 20,
    order: 1,
  },
  {
    id: '3',
    title: 'Respond to emails',
    priority: 'low',
    project: 'Work',
    status: 'pending',
    isScheduled: false,
    startDate: today,
    order: 2,
  },
  {
    id: '4',
    title: 'Afternoon walk',
    priority: 'medium',
    project: 'Wellness',
    status: 'pending',
    isScheduled: true,
    timeBucket: 'afternoon',
    startTime: '14:00',
    startDate: today,
    duration: 30,
    order: 3,
  },
  {
    id: '5',
    title: 'Read a chapter',
    priority: 'low',
    project: 'Personal',
    status: 'pending',
    isScheduled: true,
    timeBucket: 'evening',
    startDate: today,
    duration: 45,
    order: 4,
  },
  {
    id: '6',
    title: 'Plan tomorrow',
    status: 'pending',
    isScheduled: false,
    startDate: today,
    order: 5,
  },
];

const initialHabits: Habit[] = [
  {
    id: 'h1',
    title: 'Morning stretch',
    group: 'wellness',
    streak: 12,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    timeBucket: 'morning',
    startTime: '07:00',
    repeatFrequency: 'daily',
    timesPerDay: 1,
    currentDayCount: 0,
  },
  {
    id: 'h2',
    title: 'Drink water',
    group: 'wellness',
    streak: 5,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    timeBucket: 'anytime',
    repeatFrequency: 'daily',
    timesPerDay: 8,
    currentDayCount: 0,
  },
  {
    id: 'h3',
    title: 'Daily standup',
    group: 'work',
    streak: 8,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    timeBucket: 'morning',
    startTime: '09:30',
    repeatFrequency: 'weekdays',
    timesPerDay: 1,
    currentDayCount: 0,
  },
  {
    id: 'h4',
    title: 'Journal',
    group: 'Personal',
    streak: 3,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    timeBucket: 'evening',
    repeatFrequency: 'daily',
    timesPerDay: 1,
    currentDayCount: 0,
  },
];

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => ({
      tasks: initialTasks,
      habits: initialHabits,
      selectedDate: new Date(),
      viewMode: 'day',
      groupBy: 'none',
      filters: {},
      projects: DEFAULT_PROJECTS,
      habitGroups: DEFAULT_HABIT_GROUPS,
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
      showCurrentTimeIndicator: false,
      setShowCurrentTimeIndicator: (show) => set({ showCurrentTimeIndicator: show }),
      hoveredItemId: null,
      hoveredItemType: null,
      setHoveredItem: (id, type) => set({ hoveredItemId: id, hoveredItemType: type }),
      
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
          id: generateId(),
          status: 'pending',
          isScheduled: !!timeBucket,
          order: get().tasks.length,
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
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
      },
      
      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Delete task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        }));
      },
      
      toggleTaskStatus: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        const newStatus = task?.status === 'completed' ? 'pending' : 'completed';
        setNextActionLabel(`${newStatus === 'completed' ? 'Complete' : 'Uncomplete'} task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
              : t
          ),
        }));
      },
      
      scheduleTask: (id, bucket, time) => {
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
        
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: true, timeBucket: finalBucket, startTime: time }
              : t
          ),
        }));
      },
      
      assignTaskToBucket: (id, bucket) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Move task to ${bucket}: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: false, timeBucket: bucket, startTime: undefined }
              : t
          ),
        }));
      },
      
      unscheduleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        setNextActionLabel(`Unschedule task: ${task?.title || 'Unknown'}`);
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: false, timeBucket: undefined, startTime: undefined }
              : t
          ),
        }));
      },
      
      reorderTasks: (taskIds) => {
        setNextActionLabel('Reorder tasks');
        set((state) => ({
          tasks: taskIds.map((id, index) => {
            const task = state.tasks.find((t) => t.id === id);
            return task ? { ...task, order: index } : null;
          }).filter(Boolean) as Task[],
        }));
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
          id: generateId(),
          streak: 0,
          status: 'pending',
          completedDates: [],
          skippedDates: [],
          dailyCounts: {},
          currentDayCount: 0,
        };
        set((state) => ({ habits: [...state.habits, habit] }));
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
      },
      
      deleteHabit: (id) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Delete habit: ${habit?.title || 'Unknown'}`);
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
      },
      
      toggleHabitStatus: (id, status, count, date) => {
        const habit = get().habits.find((h) => h.id === id);
        const statusLabel = status === 'done' ? 'Complete' : status === 'skipped' ? 'Skip' : 'Reset';
        setNextActionLabel(`${statusLabel} habit: ${habit?.title || 'Unknown'}`);
        const dateStr = getDateString(date ?? new Date());
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

            return {
              ...h,
              status,
              completedDates: newCompletedDates,
              skippedDates: newSkippedDates,
              dailyCounts: newDailyCounts,
              currentDayCount: count !== undefined ? count : h.currentDayCount || 0,
              streak: newStreak,
            };
          }),
        }));
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
        
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? { ...h, timeBucket: finalBucket, startTime: time }
              : h
          ),
        }));
      },
      
      assignHabitToBucket: (id, bucket) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Move habit to ${bucket}: ${habit?.title || 'Unknown'}`);
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? { ...h, timeBucket: bucket, startTime: undefined }
              : h
          ),
        }));
      },

      resetHabitStreak: (id) => {
        const habit = get().habits.find((h) => h.id === id);
        setNextActionLabel(`Reset streak: ${habit?.title || 'Unknown'}`);
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? { ...h, streak: 0, completedDates: [] }
              : h
          ),
        }));
      },
      
      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setTimelineItemFilter: (timelineItemFilter) => set({ timelineItemFilter }),
      
      addProject: (name, emoji) => {
        setNextActionLabel(`Add project: ${name}`);
        set((state) => ({
          projects: state.projects.some((p) => p.name === name)
            ? state.projects
            : [...state.projects, { name, emoji }],
        }));
      },

      updateProject: (name, updates) => {
        setNextActionLabel(`Edit project: ${name}`);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.name === name ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removeProject: (name) => {
        setNextActionLabel(`Delete project: ${name}`);
        set((state) => ({
          projects: state.projects.filter((p) => p.name !== name),
          // Also remove project from tasks
          tasks: state.tasks.map((t) => 
            t.project === name ? { ...t, project: undefined } : t
          ),
        }));
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
        set((state) => {
          const task = state.tasks.find((t) => t.id === taskId);
          if (!task || !task.project) return state;
          
          const project = state.projects.find((p) => p.name === task.project);
          if (!project || !project.startTime || !project.timeBucket) return state;
          
          return {
            tasks: state.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    inProjectBlock: true,
                    previousStartTime: t.startTime,
                    previousStartDate: t.startDate,
                    startTime: undefined, // Clear start time when in project block
                    timeBucket: project.timeBucket,
                    isScheduled: true,
                    startDate: selectedDate, // Always use selected date for project block
                  }
                : t
            ),
          };
        });
      },

      moveTasksToProjectBlock: (taskIds) => {
        const selectedDate = get().selectedDate;
        set((state) => {
          // Get the project from the first task
          const firstTask = state.tasks.find((t) => taskIds.includes(t.id));
          if (!firstTask || !firstTask.project) return state;
          
          const project = state.projects.find((p) => p.name === firstTask.project);
          if (!project || !project.startTime || !project.timeBucket) return state;
          
          return {
            tasks: state.tasks.map((t) =>
              taskIds.includes(t.id) && t.project === project.name
                ? {
                    ...t,
                    inProjectBlock: true,
                    previousStartTime: t.startTime,
                    previousStartDate: t.startDate,
                    startTime: undefined,
                    timeBucket: project.timeBucket,
                    isScheduled: true,
                    startDate: selectedDate, // Always use selected date for project block
                  }
                : t
            ),
          };
        });
      },

      moveTaskOutOfProjectBlock: (taskId) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  inProjectBlock: false,
                  startTime: t.previousStartTime,
                  startDate: t.previousStartDate,
                  previousStartTime: undefined,
                  previousStartDate: undefined,
                }
              : t
          ),
        }));
      },
      
      addHabitGroup: (name, emoji, color) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.some((g) => g.name.toLowerCase() === normalized)
            ? state.habitGroups
            : [...state.habitGroups, { name, emoji, color }],
        }));
      },

      updateHabitGroup: (name, updates) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.name.toLowerCase() === normalized ? { ...g, ...updates } : g
          ),
        }));
      },
      
      removeHabitGroup: (name) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.name.toLowerCase() !== normalized),
          // Move habits to first available group or 'Personal'
          habits: state.habits.map((h) => 
            h.group.toLowerCase() === normalized 
              ? { ...h, group: state.habitGroups.find(g => g.name.toLowerCase() !== normalized)?.name || 'Personal' } 
              : h
          ),
        }));
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
        
        // Update the baseline for the subscriber so it doesn't think this is a new change
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
        
        // Update the baseline for the subscriber so it doesn't think this is a new change
        updatePrevStateBaseline({ tasks: restoredTasks, habits: restoredHabits, projects: restoredProjects, habitGroups: restoredGroups });
        
        isUndoRedoAction = false;
      },
    }),
    {
      name: 'planner-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        habits: state.habits,
        projects: state.projects,
        habitGroups: state.habitGroups,
        groupBy: state.groupBy,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydrating, clean up orphaned references
        if (state) {
          setTimeout(() => state.cleanupOrphanedReferences(), 0);
          // Initialize history with current state
          setTimeout(() => {
            saveToHistory({
              tasks: state.tasks,
              habits: state.habits,
              projects: state.projects,
              habitGroups: state.habitGroups,
            });
          }, 100);
        }
      },
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
