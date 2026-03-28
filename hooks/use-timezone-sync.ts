import { useEffect } from 'react'

/**
 * Syncs the browser's current IANA timezone to the server on every app load.
 * This keeps the user's stored timezone accurate even when they travel.
 * Fire-and-forget — failures are silent (non-critical).
 */
export function useTimezoneSync() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!timezone) return

    fetch('/api/user/timezone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    }).catch(() => {
      // Non-critical — don't surface timezone sync failures to the user
    })
  }, []) // Only on mount (once per app load)
}
