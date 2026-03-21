import type { Priority, RepeatFrequency } from './planner-types';

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
