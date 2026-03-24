import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase';

interface EODStore {
  isOpen: boolean;
  eodReviewEnabled: boolean;
  eodReviewTime: string; // HH:mm
  lastEodReviewDate: string | null; // yyyy-MM-dd
  open: () => void;
  close: () => void;
  setEodReviewEnabled: (enabled: boolean) => void;
  setEodReviewTime: (time: string) => void;
  saveLastReviewDate: (userId: string | null, date: string) => Promise<void>;
}

export const useEODStore = create<EODStore>()(
  persist(
    (set) => ({
      isOpen: false,
      eodReviewEnabled: false,
      eodReviewTime: '21:00',
      lastEodReviewDate: null,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),

      setEodReviewEnabled: (enabled) => set({ eodReviewEnabled: enabled }),
      setEodReviewTime: (time) => set({ eodReviewTime: time }),

      saveLastReviewDate: async (userId, date) => {
        set({ lastEodReviewDate: date, isOpen: false });
        if (!userId) return;
        const supabase = createClient();
        await supabase
          .from('user_settings')
          .upsert(
            { user_id: userId, last_eod_review_date: date },
            { onConflict: 'user_id' }
          )
          .then(({ error }) => {
            if (error) console.error('[EOD] Failed to save last review date:', error.message);
          });
      },
    }),
    {
      name: 'anchor-eod-store',
      partialize: (state) => ({
        eodReviewEnabled: state.eodReviewEnabled,
        eodReviewTime: state.eodReviewTime,
        lastEodReviewDate: state.lastEodReviewDate,
      }),
    }
  )
);
