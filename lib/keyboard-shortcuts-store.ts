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
    keys: ['backspace'],
  },
  {
    id: 'undo',
    label: 'Undo',
    description: 'Undo the last action',
    keys: ['ctrl', 'z'],
  },
  {
    id: 'redo',
    label: 'Redo',
    description: 'Redo the last undone action',
    keys: ['ctrl', 'shift', 'z'],
  },
  {
    id: 'toggle_left_sidebar',
    label: 'Toggle left sidebar',
    description: 'Show or hide the tasks sidebar',
    keys: ['meta', '['],
  },
  {
    id: 'toggle_right_sidebar',
    label: 'Toggle right sidebar',
    description: 'Show or hide the AI chat sidebar',
    keys: ['meta', ']'],
  },
  {
    id: 'system_settings',
    label: 'Open Settings',
    description: 'Open the settings dialog',
    keys: ['meta', ','],
  },
  {
    id: 'system_shortcuts',
    label: 'Open Keyboard Shortcuts',
    description: 'Open this shortcuts modal',
    keys: ['meta', '/'],
  },
  {
    id: 'system_search',
    label: 'Search',
    description: 'Focus the search bar',
    keys: ['meta', 'k'],
  },
  {
    id: 'report_bug',
    label: 'Report a bug',
    description: 'Open the bug / feature report dialog',
    keys: ['?'],
  },
];

// Keep for backward compatibility — no longer used for rendering
export const SYSTEM_SHORTCUTS: ShortcutBinding[] = [];

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
