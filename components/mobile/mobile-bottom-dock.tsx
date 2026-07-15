'use client';

import { Omnibar } from '@/components/sidebar/omnibar';
import { MobileTabBar } from '@/components/mobile/mobile-tab-bar';
import { useMobileNavStore } from '@/lib/mobile-nav-store';

/**
 * Mobile bottom dock — the port of the desktop sidebar-dock: one floating
 * surface-3 well capsule, inset from the screen edges, holding the omnibar
 * white pill on top (hidden on Chat) and the tab bar below. Owns pb-safe.
 * NOT overflow-hidden — the omnibar's results panel opens upward over content.
 */
export function MobileBottomDock() {
  const activeTab = useMobileNavStore((s) => s.activeTab);

  return (
    <div className="px-3 pb-safe pt-2">
      <div className="rounded-[24px] bg-surface-3 p-2 shadow-soft-lg">
        {activeTab !== 'chat' && (
          <div className="pb-2">
            <Omnibar onAskBeacon={() => useMobileNavStore.getState().setActiveTab('chat')} />
          </div>
        )}
        <MobileTabBar />
      </div>
    </div>
  );
}
