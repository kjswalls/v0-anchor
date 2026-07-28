import { create } from 'zustand';
import type { Task, Habit, Item, ItemType, TimeBucket } from './planner-types';

/**
 * Ephemeral UI state for the desktop shell: which dialog is open, the shared
 * confirm prompt, and omnibar focus requests. Never persisted.
 *
 * Replaces the pile of useState hooks that lived in app/page.tsx.
 */

export type ActiveDialog =
  | { type: 'add'; tab: ItemType; bucket?: TimeBucket; date?: Date }
  | { type: 'edit-item'; item: Item }
  | { type: 'manage-categories' }
  | { type: 'settings' }
  | { type: 'keyboard-shortcuts' }
  | { type: 'bug-report' };

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface UIStore {
  activeDialog: ActiveDialog | null;
  openDialog: (dialog: ActiveDialog) => void;
  closeDialog: () => void;

  /** Shared AlertDialog rendered once in the shell. */
  confirmRequest: ConfirmRequest | null;
  confirm: (request: ConfirmRequest) => void;
  resolveConfirm: (confirmed: boolean) => void;

  /** Bumping the token tells the omnibar to grab focus (⌘K etc.). */
  omnibarFocusToken: number;
  focusOmnibar: () => void;
}

export const useUIStore = create<UIStore>()((set, get) => ({
  activeDialog: null,
  openDialog: (dialog) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: null }),

  confirmRequest: null,
  confirm: (request) => set({ confirmRequest: request }),
  resolveConfirm: (confirmed) => {
    const request = get().confirmRequest;
    set({ confirmRequest: null });
    if (confirmed) request?.onConfirm();
  },

  omnibarFocusToken: 0,
  focusOmnibar: () => set((s) => ({ omnibarFocusToken: s.omnibarFocusToken + 1 })),
}));

/* Convenience helpers for common dialogs */
export const openAddDialog = (
  tab: ItemType = 'task',
  bucket?: TimeBucket,
  date?: Date
) => useUIStore.getState().openDialog({ type: 'add', tab, bucket, date });

/**
 * Callers hold legacy Task/Habit projections (no `type` at the type level), so
 * the discriminator is stamped here. The item is a snapshot captured at open
 * time — the dialog deliberately does not re-resolve it from the store.
 */
export const openEditFor = (item: Task | Habit, itemType: ItemType) =>
  useUIStore
    .getState()
    .openDialog({ type: 'edit-item', item: { ...item, type: itemType } as Item });
