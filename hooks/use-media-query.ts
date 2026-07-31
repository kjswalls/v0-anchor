import * as React from 'react'

/**
 * Subscribe to a media query from JS. Use it only when a class can't do the
 * job — a breakpoint that has to drive an *attribute* (like `inert`) rather
 * than a style.
 *
 * useSyncExternalStore rather than useState+useEffect (the older useIsMobile
 * shape): matchMedia is an external store, and reading it this way keeps the
 * value consistent during concurrent renders instead of arriving one commit
 * late. The server snapshot is false, so the wider-viewport branch always
 * renders first and hydration can't mismatch.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
