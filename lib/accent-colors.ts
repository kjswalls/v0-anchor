/**
 * Theme-aware accent ramp helpers (tokens defined in app/globals.css).
 *
 * User-generated things that need a color (projects, custom habit groups)
 * pick deterministically from the 8-step --accent-N ramp so the same name
 * always gets the same color, and colors re-tune per theme for free.
 */

export const ACCENT_RAMP_SIZE = 8;

/** All ramp tokens, e.g. for a color picker. */
export const ACCENT_RAMP: readonly string[] = Array.from(
  { length: ACCENT_RAMP_SIZE },
  (_, i) => `var(--accent-${i + 1})`
);

/** Deterministic accent token for a user-provided name. */
export function accentColorForName(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `var(--accent-${(hash % ACCENT_RAMP_SIZE) + 1})`;
}
