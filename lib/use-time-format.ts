import { usePlannerStore } from '@/lib/planner-store';

/**
 * Returns the date-fns format string for displaying times based on user preference.
 * '12h' → 'h:mm a'   (e.g. "9:30 am")
 * '24h' → 'HH:mm'    (e.g. "09:30")
 */
export function useTimeFormat(): string {
  const timeFormat = usePlannerStore((s) => s.timeFormat);
  return timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
}
