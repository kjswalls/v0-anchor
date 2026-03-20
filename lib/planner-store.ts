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
import { DEFAULT_PROJECTS, DEFAULT_HABIT_GROUPS } from './planner-types';

interface PlannerStore {
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: Project[];
  habitGroups: HabitGroupType[];
  
  // Task actions
  addTask: (task: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  scheduleTask: (id: string, bucket: TimeBucket, time?: string) => void;
  unscheduleTask: (id: string) => void;
  reorderTasks: (taskIds: string[]) => void;
  
  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'status' | 'completedDates' | 'currentDayCount'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitStatus: (id: string, status: HabitStatus) => void;
  scheduleHabit: (id: string, bucket: TimeBucket, time?: string) => void;
  resetHabitStreak: (id: string) => void;
  
  // View actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  
  // Project actions
  addProject: (name: string, emoji: string) => void;
  updateProject: (name: string, updates: Partial<Project>) => void;
  removeProject: (name: string) => void;
  getProjectEmoji: (name: string) => string;
  
  // Habit group actions
  addHabitGroup: (name: string, emoji: string) => void;
  updateHabitGroup: (name: string, updates: Partial<HabitGroupType>) => void;
  removeHabitGroup: (name: string) => void;
  getHabitGroupEmoji: (name: string) => string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const getDateString = (date: Date) => date.toISOString().split('T')[0];

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
    status: 'done',
    completedDates: [getDateString(new Date())],
    timeBucket: 'anytime',
    repeatFrequency: 'daily',
    timesPerDay: 8,
    currentDayCount: 3,
  },
  {
    id: 'h3',
    title: 'Daily standup',
    group: 'work',
    streak: 8,
    status: 'pending',
    completedDates: [],
    timeBucket: 'morning',
    startTime: '09:30',
    repeatFrequency: 'weekdays',
    timesPerDay: 1,
    currentDayCount: 0,
  },
  {
    id: 'h4',
    title: 'Journal',
    group: 'personal',
    streak: 3,
    status: 'pending',
    completedDates: [],
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
      
      addTask: (taskData) => {
        const task: Task = {
          ...taskData,
          id: generateId(),
          status: 'pending',
          isScheduled: !!taskData.timeBucket,
          order: get().tasks.length,
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
      },
      
      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },
      
      deleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        }));
      },
      
      toggleTaskStatus: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
              : t
          ),
        }));
      },
      
      scheduleTask: (id, bucket, time) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: true, timeBucket: bucket, startTime: time }
              : t
          ),
        }));
      },
      
      unscheduleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: false, timeBucket: undefined, startTime: undefined }
              : t
          ),
        }));
      },
      
      reorderTasks: (taskIds) => {
        set((state) => ({
          tasks: taskIds.map((id, index) => {
            const task = state.tasks.find((t) => t.id === id);
            return task ? { ...task, order: index } : null;
          }).filter(Boolean) as Task[],
        }));
      },
      
      addHabit: (habitData) => {
        const habit: Habit = {
          ...habitData,
          id: generateId(),
          streak: 0,
          status: 'pending',
          completedDates: [],
          currentDayCount: 0,
        };
        set((state) => ({ habits: [...state.habits, habit] }));
      },
      
      updateHabit: (id, updates) => {
        set((state) => ({
          habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates } : h)),
        }));
      },
      
      deleteHabit: (id) => {
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
      },
      
      toggleHabitStatus: (id, status) => {
        const today = getDateString(new Date());
        set((state) => ({
          habits: state.habits.map((h) => {
            if (h.id !== id) return h;
            
            const wasCompleted = h.completedDates.includes(today);
            let newCompletedDates = [...h.completedDates];
            let newStreak = h.streak;
            
            if (status === 'done' && !wasCompleted) {
              newCompletedDates.push(today);
              newStreak += 1;
            } else if (status !== 'done' && wasCompleted) {
              newCompletedDates = newCompletedDates.filter((d) => d !== today);
              newStreak = Math.max(0, newStreak - 1);
            }
            
            return {
              ...h,
              status,
              completedDates: newCompletedDates,
              streak: newStreak,
            };
          }),
        }));
      },
      
      scheduleHabit: (id, bucket, time) => {
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? { ...h, timeBucket: bucket, startTime: time }
              : h
          ),
        }));
      },

      resetHabitStreak: (id) => {
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
      
      addProject: (name, emoji) => {
        set((state) => ({
          projects: state.projects.some((p) => p.name === name)
            ? state.projects
            : [...state.projects, { name, emoji }],
        }));
      },

      updateProject: (name, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.name === name ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removeProject: (name) => {
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
        return project?.emoji || '📋';
      },
      
      addHabitGroup: (name, emoji) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.some((g) => g.name === normalized)
            ? state.habitGroups
            : [...state.habitGroups, { name: normalized, emoji }],
        }));
      },

      updateHabitGroup: (name, updates) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.name === normalized ? { ...g, ...updates } : g
          ),
        }));
      },
      
      removeHabitGroup: (name) => {
        const normalized = name.toLowerCase();
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.name !== normalized),
          // Move habits to 'personal' group
          habits: state.habits.map((h) => 
            h.group === normalized ? { ...h, group: 'personal' } : h
          ),
        }));
      },

      getHabitGroupEmoji: (name) => {
        const normalized = name.toLowerCase();
        const group = get().habitGroups.find((g) => g.name === normalized);
        return group?.emoji || '⭐';
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
    }
  )
);
