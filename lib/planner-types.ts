export type Priority = 'low' | 'medium' | 'high';
export type TimeBucket = 'anytime' | 'morning' | 'afternoon' | 'evening';
export type TaskStatus = 'pending' | 'completed' | 'cancelled';
export type HabitStatus = 'pending' | 'done' | 'skipped';
export type HabitGroup = 'wellness' | 'work' | 'personal';
export type ViewMode = 'day' | 'week';
export type GroupBy = 'none' | 'project' | 'priority' | 'bucket' | 'status';
export type FilterType = 'project' | 'priority' | 'dueDate' | 'repeat' | 'status';
export type RepeatFrequency = 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'custom';

export interface Task {
  id: string;
  title: string;
  priority?: Priority;
  project?: string;
  dueDate?: Date;
  status: TaskStatus;
  timeBucket?: TimeBucket;
  scheduledTime?: string; // HH:mm format
  duration?: number; // in minutes
  isScheduled: boolean;
  repeat?: 'daily' | 'weekly' | 'monthly';
  order: number;
}

export interface Habit {
  id: string;
  title: string;
  group: HabitGroup;
  streak: number;
  status: HabitStatus;
  completedDates: string[]; // ISO date strings
  timeBucket?: TimeBucket;
  scheduledTime?: string; // HH:mm format
  // Repeat configuration
  repeatFrequency: RepeatFrequency;
  repeatDays?: number[]; // 0-6 for custom weekly (0 = Sunday)
  timesPerDay?: number; // for habits that need to be done multiple times
  currentDayCount?: number; // how many times completed today
}

export interface FilterState {
  project?: string;
  priority?: Priority;
  dueDate?: 'today' | 'week' | 'overdue' | 'none';
  repeat?: boolean;
  status?: TaskStatus;
}

export interface PlannerState {
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: string[];
}

export const TIME_BUCKET_RANGES: Record<TimeBucket, { start: number; end: number; label: string }> = {
  anytime: { start: 0, end: 24, label: 'Anytime' },
  morning: { start: 5, end: 12, label: 'Morning' },
  afternoon: { start: 12, end: 17, label: 'Afternoon' },
  evening: { start: 17, end: 24, label: 'Evening' },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const HABIT_GROUP_LABELS: Record<HabitGroup, string> = {
  wellness: 'Wellness',
  work: 'Work',
  personal: 'Personal',
};

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  daily: 'Every day',
  weekly: 'Once a week',
  weekdays: 'Weekdays only',
  weekends: 'Weekends only',
  custom: 'Custom days',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
