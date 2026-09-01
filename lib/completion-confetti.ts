'use client';

import { useExtensionsStore } from '@/lib/extensions-store';
import { EXT_COMPLETION_CONFETTI } from '@/lib/extension-registry';

/**
 * The completion-confetti extension's whole surface. Called from the two
 * completion funnels in planner-store (toggleTaskStatus / toggleHabitStatus) —
 * every surface (dialog, command palette, EOD review, bulk bar) goes through
 * those actions, so the gate lives in exactly one place per funnel and only
 * fires on the way TO done, never on un-complete.
 *
 * canvas-confetti is imported lazily: the library never loads for users who
 * keep the extension off (it stays out of the main bundle), and planner-store
 * — which imports this module — stays importable in node-side unit tests.
 */
export function celebrateCompletion(): void {
  if (typeof window === 'undefined') return;
  if (!useExtensionsStore.getState().isEnabled(EXT_COMPLETION_CONFETTI)) return;
  // Two vetoes: dsul's own animations toggle (stamped on <html> by
  // supabase-provider) and the OS preference, which canvas-confetti checks
  // itself via disableForReducedMotion.
  if (document.documentElement.hasAttribute('data-reduce-motion')) return;
  import('canvas-confetti')
    .then(({ default: confetti }) => {
      confetti({
        particleCount: 70,
        spread: 60,
        startVelocity: 28,
        origin: { y: 0.7 },
        // Lime-family hexes — a canvas can't read CSS custom properties, and
        // the burst should read as dsul, not a generic party (the onboarding
        // tour's purple burst predates the brand rule).
        colors: ['#b8e45c', '#8fd14f', '#5a8f22', '#e8c96a'],
        disableForReducedMotion: true,
      });
    })
    .catch(() => {
      // Some mobile browsers refuse the canvas — a celebration is never an error.
    });
}
