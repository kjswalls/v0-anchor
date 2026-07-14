'use client';

import { create } from 'zustand';

/**
 * Active-drag state, isolated from React state in AppShell on purpose:
 * a useState there re-rendered the ENTIRE app tree (desktop + both mobile
 * panels + dialogs) on every drag start/end, which is what made the drag
 * ghost feel laggy. Only components that render drag affordances subscribe
 * here (view-router for drop hints, DragGhost for the overlay).
 */
interface DragStore {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const useDragStore = create<DragStore>((set) => ({
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
}));
