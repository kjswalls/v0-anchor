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
    }
  )
);
