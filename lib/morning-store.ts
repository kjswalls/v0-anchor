'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { saveSettings } from './settings-service';
import { usePlannerStore } from './planner-store';

interface MorningStore {
  morningCheckDismissedDate: string | null; // yyyy-MM-dd
  morningCheckEnabled: boolean;
  morningCheckTime: string; // HH:mm
  dismiss: () => void;
  isDismissedToday: () => boolean;
  setMorningCheckEnabled: (enabled: boolean) => void;
  setMorningCheckTime: (time: string) => void;
}

export const useMorningStore = create<MorningStore>()(
  persist(
    (set, get) => ({
      morningCheckDismissedDate: null,
      morningCheckEnabled: true,
      morningCheckTime: '08:00',

      dismiss: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        set({ morningCheckDismissedDate: today });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { morning_check_dismissed_date: today });
      },

      isDismissedToday: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().morningCheckDismissedDate === today;
      },

      setMorningCheckEnabled: (enabled) => {
        set({ morningCheckEnabled: enabled });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { morning_check_enabled: enabled });
      },

      setMorningCheckTime: (time) => {
        set({ morningCheckTime: time });
        const userId = usePlannerStore.getState().userId;
        if (userId) saveSettings(userId, { morning_check_time: time });
      },
    }),
    {
      name: 'anchor-morning-store',
      partialize: (state) => ({
        morningCheckDismissedDate: state.morningCheckDismissedDate,
        morningCheckEnabled: state.morningCheckEnabled,
        morningCheckTime: state.morningCheckTime,
      }),
    }
  )
);
