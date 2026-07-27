'use client';

import { create } from 'zustand';

/**
 * Whether a schedule block is currently being drag-resized. Lifted out of
 * ScheduleBlock (same rationale as drag-store) so the day/week grids can react:
 * while resizing they expand to the full day at a frozen fit-scale and the block
 * auto-scrolls to follow the dragged edge — otherwise resizing past the compact
 * window drags into blank space with no time reference. Only the block being
 * resized writes; only the grids subscribe.
 */
interface ScheduleResizeStore {
  resizing: boolean;
  setResizing: (resizing: boolean) => void;
}

export const useScheduleResizeStore = create<ScheduleResizeStore>((set) => ({
  resizing: false,
  setResizing: (resizing) => set({ resizing }),
}));
