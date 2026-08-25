'use client';

import { create } from 'zustand';

/**
 * Which surface the phone shell is showing. Default is Today (glanceable on
 * open); Braindump sits first in the order below so the "get it out of your
 * head" surface is one swipe left.
 */
export type MobileTab = 'braindump' | 'today' | 'chat';

/**
 * The order the switcher sheet lists these in (the dock's mode card opens it);
 * also the left-to-right axis swipe navigation walks.
 */
export const MOBILE_TAB_ORDER: MobileTab[] = ['braindump', 'today', 'chat'];

interface MobileNavStore {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
}

export const useMobileNavStore = create<MobileNavStore>((set) => ({
  activeTab: 'today',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
