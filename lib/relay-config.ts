/**
 * Feature flags for the ambient "data relay" field (see
 * components/primitives/relay-field.tsx) — a subtle glowing tile-grid ported
 * from the Sunday Softworks site. Each surface is gated independently so any
 * placement that reads as too busy can be switched off here without touching
 * the component. Flip a value to `false` to remove that instance.
 *
 * Light-mode color options live alongside in lib/relay-palettes.ts — a named
 * catalog (Gray/Ink/Slate/Lime/…) that a future user-theming control can read
 * from via <RelayField lightPalette="…" />. The shipped default is 'gray'.
 */
export const RELAY = {
  /** Behind the sidebar dock capsule (identity + omnibar); brightens on focus. */
  dock: true,
  /** Clipped inside the omnibar pill; energizes while the input is focused. */
  omnibar: true,
  /** In the Beacon chat panel; wakes up while a response is streaming. */
  beacon: true,
  /** In the "you are here" current time-of-day bucket header; slow heartbeat. */
  currentBucket: false,
  /** One-shot burst behind the streak flame when the best streak ticks up. */
  streak: true,
  /** Faint fill for empty surfaces (empty Braindump) so dead space has life. */
  emptyState: true,
  /** Fuller, hero-style field on the login / auth screen. */
  auth: true,
} as const;

export type RelaySurface = keyof typeof RELAY;
