'use client';

import { useSwipeable } from 'react-swipeable';

import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileBottomDock } from '@/components/mobile/mobile-bottom-dock';
import { MobileViewRouter } from '@/components/mobile/mobile-view-router';
import { MobileChatPanel } from '@/components/mobile/mobile-chat-panel';
import { MiniWeekNav } from '@/components/mobile/mini-week-nav';
import { ScheduleSheet } from '@/components/mobile/schedule-sheet';
import { Braindump } from '@/components/sidebar/braindump';
import { useMobileNavStore, MOBILE_TAB_ORDER } from '@/lib/mobile-nav-store';
import { useUIStore } from '@/lib/ui-store';

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
      <MobileHeader onOpenSettings={() => openDialog({ type: 'settings' })} />

      {activeTab === 'today' && <MiniWeekNav />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" {...swipeHandlers}>
        {activeTab === 'chat' ? (
          <MobileChatPanel onOpenSettings={() => openDialog({ type: 'settings' })} />
        ) : (
          /* Content lives in a floating rounded panel on the paper backdrop —
             the mobile echo of the desktop canvas. In light mode canvas and
             backdrop are near-identical, so the border-surface-3 hairline +
             shadow-soft-lg + rounding carry the elevation. */
          <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-surface-3 bg-canvas shadow-soft-lg">
            {activeTab === 'braindump' && <Braindump hideCollapse />}
            {activeTab === 'today' && <MobileViewRouter />}
          </div>
        )}
      </div>

      <MobileBottomDock />

      <ScheduleSheet />
    </div>
  );
}
