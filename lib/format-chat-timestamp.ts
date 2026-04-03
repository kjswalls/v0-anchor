/**
 * Format a chat message timestamp in the user's preferred time zone and 12h/24h style.
 * Uses DB `user_settings.timezone` when hydrated into the planner store; otherwise the browser zone.
 */
export function formatChatTimestamp(
  timestampMs: number,
  timeFormatPattern: string,
  userTimezone: string | null | undefined
): string {
  const timeZone =
    (typeof userTimezone === 'string' && userTimezone.trim()) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const hour12 = timeFormatPattern.includes('a')
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(new Date(timestampMs))
}
