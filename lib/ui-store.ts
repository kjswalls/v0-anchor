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
  /**
   * The Organize console — one surface for every container and label. Replaced
   * `manage-categories` and `manage-collections`, which are gone rather than
   * kept as aliases: two variants pointing at one component is how a caller
   * ends up opening the right dialog on the wrong section for a year.
   *
   * `section` is a bare string because it arrives from the palette, the settings
   * manifest and `ActiveDialog` alike; the console validates it and falls back
   * to routines, so a stale value lands somewhere real instead of on an empty
   * plate. See components/planner/organize/console-rail.tsx for the vocabulary.
   */
  | {
      type: 'organize';
      /** 'routines' | 'programs' | 'projects' | 'types' | 'groups' | 'trash'. */
      section?: string;
      /** Select this object on arrival. */
      focusId?: string;
      /** Put the cursor in the create row — the "New routine or program" entry. */
      focusNew?: boolean;
    }
  // Settings is a route (/settings), not a dialog — see
  // app/settings/[[...pane]]/page.tsx. Removed rather than left as a dead
  // variant so nothing can dispatch to a surface no longer mounted anywhere.
  | { type: 'keyboard-shortcuts' }
  | { type: 'bug-report' }
  /**
   * The bulk-add dialog — paste a list (or import a file), get one item per
   * line. `text` seeds its textarea (the raw paste, re-parsed there so the
   * user sees and can edit the split before anything is created). The rest
   * carries context from the surface that handed off: the item dialog's
   * type/project/date must survive the hop or the hand-off silently drops
   * choices the user already made.
   */
  | {
      type: 'bulk-add';
      text?: string;
      /** 'task' or a custom slug — never 'habit'. */
      itemType?: string;
      project?: string;
      /** yyyy-MM-dd */
      date?: string;
      bucket?: TimeBucket;
    };

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  /**
   * Overrides the action button's `data-testid`, for the handful of confirms a
   * spec has to name individually. There is ONE AlertDialog in the app, so
   * without this every prompt answers to `confirm-dialog-confirm` and a test
   * that means "the attach warning" would happily click a delete.
   */
  testId?: string;
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

/** Open the bulk-add dialog, optionally seeded with pasted text and hand-off
 *  context (see the ActiveDialog variant for field meanings). */
export const openBulkAdd = (
  seed: Omit<Extract<ActiveDialog, { type: 'bulk-add' }>, 'type'> = {}
) => useUIStore.getState().openDialog({ type: 'bulk-add', ...seed });

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
