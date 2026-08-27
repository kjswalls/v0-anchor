'use client';

import { create } from 'zustand';
import type { DragInput } from './dnd/sensors';

/**
 * Active-drag state, isolated from React state in AppShell on purpose:
 * a useState there re-rendered the ENTIRE app tree (desktop + both mobile
 * panels + dialogs) on every drag start/end, which is what made the drag
 * ghost feel laggy. Only components that render drag affordances subscribe
 * here (view-router for drop hints, DragGhost for the overlay).
 */
interface DragStore {
  activeId: string | null;
  /**
   * What is driving the drag in progress — a finger or a cursor — decided once,
   * from the event that activated it (`dragInputOf`, lib/dnd/sensors.ts).
   *
   * It lives beside `activeId` and is written in the SAME `set`, because the
   * two are one fact: a view asking "is a drag happening, and can this input
   * reach my drop target?" must never see one of them from this gesture and the
   * other from the last. `lib/dnd/drop-targets.ts` is what reads it.
   */
  input: DragInput | null;
  startDrag: (id: string, input: DragInput) => void;
  endDrag: () => void;
}

export const useDragStore = create<DragStore>((set) => ({
  activeId: null,
  input: null,
  startDrag: (id, input) => set({ activeId: id, input }),
  endDrag: () => set({ activeId: null, input: null }),
}));
