export type Priority = 'low' | 'medium' | 'high';
export type TimeBucket = 'anytime' | 'morning' | 'afternoon' | 'evening';
export type TaskStatus = 'pending' | 'completed' | 'cancelled';
export type HabitStatus = 'pending' | 'done' | 'skipped';
export type HabitGroup = string;
export type ViewMode = 'day' | 'week';
export type GroupBy = 'none' | 'project' | 'priority' | 'bucket' | 'status';
export type FilterType = 'project' | 'priority' | 'startDate' | 'repeat' | 'status';
export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'custom';

export interface Project {
  name: string;
  emoji: string;
}

export interface HabitGroupType {
  name: string;
  emoji: string;
  color?: string;
}

export interface Task {
  id: string;
  title: string;
  priority?: Priority;
  project?: string;
  startDate?: Date; // Changed from dueDate - determines which day this shows on
  status: TaskStatus;
  timeBucket?: TimeBucket;
  startTime?: string; // Renamed from scheduledTime - HH:mm format
  duration?: number; // in minutes
  isScheduled: boolean;
  // Repeat configuration
  repeatFrequency?: RepeatFrequency;
  repeatDays?: number[]; // 0-6 for custom weekly (0 = Sunday)
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
  startTime?: string; // Renamed from scheduledTime - HH:mm format
  // Repeat configuration
  repeatFrequency: RepeatFrequency;
  repeatDays?: number[]; // 0-6 for custom weekly (0 = Sunday)
  timesPerDay?: number; // for habits that need to be done multiple times
  currentDayCount?: number; // how many times completed today
}

export interface FilterState {
  project?: string;
  priority?: Priority;
  startDate?: 'today' | 'week' | 'overdue' | 'none';
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
  projects: Project[];
  habitGroups: HabitGroupType[];
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

export const DEFAULT_PROJECTS: Project[] = [
  { name: 'Work', emoji: '💼' },
  { name: 'Wellness', emoji: '🧘' },
  { name: 'Personal', emoji: '🏠' },
];

export const DEFAULT_HABIT_GROUPS: HabitGroupType[] = [
  { name: 'Wellness', emoji: '💚' },
  { name: 'Work', emoji: '💼' },
  { name: 'Personal', emoji: '⭐' },
];

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none: 'No repeat',
  daily: 'Every day',
  weekly: 'Once a week',
  weekdays: 'Weekdays only',
  weekends: 'Weekends only',
  custom: 'Custom days',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EMOJI_OPTIONS = [
  '💼', '🧘', '🏠', '📚', '💪', '🎯', '🌟', '⭐', '💚', '❤️',
  '🔥', '✨', '🎨', '🎵', '🏃', '🧠', '💡', '📝', '🎮', '🍎',
  '☕', '🌱', '🔔', '📊', '🛠️', '🎓', '💰', '🌈', '🚀', '🎁',
];
