'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * How often and how recently each command has been run, keyed by command id.
 *
 * Two jobs. It renders the palette's "Recent" group — a custom-commands group
 * that needs no authoring UI and is non-empty after your first command, unlike
 * a saved-preset feature nobody discovers. And it feeds the matcher's
 * tie-break, which would otherwise fall back to declaration order: a static
 * guess at how often you use something, replaced by the measured answer.
 *
 * Local-only (localStorage). Ranking is a per-device habit, and syncing it
 * would mean a settings column and a migration for something with no value
 * across devices.
 */

export interface CommandUsageEntry {
  count: number;
  lastUsed: number;
}

interface CommandUsageStore {
  usage: Record<string, CommandUsageEntry>;
  record: (commandId: string) => void;
  reset: () => void;
}

export const useCommandUsageStore = create<CommandUsageStore>()(
  persist(
    (set) => ({
      usage: {},

      record: (commandId) =>
        set((state) => {
          const prev = state.usage[commandId];
          return {
            usage: {
              ...state.usage,
              [commandId]: {
                count: (prev?.count ?? 0) + 1,
                lastUsed: Date.now(),
              },
            },
          };
        }),

      reset: () => set({ usage: {} }),
    }),
    { name: 'anchor-command-usage', version: 1 }
  )
);

/** Command ids most recently run, newest first. */
export function recentCommandIds(usage: Record<string, CommandUsageEntry>, limit: number): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1].lastUsed - a[1].lastUsed)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Frequency weight for the matcher's tie-break, damped so a command run 50
 * times cannot outrank a better textual match. Log scale, capped.
 */
export function frequencyBoost(usage: Record<string, CommandUsageEntry>, commandId: string): number {
  const count = usage[commandId]?.count ?? 0;
  if (count === 0) return 0;
  return Math.min(Math.log2(count + 1) * 8, 40);
}
