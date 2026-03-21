'use client';
// v3 — constants moved to planner-constants.ts; sample data added
import { create } from 'zustand';
import type { Task, Habit, HabitStatus, Project, HabitGroupType, TimeBucket, GroupBy, FilterState, ViewMode, Priority, RepeatFrequency, ConfigurableBucketRanges } from './types';
import { DEFAULT_PROJECTS, DEFAULT_HABIT_GROUPS, DEFAULT_BUCKET_RANGES } from './types';
import { isSameDay } from 'date-fns';

// Get appropriate bucket for a given time
const getBucketForTime = (time: string, ranges = DEFAULT_BUCKET_RANGES): TimeBucket => {
  const hour = parseInt(time.split(':')[0]);
  const { morning, afternoon, evening } = ranges;
  if (hour >= morning.start && hour < morning.end) return 'morning';
  if (hour >= afternoon.start && hour < afternoon.end) return 'afternoon';
  // Evening can wrap midnight (end > 24)
  const eveningEndNorm = evening.end % 24;
  if (hour >= evening.start || (evening.end > 24 && hour < eveningEndNorm)) return 'evening';
  return 'anytime';
};

export interface PlannerStore {
  // Tasks & Habits
  tasks: Task[];
  habits: Habit[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  scheduleTask: (id: string, bucket: TimeBucket, startTime?: string) => void;
  unscheduleTask: (id: string) => void;
  addHabit: (habit: Habit) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitStatus: (id: string, status: HabitStatus) => void;
  scheduleHabit: (id: string, bucket: TimeBucket, startTime?: string) => void;
  resetHabitStreak: (id: string) => void;

  // UI State
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  groupBy: GroupBy;
  setGroupBy: (groupBy: GroupBy) => void;
  hoveredItemId: string | null;
  hoveredItemType: 'task' | 'habit' | null;
  setHoveredItem: (id: string | null, type: 'task' | 'habit' | null) => void;

  // Filters
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  timelineItemFilter: 'all' | 'tasks' | 'habits';
  setTimelineItemFilter: (filter: 'all' | 'tasks' | 'habits') => void;

  // Projects & Habit Groups
  projects: Project[];
  habitGroups: HabitGroupType[];
  addProject: (name: string, emoji: string) => void;
  removeProject: (name: string) => void;
  updateProject: (name: string, updates: Partial<Project>) => void;
  addHabitGroup: (group: HabitGroupType) => void;
  removeHabitGroup: (name: string) => void;
  getProjectEmoji: (projectName?: string) => string;
  getHabitGroupEmoji: (groupName: string) => string;
  getHabitGroupColor: (groupName: string) => string | undefined;
  getProject: (name?: string) => Project | undefined;

  // Movement
  moveTaskToProjectBlock: (taskId: string, projectName: string) => void;
  moveTaskOutOfProjectBlock: (taskId: string) => void;
  getProjectColor: (projectName: string) => string;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Appearance
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  chillMode: boolean;
  setChillMode: (chill: boolean) => void;
  showCurrentTimeIndicator: boolean;
  setShowCurrentTimeIndicator: (show: boolean) => void;
  bucketRanges: ConfigurableBucketRanges;
  setBucketRanges: (ranges: ConfigurableBucketRanges) => void;
}

// History for undo/redo
interface HistoryState {
  past: Array<{ tasks: Task[]; habits: Habit[] }>;
  future: Array<{ tasks: Task[]; habits: Habit[] }>;
}

export const usePlannerStore = create<PlannerStore>((set, get) => {
  const history: HistoryState = { past: [], future: [] };

  const pushHistory = () => {
    const { tasks, habits } = get();
    history.past.push({ tasks: [...tasks], habits: [...habits] });
    history.future = [];
    if (history.past.length > 50) history.past.shift();
  };

  return {
    // ---- Initial state ----
    tasks: [
      { id: 'sample-1', title: 'Review morning emails', priority: 'medium', project: 'Work', startDate: new Date(), status: 'pending', timeBucket: 'morning', startTime: '08:00', duration: 30, isScheduled: true, order: 0 },
      { id: 'sample-2', title: 'Team standup', priority: 'high', project: 'Work', startDate: new Date(), status: 'pending', timeBucket: 'morning', startTime: '09:30', duration: 30, isScheduled: true, order: 1 },
      { id: 'sample-3', title: 'Write project proposal', priority: 'high', project: 'Work', startDate: new Date(), status: 'pending', timeBucket: 'afternoon', startTime: '13:00', duration: 90, isScheduled: true, order: 2 },
      { id: 'sample-4', title: 'Grocery shopping', priority: 'low', project: 'Personal', startDate: new Date(), status: 'pending', timeBucket: 'afternoon', startTime: '15:30', duration: 45, isScheduled: true, order: 3 },
      { id: 'sample-5', title: 'Read 30 pages', priority: 'medium', project: 'Personal', startDate: new Date(), status: 'pending', timeBucket: 'evening', startTime: '20:00', duration: 45, isScheduled: true, order: 4 },
      { id: 'sample-6', title: 'Plan tomorrow', priority: 'medium', project: 'Work', startDate: new Date(), status: 'pending', timeBucket: 'anytime', isScheduled: false, order: 5 },
      { id: 'sample-7', title: 'Call dentist', priority: 'low', project: 'Personal', startDate: new Date(), status: 'pending', timeBucket: 'anytime', isScheduled: false, order: 6 },
    ],
    habits: [
      { id: 'habit-1', title: 'Morning run', group: 'Physical', streak: 5, status: 'pending', completedDates: [], timeBucket: 'morning', startTime: '07:00', repeatFrequency: 'daily' },
      { id: 'habit-2', title: 'Meditate 10 mins', group: 'Mental', streak: 12, status: 'pending', completedDates: [], timeBucket: 'morning', startTime: '07:45', repeatFrequency: 'daily' },
      { id: 'habit-3', title: 'Evening journal', group: 'Mental', streak: 3, status: 'pending', completedDates: [], timeBucket: 'evening', startTime: '21:00', repeatFrequency: 'daily' },
      { id: 'habit-4', title: 'Read non-fiction', group: 'Learning', streak: 8, status: 'pending', completedDates: [], timeBucket: 'evening', startTime: '21:30', repeatFrequency: 'daily' },
      { id: 'habit-5', title: 'Drink 2L water', group: 'Physical', streak: 21, status: 'pending', completedDates: [], timeBucket: 'anytime', repeatFrequency: 'daily' },
    ],
    selectedDate: new Date(),
    viewMode: 'day',
    groupBy: 'bucket',
    hoveredItemId: null,
    hoveredItemType: null,
    filters: {},
    timelineItemFilter: 'all',
    projects: [...DEFAULT_PROJECTS],
    habitGroups: [...DEFAULT_HABIT_GROUPS],
    compactMode: false,
    chillMode: false,
    showCurrentTimeIndicator: true,
    bucketRanges: DEFAULT_BUCKET_RANGES,
    canUndo: false,
    canRedo: false,

    // ---- Task operations ----
    addTask: (task) => {
      pushHistory();
      const newTask: Task = {
        id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: task.status || 'pending',
        isScheduled: task.isScheduled ?? !!(task.timeBucket && task.timeBucket !== 'anytime'),
        order: task.order ?? get().tasks.length,
        ...task,
      };
      set((state) => ({ tasks: [...state.tasks, newTask] }));
    },
    updateTask: (id, updates) => {
      pushHistory();
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    },
    deleteTask: (id) => {
      pushHistory();
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    },
    toggleTaskStatus: (id) => {
      pushHistory();
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id
            ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
            : t
        ),
      }));
    },
    scheduleTask: (id, bucket, startTime) => {
      pushHistory();
      const time = startTime || '09:00';
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                timeBucket: bucket,
                startTime: time,
                isScheduled: true,
              }
            : t
        ),
      }));
    },
    unscheduleTask: (id) => {
      pushHistory();
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id
            ? { ...t, timeBucket: undefined, startTime: undefined, isScheduled: false }
            : t
        ),
      }));
    },

    // ---- Habit operations ----
    addHabit: (habit) => {
      pushHistory();
      set((state) => ({ habits: [...state.habits, habit] }));
    },
    updateHabit: (id, updates) => {
      pushHistory();
      set((state) => ({
        habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates } : h)),
      }));
    },
    deleteHabit: (id) => {
      pushHistory();
      set((state) => ({ habits: state.habits.filter((h) => h.id !== id) }));
    },
    toggleHabitStatus: (id, status) => {
      pushHistory();
      const today = new Date().toISOString().split('T')[0];
      set((state) => ({
        habits: state.habits.map((h) => {
          if (h.id === id) {
            const alreadyLogged = h.completedDates.includes(today);
            return {
              ...h,
              status,
              completedDates: status === 'done' && !alreadyLogged ? [...h.completedDates, today] : h.completedDates,
              currentDayCount: status === 'done' ? (h.currentDayCount || 0) + 1 : Math.max(0, (h.currentDayCount || 0) - 1),
            };
          }
          return h;
        }),
      }));
    },
    scheduleHabit: (id, bucket, startTime) => {
      pushHistory();
      const time = startTime || '09:00';
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, timeBucket: bucket, startTime: time } : h
        ),
      }));
    },
    resetHabitStreak: (id) => {
      pushHistory();
      set((state) => ({
        habits: state.habits.map((h) =>
          h.id === id ? { ...h, streak: 0, currentDayCount: 0 } : h
        ),
      }));
    },

    // ---- UI State ----
    setSelectedDate: (date) => set({ selectedDate: date }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setGroupBy: (groupBy) => set({ groupBy }),
    setHoveredItem: (id, type) => set({ hoveredItemId: id, hoveredItemType: type }),

    // ---- Filters ----
    setFilters: (filters) => set({ filters }),
    clearFilters: () => set({ filters: {} }),
    setTimelineItemFilter: (filter) => set({ timelineItemFilter: filter }),

    // ---- Projects & Habit Groups ----
    addProject: (name, emoji) => {
      set((state) => ({
        projects: [...state.projects, { name, emoji }],
      }));
    },
    removeProject: (name) => {
      set((state) => ({
        projects: state.projects.filter((p) => p.name !== name),
      }));
    },
    updateProject: (name, updates) => {
      set((state) => ({
        projects: state.projects.map((p) =>
          p.name === name ? { ...p, ...updates } : p
        ),
      }));
    },
    addHabitGroup: (group) => {
      set((state) => ({
        habitGroups: [...state.habitGroups, group],
      }));
    },
    removeHabitGroup: (name) => {
      set((state) => ({
        habitGroups: state.habitGroups.filter((g) => g.name !== name),
      }));
    },
    getProjectEmoji: (projectName) => {
      if (!projectName) return '✨';
      return get().projects.find((p) => p.name === projectName)?.emoji || '✨';
    },
    getHabitGroupEmoji: (groupName) => {
      return get().habitGroups.find((g) => g.name === groupName)?.emoji || '🎯';
    },
    getHabitGroupColor: (groupName) => {
      return get().habitGroups.find((g) => g.name === groupName)?.color;
    },
    getProject: (name) => {
      if (!name) return undefined;
      return get().projects.find((p) => p.name === name);
    },

    // ---- Movement ----
    moveTaskToProjectBlock: (taskId, projectName) => {
      pushHistory();
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, project: projectName, inProjectBlock: true }
            : t
        ),
      }));
    },
    moveTaskOutOfProjectBlock: (taskId) => {
      pushHistory();
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, inProjectBlock: false } : t
        ),
      }));
    },
    getProjectColor: (projectName) => {
      const emoji = get().getProjectEmoji(projectName);
      const colorMap: Record<string, string> = {
        '✨': '#FFB6C1',
        '💼': '#87CEEB',
        '🏃': '#90EE90',
      };
      return colorMap[emoji] || '#E8E8E8';
    },

    // ---- Undo/Redo ----
    undo: () => {
      if (history.past.length > 0) {
        const prev = history.past.pop();
        if (prev) {
          history.future.push({ tasks: get().tasks, habits: get().habits });
          set({ tasks: prev.tasks, habits: prev.habits });
        }
      }
    },
    redo: () => {
      if (history.future.length > 0) {
        const next = history.future.pop();
        if (next) {
          history.past.push({ tasks: get().tasks, habits: get().habits });
          set({ tasks: next.tasks, habits: next.habits });
        }
      }
    },

    // ---- Appearance ----
    setCompactMode: (compact) => set({ compactMode: compact }),
    setChillMode: (chill) => set({ chillMode: chill }),
    setShowCurrentTimeIndicator: (show) => set({ showCurrentTimeIndicator: show }),
    setBucketRanges: (ranges) => set({ bucketRanges: ranges }),
  };
});
