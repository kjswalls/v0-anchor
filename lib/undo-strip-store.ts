import { create } from 'zustand';

/**
 * The one transient row: what the app just did on your say-so, and the offer to
 * take it back.
 *
 * It used to be a sonner toast — a card floating 8px above the dock capsule, on
 * its own ground, with its own shadow and its own idea of what a message looks
 * like. Two things were wrong with that and only one of them was geometry. The
 * card was a second visual language for the same sentence the notice rows were
 * already speaking, and it moved with the capsule it was measured from, so every
 * notice arriving or leaving shifted it too.
 *
 * It is a strip row now: same 26px, same ink, same shape as a notice, above the
 * dock rather than over it, plus the one thing a notice never has — an expiry,
 * drawn as a hairline that drains over the row's life. A toast and a notice are
 * the same sentence; the hairline is the only part that says "this one will
 * leave on its own".
 *
 * A store rather than component state because the raiser and the renderer are
 * far apart: hooks/use-undo-toast.ts watches the action log from AppShell, and
 * the row is drawn inside whichever dock is mounted.
 */
export type UndoStripEntry = {
  /** The action-log id. Identity of the row, and what a stale timer checks. */
  id: string;
  /** The sentence — 'Delete task: Swim'. */
  label: string;
  /** Decision 11's receipt, when the store attached one. */
  receipt?: string;
  /** How long this row lives, in ms. Drives the hairline and the timer alike. */
  durationMs: number;
};

type UndoStripState = {
  entry: UndoStripEntry | null;
  show: (entry: UndoStripEntry) => void;
  /**
   * Take the row down. Pass an id to make it conditional — a timer that fires
   * after a newer row has replaced this one must not clear the newer one.
   */
  dismiss: (id?: string) => void;
};

export const useUndoStripStore = create<UndoStripState>((set, get) => ({
  entry: null,
  show: (entry) => set({ entry }),
  dismiss: (id) => {
    if (id !== undefined && get().entry?.id !== id) return;
    set({ entry: null });
  },
}));
