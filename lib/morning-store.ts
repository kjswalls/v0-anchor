'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { saveSettings } from './settings-service';
import { usePlannerStore } from './planner-store';

interface MorningStore {
  dismissedDate: string | null; // yyyy-MM-dd
  morningCheckEnabled: boolean;
  dismiss: () => void;
  isDismissedToday: () => boolean;
  setMorningCheckEnabled: (enabled: boolean) => void;
}

export const useMorningStore = create<MorningStore>()(
  persist(
    (set, get) => ({
      dismissedDate: null,
      morningCheckEnabled: true,

      dismiss: () => set({ dismissedDate: format(new Date(), 'yyyy-MM-dd') }),

      isDismissedToday: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().dismissedDate === today;
      },

      setMorningCheckEnabled: (enabled) => {
        set({ morningCheckEnabled: enabled });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { morning_check_enabled: enabled });
      },
    }),
    {
      name: 'anchor-morning-store',
      partialize: (state) => ({
        dismissedDate: state.dismissedDate,
        morningCheckEnabled: state.morningCheckEnabled,
      }),
    }
  )
);
