'use client';

import { create } from 'zustand';

/**
 * Mobile bottom-tab navigation. Order matches the tab bar: Braindump · Today ·
 * Chat. Default is Today (glanceable on open); Braindump sits first so the
 * "get it out of your head" surface is one swipe left.
 */
export type MobileTab = 'braindump' | 'today' | 'chat';

/** Left-to-right order in the tab bar; also drives swipe navigation. */
export const MOBILE_TAB_ORDER: MobileTab[] = ['braindump', 'today', 'chat'];

interface MobileNavStore {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
}

export const useMobileNavStore = create<MobileNavStore>((set) => ({
  activeTab: 'today',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
