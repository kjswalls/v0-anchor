/**
 * shouldShowOnDate — pure recurrence filter
 *
 * @param dateStr Must be a YYYY-MM-DD string resolved to the user's local timezone before calling.
 */
export function shouldShowOnDate(
  item: { repeatFrequency?: string; repeatDays?: number[]; repeatMonthDay?: number },
  dateStr: string, // YYYY-MM-DD, already timezone-resolved by caller
  userTimezone: string
): boolean {
  // Parse as local date to avoid UTC offset shifting
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();   // 0 = Sun … 6 = Sat
  const dayOfMonth = d.getDate(); // 1–31

  switch (item.repeatFrequency) {
    case 'none':
    case undefined:
    case null:
      return false;
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly':
      // Legacy — treat same as custom
      return item.repeatDays?.includes(dayOfWeek) ?? false;
    case 'monthly': {
      const targetDay = item.repeatMonthDay || 1;
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const clampedTarget = Math.min(targetDay, lastDayOfMonth);
      return dayOfMonth === clampedTarget;
    }
    case 'custom':
      return item.repeatDays?.includes(dayOfWeek) ?? false;
    default:
      return false;
  }
}

/**
 * Format a Date to a YYYY-MM-DD string in the given IANA timezone.
 */
export function toDateStr(date: Date, userTimezone: string): string {
  return Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(date);
}
