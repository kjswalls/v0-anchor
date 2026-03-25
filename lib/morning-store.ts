'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';

interface MorningStore {
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  dismissedDate: string | null;
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
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      dismissedDate: null,
      morningCheckEnabled: true,
      morningCheckTime: '08:00',

      dismiss: () => set({ dismissedDate: format(new Date(), 'yyyy-MM-dd') }),

      isDismissedToday: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return get().dismissedDate === today;
      },

      setMorningCheckEnabled: (enabled) => set({ morningCheckEnabled: enabled }),
      setMorningCheckTime: (time) => set({ morningCheckTime: time }),
    }),
    {
      name: 'anchor-morning-store',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
