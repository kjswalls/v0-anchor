/**
 * planner-types.ts
 *
 * Core entity types (Task, Habit, Project, HabitGroupType) are the source of
 * truth in @anchor-app/types and re-exported from there.
 *
 * This file adds Anchor app-specific types and constants that don't need to
 * be shared externally (ViewMode, FilterState, UI helpers, etc.).
 */

// ── Re-export shared types from @anchor-app/types ─────────────────────────────
export type {
  Priority,
  TimeBucket,
  TaskStatus,
  HabitStatus,
  RepeatFrequency,
  Task,
  Habit,
  Project,
  HabitGroupType,
} from '@anchor-app/types'

// ── App-only types ────────────────────────────────────────────────────────────

export type HabitGroup = string;
export type ViewMode = 'day' | 'week' | 'atlas';
export type GroupBy = 'none' | 'project' | 'priority' | 'bucket' | 'status';
export type FilterType = 'project' | 'priority' | 'startDate' | 'repeat' | 'status';

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

// ── UI helpers ────────────────────────────────────────────────────────────────

import type { Priority, TimeBucket, RepeatFrequency, TaskStatus, Task, Habit, Project, HabitGroupType } from '@anchor-app/types'

export const TIME_BUCKET_RANGES: Record<TimeBucket, { start: number; end: number; label: string }> = {
  anytime:   { start: 0,  end: 24, label: 'Anytime'   },
  morning:   { start: 0,  end: 12, label: 'Morning'   },
  afternoon: { start: 12, end: 17, label: 'Afternoon' },
  evening:   { start: 17, end: 24, label: 'Evening'   },
};

export function formatBucketHour(hour: number, use24h = false): string {
  const h = hour % 24;
  if (use24h) return `${String(h).padStart(2, '0')}:00`;
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function formatBucketRange(range: { start: number; end: number }, use24h = false): string {
  return `${formatBucketHour(range.start, use24h)} - ${formatBucketHour(range.end, use24h)}`;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};

export const DEFAULT_PROJECTS: Project[] = [
  { name: 'Work',     emoji: '💼' },
  { name: 'Wellness', emoji: '🧘' },
  { name: 'Personal', emoji: '🏠' },
];

export const DEFAULT_HABIT_GROUPS: HabitGroupType[] = [
  { name: 'Wellness', emoji: '💚' },
  { name: 'Work',     emoji: '💼' },
  { name: 'Personal', emoji: '⭐' },
];

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none:     'No repeat',
  daily:    'Daily',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  monthly:  'Monthly',
  custom:   'Custom days',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EMOJI_OPTIONS = [
  '💼', '🧘', '🏠', '📚', '💪', '🎯', '🌟', '⭐', '💚', '❤️',
  '🔥', '✨', '🎨', '🎵', '🏃', '🧠', '💡', '📝', '🎮', '🍎',
  '☕', '🌱', '🔔', '📊', '🛠️', '🎓', '💰', '🌈', '🚀', '🎁',
];
