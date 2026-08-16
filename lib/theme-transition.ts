/**
 * Theme changes, without the flash.
 *
 * Changing the theme never reloaded anything — verified: zero navigation
 * events, the window object survives, `<html class>` flips in place. What it
 * DID do was look like a reload, because next-themes' `disableTransitionOnChange`
 * injects `transition: none !important` across the document and forces a
 * reflow, so every colour on screen changes in a single frame with nothing
 * easing. A whole-screen instant repaint is exactly what a page load looks like.
 *
 * The naive fix — just dropping `disableTransitionOnChange` — is worse, not
 * better: Anchor's transitions are property-scoped by convention
 * (`transition-[box-shadow,background-color]`, never `transition-all`), so most
 * elements have no background-colour transition at all. Some would animate,
 * most would snap, and the screen would come apart in pieces.
 *
 * So the transition is granted deliberately and briefly, to everything at once,
 * only while the swap is happening. `data-theme-changing` on <html> opens a
 * ~180ms window in which colour properties — and only colour properties —
 * transition; app/globals.css owns the rule.
 *
 * Reduced motion takes the instant path, which is the honest reading of the
 * preference: the point of the window is easing, and easing is the thing being
 * declined.
 */

const WINDOW_MS = 180;
/** Cleared a little after the window so the last frame is never cut off. */
const CLEANUP_MS = WINDOW_MS + 60;

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

export function applyThemeChange(apply: () => void): void {
  if (typeof document === 'undefined') {
    apply();
    return;
  }

  const root = document.documentElement;
  // Two vetoes, same as every other motion surface: the OS preference AND
  // Anchor's own animations toggle (data-reduce-motion, stamped by
  // supabase-provider). Both take the instant path.
  const reduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    root.hasAttribute('data-reduce-motion');
  if (reduced) {
    apply();
    return;
  }

  root.dataset.themeChanging = 'true';
  apply();

  // Re-entrant on purpose: flipping theme twice inside the window extends it
  // rather than stranding the attribute or ending the second swap early.
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    delete root.dataset.themeChanging;
    cleanupTimer = null;
  }, CLEANUP_MS);
}
