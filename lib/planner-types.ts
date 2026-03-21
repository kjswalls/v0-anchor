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
  repeatFrequency?: RepeatFrequency;
  repeatDays?: number[];
  timeBucket?: TimeBucket;
  startTime?: string;
  duration?: number;
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
  startDate?: Date;
  status: TaskStatus;
  timeBucket?: TimeBucket;
  startTime?: string;
  duration?: number;
  isScheduled: boolean;
  repeatFrequency?: RepeatFrequency;
  repeatDays?: number[];
  order: number;
  inProjectBlock?: boolean;
  previousStartTime?: string;
}

export interface Habit {
  id: string;
  title: string;
  group: HabitGroup;
  streak: number;
  status: HabitStatus;
  completedDates: string[];
  timeBucket?: TimeBucket;
  startTime?: string;
  repeatFrequency: RepeatFrequency;
  repeatDays?: number[];
  timesPerDay?: number;
  currentDayCount?: number;
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

export type BucketRange = { start: number; end: number };

export type ConfigurableBucketRanges = {
  morning: BucketRange;
  afternoon: BucketRange;
  evening: BucketRange;
};

export const DEFAULT_BUCKET_RANGES: ConfigurableBucketRanges = {
  morning: { start: 5, end: 12 },
  afternoon: { start: 12, end: 18 },
  evening: { start: 18, end: 30 },
};

export const TIME_BUCKET_RANGES: Record<TimeBucket, { start: number; end: number; label: string }> = {
  anytime: { start: 0, end: 24, label: 'Anytime' },
  morning: { start: DEFAULT_BUCKET_RANGES.morning.start, end: DEFAULT_BUCKET_RANGES.morning.end, label: 'Morning' },
  afternoon: { start: DEFAULT_BUCKET_RANGES.afternoon.start, end: DEFAULT_BUCKET_RANGES.afternoon.end, label: 'Afternoon' },
  evening: { start: DEFAULT_BUCKET_RANGES.evening.start, end: DEFAULT_BUCKET_RANGES.evening.end, label: 'Evening' },
};

export function formatBucketHour(h: number): string {
  const n = h % 24;
  if (n === 0) return '12am';
  if (n === 12) return '12pm';
  return n < 12 ? `${n}am` : `${n - 12}pm`;
}

export function formatBucketRange(range: BucketRange): string {
  return `${formatBucketHour(range.start)} – ${formatBucketHour(range.end)}`;
}

export const BUCKET_HOUR_OPTIONS: number[] = Array.from({ length: 25 }, (_, i) => i);

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none: 'No repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  custom: 'Custom',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EMOJI_OPTIONS = [
  '✨', '🎯', '📚', '💼', '🏃', '💪', '🧠', '❤️',
  '🎨', '🎵', '🌍', '🚀', '⚡', '🔥', '💎', '🎁',
  '📖', '🏆', '🌟', '💡', '🎭', '🌺', '🍎', '☕',
];

export const DEFAULT_PROJECTS: Project[] = [
  { name: 'Personal', emoji: '✨' },
  { name: 'Work', emoji: '💼' },
  { name: 'Health', emoji: '🏃' },
];

export const DEFAULT_HABIT_GROUPS: HabitGroupType[] = [
  { name: 'Physical', emoji: '💪', color: '#FF6B6B' },
  { name: 'Mental', emoji: '🧠', color: '#4ECDC4' },
  { name: 'Learning', emoji: '📚', color: '#FFE66D' },
];
