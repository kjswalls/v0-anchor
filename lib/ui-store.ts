import { create } from 'zustand';
import type { Task, Habit, Item, KnownItemType, TimeBucket } from './planner-types';

/**
 * Ephemeral UI state for the desktop shell: which dialog is open, the shared
 * confirm prompt, and omnibar focus requests. Never persisted.
 *
 * Replaces the pile of useState hooks that lived in app/page.tsx.
 */

export type ActiveDialog =
  /** `tab` is the registry type name ('task', 'habit', or a custom slug). */
  | { type: 'add'; tab: string; bucket?: TimeBucket; date?: Date; title?: string }
  | { type: 'edit-item'; item: Item }
  /** `tab` opens a specific panel — 'projects' | 'groups' | 'types'. */
  | { type: 'manage-categories'; tab?: string }
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

  /** Same trick for the docked item panel. It deliberately doesn't steal focus
   *  when it opens — it retargets on every row you click — so this is the only
   *  way to reach it from the keyboard without tabbing the whole grid. */
  itemPanelFocusToken: number;
  focusItemPanel: () => void;
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

  itemPanelFocusToken: 0,
  focusItemPanel: () => set((s) => ({ itemPanelFocusToken: s.itemPanelFocusToken + 1 })),
}));

/* Convenience helpers for common dialogs */
export const openAddDialog = (
  tab: string = 'task',
  bucket?: TimeBucket,
  date?: Date,
  title?: string
) => useUIStore.getState().openDialog({ type: 'add', tab, bucket, date, title });

/**
 * Callers hold legacy Task/Habit projections (no `type` at the type level), so
 * the discriminator is stamped here. What lands in the slot is a snapshot, but
 * it is only an ADDRESS now: the surface re-resolves it from the store by id
 * every render and re-seeds its draft only when that id changes. Calling this
 * again with a different item is therefore how the docked panel retargets.
 *
 * Custom-type items ride the tasks projection (Phase 6b), so their runtime
 * discriminator must survive: stamping 'task' over a {type:'custom'} object
 * would open it with the wrong config and labels.
 */
export const openEditFor = (item: Task | Habit, itemType: KnownItemType) => {
  const runtime = item as { type?: string };
  const stamped =
    runtime.type === 'custom' ? (item as unknown as Item) : ({ ...item, type: itemType } as Item);
  useUIStore.getState().openDialog({ type: 'edit-item', item: stamped });
};
