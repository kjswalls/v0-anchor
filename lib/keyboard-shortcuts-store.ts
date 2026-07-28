'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STATIC_COMMANDS, SHELL_SHORTCUTS } from './commands/registry';
import { COMMAND_GROUPS } from './commands/types';

export interface ShortcutBinding {
  id: string;
  label: string;
  description: string;
  /** Keys pressed concurrently (up to 3), e.g. ['ctrl', 'shift', 'z'] or ['n']. */
  keys: string[];
  /** Section heading in the shortcuts modal. */
  groupHeading: string;
}

const GROUP_HEADINGS = new Map(COMMAND_GROUPS.map((g) => [g.id, g.heading]));

/**
 * The default bindings are DERIVED from the command registry — a command owns
 * its shortcut, so this list and the palette can never disagree about what a
 * key does, and the shortcuts modal renders itself.
 *
 * SHELL_SHORTCUTS covers the two bindings the registry can't own, because they
 * act on the item under the mouse and need state that only the shell has.
 *
 * The ids are load-bearing: they are the keys a user's rebinding is stored
 * under. Never rename one — which is also why this reads STATIC_COMMANDS and
 * not resolveCommands(): a dynamically derived command can disappear, and a
 * persisted binding whose owner is gone is an override nothing can reach.
 */
export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  ...STATIC_COMMANDS.filter((command) => command.shortcut).map((command) => ({
    id: command.shortcut!.id,
    label: command.label,
    description: command.description ?? '',
    keys: command.shortcut!.keys,
    groupHeading: GROUP_HEADINGS.get(command.group) ?? 'Other',
  })),
  ...SHELL_SHORTCUTS.map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    description: shortcut.description,
    keys: [...shortcut.keys],
    groupHeading: 'Item under the cursor',
  })),
];

interface KeyboardShortcutsStore {
  /**
   * Only the bindings the user has actually changed, id → keys.
   *
   * v2 persisted whole binding objects, which meant a user who had ever opened
   * the modal was frozen on the labels and descriptions from that day, and
   * newly added shortcuts arrived only through a migrate. Storing overrides
   * alone means labels always come from the registry.
   */
  overrides: Record<string, string[]>;
  updateShortcut: (id: string, keys: string[]) => void;
  resetShortcuts: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsStore>()(
  persist(
    (set) => ({
      overrides: {},

      updateShortcut: (id, keys) =>
        set((state) => ({ overrides: { ...state.overrides, [id]: keys } })),

      resetShortcuts: () => set({ overrides: {} }),
    }),
    {
      name: 'anchor-keyboard-shortcuts',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        if (version >= 3) return persistedState as KeyboardShortcutsStore;

        // v1/v2 → v3: keep only the bindings that differ from their default.
        const legacy = persistedState as { shortcuts?: ShortcutBinding[] } | null;
        const overrides: Record<string, string[]> = {};
        for (const binding of legacy?.shortcuts ?? []) {
          const fallback = DEFAULT_SHORTCUTS.find((d) => d.id === binding.id);
          if (!fallback) continue;
          const same =
            fallback.keys.length === binding.keys.length &&
            fallback.keys.every((key, i) => key === binding.keys[i]);
          if (!same) overrides[binding.id] = binding.keys;
        }
        return { overrides } as KeyboardShortcutsStore;
      },
    }
  )
);

/** Defaults with the user's rebindings applied. */
export function useShortcutBindings(): ShortcutBinding[] {
  const overrides = useKeyboardShortcutsStore((s) => s.overrides);
  return useMemo(
    () =>
      DEFAULT_SHORTCUTS.map((binding) =>
        overrides[binding.id] ? { ...binding, keys: overrides[binding.id] } : binding
      ),
    [overrides]
  );
}

/** Non-reactive read for the keydown dispatcher. */
export function getShortcutBindings(): ShortcutBinding[] {
  const { overrides } = useKeyboardShortcutsStore.getState();
  return DEFAULT_SHORTCUTS.map((binding) =>
    overrides[binding.id] ? { ...binding, keys: overrides[binding.id] } : binding
  );
}
