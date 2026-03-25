'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';

interface MorningStore {
  dismissedDate: string | null; // yyyy-MM-dd
  morningCheckEnabled: boolean;
  morningCheckTime: string; // HH:mm, default '08:00'
  dismiss: () => void;
  isDismissedToday: () => boolean;
  setMorningCheckEnabled: (enabled: boolean) => void;
  setMorningCheckTime: (time: string) => void;
}

export const useMorningStore = create<MorningStore>()(
  persist(
    (set, get) => ({
      dismissedDate: null,
      morningCheckEnabled: true,
      morningCheckTime: '08:00',

      dismiss: () => set({ dismissedDate: format(new Date(), 'yyyy-MM-dd') }),

      isDismissedToday: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().dismissedDate === today;
      },

      setMorningCheckEnabled: (enabled: boolean) =>
        set({ morningCheckEnabled: enabled }),

      setMorningCheckTime: (time: string) =>
        set({ morningCheckTime: time }),
    }),
    {
      name: 'anchor-morning-store',
    }
  )
);
