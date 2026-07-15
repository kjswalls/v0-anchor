'use client';

/**
 * Shared state for mobile row swipe-actions:
 * - `rowSwipeActive`: a guard so the container tab-swipe (mobile-shell) ignores
 *   an in-progress row swipe (belt-and-suspenders alongside stopPropagation).
 * - a one-open registry so only one row's actions are revealed at a time.
 */
export const rowSwipeActive = { current: false };

let openCloser: (() => void) | null = null;

export function openRowSwipe(close: () => void) {
  if (openCloser && openCloser !== close) openCloser();
  openCloser = close;
}

export function closeRowSwipe(close: () => void) {
  if (openCloser === close) openCloser = null;
}

/** Close any open row (e.g. on tab change / sheet open). */
export function closeAllRowSwipes() {
  const c = openCloser;
  openCloser = null;
  c?.();
}
