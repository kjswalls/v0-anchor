'use client';

import { useSwipeable } from 'react-swipeable';

import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileTabBar } from '@/components/mobile/mobile-tab-bar';
import { MobileViewRouter } from '@/components/mobile/mobile-view-router';
import { MobileChatPanel } from '@/components/mobile/mobile-chat-panel';
import { MiniWeekNav } from '@/components/mobile/mini-week-nav';
import { Braindump } from '@/components/sidebar/braindump';
import { useMobileNavStore, MOBILE_TAB_ORDER } from '@/lib/mobile-nav-store';
import { openAddDialog, useUIStore } from '@/lib/ui-store';

/**
 * Mobile layout: slim header + (Today-only) day strip, the active tab's
 * surface, and a bottom tab bar — Braindump · Today · Chat. Tabs reuse the
 * desktop primitives (shared Braindump, DayBuckets/DayList via
 * MobileViewRouter, ChatConversation) rather than the old bespoke panels.
 * Rendered under the shell's single DndContext, so items stay draggable.
 */
export function MobileShell() {
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const openDialog = useUIStore((s) => s.openDialog);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      const idx = MOBILE_TAB_ORDER.indexOf(activeTab);
      if (idx < MOBILE_TAB_ORDER.length - 1) {
        useMobileNavStore.getState().setActiveTab(MOBILE_TAB_ORDER[idx + 1]);
      }
    },
    onSwipedRight: () => {
      const idx = MOBILE_TAB_ORDER.indexOf(activeTab);
      if (idx > 0) useMobileNavStore.getState().setActiveTab(MOBILE_TAB_ORDER[idx - 1]);
    },
    trackMouse: false,
    delta: 50,
    preventScrollOnSwipe: false,
  });

  return (
    <div className="flex h-[100dvh] flex-col bg-background md:hidden">
      <MobileHeader
        onAddClick={() => openAddDialog('task')}
        onOpenSettings={() => openDialog({ type: 'settings' })}
      />

      {activeTab === 'today' && <MiniWeekNav />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" {...swipeHandlers}>
        {activeTab === 'braindump' && (
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
            <Braindump hideCollapse />
          </div>
        )}
        {activeTab === 'today' && <MobileViewRouter />}
        {activeTab === 'chat' && (
          <MobileChatPanel onOpenSettings={() => openDialog({ type: 'settings' })} />
        )}
      </div>

      <MobileTabBar />
    </div>
  );
}
