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
 *
 * Local-only is not the same as account-agnostic, though, and this store is the
 * clearest case of the difference: "Recent" renders command labels straight out
 * of this map, so on a shared browser the palette would open showing the
 * PREVIOUS person's last few actions to whoever signed in next. It is in the
 * clear registry (lib/local-state.ts) for that reason as much as for the
 * tie-break being wrong.
 */

export interface CommandUsageEntry {
  count: number;
  lastUsed: number;
}

interface CommandUsageStore {
  usage: Record<string, CommandUsageEntry>;
  record: (commandId: string) => void;
  /** Drop this account's ranking — see lib/local-state.ts. */
  clearUserScopedState: () => void;
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

      clearUserScopedState: () => set({ usage: {} }),
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
