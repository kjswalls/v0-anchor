'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutBinding {
  id: string;
  label: string;
  description: string;
  /** Array of keys/modifiers pressed concurrently (up to 3). e.g., ['ctrl', 'shift', 'k'] or ['n'] */
  keys: string[];
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  {
    id: 'new_task',
    label: 'New task',
    description: 'Open the dialog to create a new task',
    keys: ['n'],
  },
  {
    id: 'edit_hovered',
    label: 'Edit hovered item',
    description: 'Open the edit dialog for the task currently under the mouse',
    keys: ['e'],
  },
  {
    id: 'delete_hovered',
    label: 'Delete hovered item',
    description: 'Delete the task currently under the mouse (shows confirmation)',
    keys: ['Backspace'],
  },
];

interface KeyboardShortcutsStore {
  shortcuts: ShortcutBinding[];
  updateShortcut: (id: string, keys: string[]) => void;
  resetShortcuts: () => void;
}

// Migration helper: convert old format (key+modifier) to new format (keys array)
interface OldShortcutFormat {
  id: string;
  label: string;
  description: string;
  key?: string;
  modifier?: string;
  keys?: string[];
}

function migrateShortcut(shortcut: OldShortcutFormat): ShortcutBinding {
  // Already in new format
  if (shortcut.keys && Array.isArray(shortcut.keys)) {
    return shortcut as ShortcutBinding;
  }
  // Migrate from old format
  const keys: string[] = [];
  if (shortcut.modifier) {
    keys.push(shortcut.modifier);
  }
  if (shortcut.key) {
    keys.push(shortcut.key.toLowerCase() === ' ' ? 'space' : shortcut.key.toLowerCase());
  }
  return {
    id: shortcut.id,
    label: shortcut.label,
    description: shortcut.description,
    keys: keys.length > 0 ? keys : ['n'], // fallback
  };
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsStore>()(
  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      updateShortcut: (id, keys) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? { ...s, keys } : s
          ),
        })),

      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: 'anchor-keyboard-shortcuts',
      migrate: (persistedState: unknown) => {
        const state = persistedState as { shortcuts?: OldShortcutFormat[] };
        if (state?.shortcuts) {
          return {
            ...state,
            shortcuts: state.shortcuts.map(migrateShortcut),
          };
        }
        return state;
      },
      version: 1,
    }
  )
);
