'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutBinding {
  id: string;
  label: string;
  description: string;
  key: string;
  /** e.g. 'ctrl', 'meta', 'shift', 'alt' — empty string means no modifier */
  modifier: '' | 'ctrl' | 'meta' | 'shift' | 'alt';
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  {
    id: 'new_task',
    label: 'New task',
    description: 'Open the dialog to create a new task',
    key: 'n',
    modifier: '',
  },
  {
    id: 'edit_hovered',
    label: 'Edit hovered item',
    description: 'Open the edit dialog for the task currently under the mouse',
    key: 'e',
    modifier: '',
  },
  {
    id: 'delete_hovered',
    label: 'Delete hovered item',
    description: 'Delete the task currently under the mouse (shows confirmation)',
    key: 'Backspace',
    modifier: '',
  },
];

interface KeyboardShortcutsStore {
  shortcuts: ShortcutBinding[];
  updateShortcut: (id: string, updates: Partial<Pick<ShortcutBinding, 'key' | 'modifier'>>) => void;
  resetShortcuts: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsStore>()(
  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      updateShortcut: (id, updates) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: 'anchor-keyboard-shortcuts',
    }
  )
);
