import { create } from 'zustand';

/**
 * Which grouping lane the Schedule is focused on — a transient inspection
 * gesture, not a view preference.
 *
 * Deliberately NOT in view-store. That store persists its whole state, and a
 * focus key surviving a reload would recede most of a day with nothing on screen
 * explaining why; the same argument `schedule-resize-store` is separate for.
 *
 * The key is never validated here. It is resolved against the current lane plan
 * at read time (`resolveFocus` in lib/schedule-lanes.ts), so switching the
 * group-by out from under a focused key makes it stop applying rather than
 * leaving the grid receded against a lane that no longer exists.
 */
interface ScheduleFocusStore {
  /** A group key from `groupRows`, or null for "everything at full strength". */
  focusedKey: string | null;
  /** Picking the focused lane again clears it — the cap row is a toggle. */
  toggleFocus: (key: string) => void;
  clearFocus: () => void;
}

export const useScheduleFocusStore = create<ScheduleFocusStore>()((set) => ({
  focusedKey: null,
  toggleFocus: (key) => set((s) => ({ focusedKey: s.focusedKey === key ? null : key })),
  clearFocus: () => set({ focusedKey: null }),
}));
