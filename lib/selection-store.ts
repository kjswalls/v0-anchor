'use client';

import { create } from 'zustand';

/**
 * Multi-select state — its own concern (one Zustand store per concern, like
 * drag-store). Ephemeral and never persisted: a selection is a transient
 * gesture, not saved state. Holds only item ids; kind resolution and registry
 * gating live in the bulk-action layer, which reads planner-store, so this
 * store stays kind-agnostic.
 *
 * Reactivity contract: rows subscribe with a boolean selector
 * `useSelectionStore(s => s.selectedIds.has(id))`, so only the row gaining or
 * losing selection re-renders. Every mutating action therefore builds a NEW Set
 * — Zustand compares by reference, and mutating the old Set in place would fire
 * no subscriber.
 */
interface SelectionStore {
  selectedIds: Set<string>;
  /** The last row toggled — the fixed end of a shift-click range. */
  anchorId: string | null;

  /** Cmd/Ctrl-click: flip one row in or out; it becomes the range anchor. */
  toggle: (id: string) => void;
  /**
   * Shift-click range (ids already resolved by the caller): REPLACE the
   * selection with the range but keep the anchor, so consecutive shift-clicks
   * re-range from the same origin — a range can shrink, not only grow.
   */
  selectRange: (ids: string[]) => void;
  /** Replace the whole selection (select-all); anchor becomes the last id. */
  replace: (ids: string[]) => void;
  /** Drop ids that no longer exist (e.g. after a bulk delete). */
  prune: (existing: (id: string) => boolean) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedIds: new Set(),
  anchorId: null,

  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, anchorId: id };
    }),

  // Replaces the set (so re-ranging can shrink); anchorId is intentionally NOT
  // in the returned patch, so the shallow merge leaves the origin fixed.
  selectRange: (ids) => set({ selectedIds: new Set(ids) }),

  replace: (ids) =>
    set({
      selectedIds: new Set(ids),
      anchorId: ids.length ? ids[ids.length - 1] : null,
    }),

  prune: (existing) =>
    set((s) => {
      let dropped = false;
      const next = new Set<string>();
      for (const id of s.selectedIds) {
        if (existing(id)) next.add(id);
        else dropped = true;
      }
      if (!dropped) return s;
      return {
        selectedIds: next,
        anchorId: s.anchorId && existing(s.anchorId) ? s.anchorId : null,
      };
    }),

  clear: () =>
    set((s) => (s.selectedIds.size === 0 ? s : { selectedIds: new Set(), anchorId: null })),
}));

/**
 * Item ids currently in the DOM, in document order, deduped. No virtualization
 * exists anywhere (every list is a direct `.map` into a plain scroll container),
 * so document order IS visual order for the list surfaces — which lets shift
 * range-select and select-all read the DOM rather than thread an ordered-ids
 * prop through all seven TaskRow callers. If windowing is ever added, this must
 * move to a caller-supplied ordering.
 *
 * Scoped to `[data-item-kind]`: the three real row/block surfaces (TaskRow,
 * ScheduleBlock, BlockTask) all set it, but the omnibar's search results carry
 * only `data-item-id` — so this never captures off-canvas items surfaced by a
 * live search.
 */
export function selectableIdsInDom(): string[] {
  if (typeof document === 'undefined') return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-item-kind][data-item-id]')) {
    const id = el.dataset.itemId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * The contiguous id range between the anchor row and the clicked row, in DOM
 * order — the shift-click gesture. Falls back to just the target id when there
 * is no anchor or either row can't be found in the DOM.
 */
export function rangeIds(anchorId: string | null, targetId: string): string[] {
  const ids = selectableIdsInDom();
  const targetIdx = ids.indexOf(targetId);
  if (targetIdx === -1) return [targetId];
  const anchorIdx = anchorId ? ids.indexOf(anchorId) : -1;
  if (anchorIdx === -1) return [targetId];
  const [lo, hi] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return ids.slice(lo, hi + 1);
}
