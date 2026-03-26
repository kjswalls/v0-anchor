'use client';

import { create } from 'zustand';

export type MobileTab = 'tasks' | 'schedule' | 'chat';

interface MobileNavStore {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
}

export const useMobileNavStore = create<MobileNavStore>((set) => ({
  activeTab: 'schedule',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
