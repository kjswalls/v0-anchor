'use client';

import { useExtensionsStore } from '../extensions-store';
import { useReminderStore } from '../reminder-store';
import { EXT_BEEMINDER } from './beeminder';

/**
 * The browser half of the live Beeminder path.
 *
 * Loaded through a dynamic import from lib/db.ts so this module — and the two
 * stores it reads — never reach the server bundle, where the same file is used
 * by /api/reminders/act.
 *
 * THE GATE IS AN OPTIMISATION, NOT A CHECK. The server re-reads both switches
 * from the database and is the only thing that decides anything; this exists so
 * that the overwhelming majority of users, who have no Beeminder goal, do not
 * pay a request for every checkbox they tick. A stale `true` here costs one
 * no-op round trip; a stale `false` costs a datapoint that the nightly
 * settlement then posts anyway, which is exactly the backstop it is for.
 */
export function reportCompletionFromClient(
  itemId: string,
  dateStr: string,
  completed: boolean,
): void {
  try {
    if (!useReminderStore.getState().stakesEnabled) return;
    if (!useExtensionsStore.getState().isEnabled(EXT_BEEMINDER)) return;
  } catch {
    return;
  }

  void fetch('/api/stakes/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, dateStr, completed }),
    // The tick is already saved. This is a report ABOUT it, so a user who
    // closes the tab mid-flight loses nothing the settlement will not recover.
    keepalive: true,
  }).catch(() => {
    /* Reporting is best-effort; the settlement is the retry. */
  });
}
