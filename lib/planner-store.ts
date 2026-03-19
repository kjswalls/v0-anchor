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
  Priority,
  TaskStatus,
  HabitStatus,
  HabitGroup,
} from './planner-types';

interface PlannerStore {
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: string[];
  
  // Task actions
  addTask: (task: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  scheduleTask: (id: string, bucket: TimeBucket, time?: string) => void;
  unscheduleTask: (id: string) => void;
  reorderTasks: (taskIds: string[]) => void;
  
  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'status' | 'completedDates'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitStatus: (id: string, status: HabitStatus) => void;
  
  // View actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  
  // Project actions
  addProject: (name: string) => void;
  removeProject: (name: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const getDateString = (date: Date) => date.toISOString().split('T')[0];

// Sample data for demonstration
const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Review project requirements',
    priority: 'high',
    project: 'Work',
    status: 'pending',
    isScheduled: true,
    timeBucket: 'morning',
    scheduledTime: '09:00',
    duration: 60,
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
    duration: 45,
    order: 4,
  },
  {
    id: '6',
    title: 'Plan tomorrow',
    status: 'pending',
    isScheduled: false,
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
  },
  {
    id: 'h2',
    title: 'Drink water',
    group: 'wellness',
    streak: 5,
    status: 'done',
    completedDates: [getDateString(new Date())],
  },
  {
    id: 'h3',
    title: 'Daily standup',
    group: 'work',
    streak: 8,
    status: 'pending',
    completedDates: [],
  },
  {
    id: 'h4',
    title: 'Journal',
    group: 'personal',
    streak: 3,
    status: 'pending',
    completedDates: [],
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
      projects: ['Work', 'Wellness', 'Personal'],
      
      addTask: (taskData) => {
        const task: Task = {
          ...taskData,
          id: generateId(),
          status: 'pending',
          isScheduled: false,
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
              ? { ...t, isScheduled: true, timeBucket: bucket, scheduledTime: time }
              : t
          ),
        }));
      },
      
      unscheduleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, isScheduled: false, timeBucket: undefined, scheduledTime: undefined }
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
      
      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      
      addProject: (name) => {
        set((state) => ({
          projects: state.projects.includes(name)
            ? state.projects
            : [...state.projects, name],
        }));
      },
      
      removeProject: (name) => {
        set((state) => ({
          projects: state.projects.filter((p) => p !== name),
        }));
      },
    }),
    {
      name: 'planner-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        habits: state.habits,
        projects: state.projects,
        groupBy: state.groupBy,
      }),
    }
  )
);
