'use client';

import { create } from 'zustand';
import type { Task, Habit } from '@/lib/planner-types';

/** A row the mobile schedule sheet acts on (mirror of TaskRow's RowItem). */
export type SheetRow = { itemType: 'task'; item: Task } | { itemType: 'habit'; item: Habit };

/**
 * Drives the mobile tap-to-schedule sheet: a row's ellipsis opens it, the sheet
 * assigns a time bucket (or deletes / unschedules) via the planner store. Kept
 * out of ui-store so it doesn't touch the desktop dialog union.
 */
interface ScheduleSheetStore {
  row: SheetRow | null;
  open: (row: SheetRow) => void;
  close: () => void;
}

export const useScheduleSheet = create<ScheduleSheetStore>((set) => ({
  row: null,
  open: (row) => set({ row }),
  close: () => set({ row: null }),
}));
