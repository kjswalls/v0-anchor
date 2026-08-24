'use client';

import { useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';

import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileBottomDock } from '@/components/mobile/mobile-bottom-dock';
import { MobileViewRouter } from '@/components/mobile/mobile-view-router';
import { MobileChatPanel } from '@/components/mobile/mobile-chat-panel';
import { MiniWeekNav } from '@/components/mobile/mini-week-nav';
import { ScheduleSheet } from '@/components/mobile/schedule-sheet';
import { Braindump } from '@/components/sidebar/braindump';
import { useMobileNavStore, MOBILE_TAB_ORDER } from '@/lib/mobile-nav-store';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/ui-store';
import { rowSwipeActive, closeAllRowSwipes } from '@/lib/row-swipe';
import { cn } from '@/lib/utils';

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
  const router = useRouter();

  // Close any open row swipe-actions when switching tabs.
  useEffect(() => closeAllRowSwipes(), [activeTab]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (rowSwipeActive.current) return; // a row swipe is in progress, not a tab swipe
      const idx = MOBILE_TAB_ORDER.indexOf(activeTab);
      if (idx < MOBILE_TAB_ORDER.length - 1) {
        useMobileNavStore.getState().setActiveTab(MOBILE_TAB_ORDER[idx + 1]);
      }
    },
    onSwipedRight: () => {
      if (rowSwipeActive.current) return;
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
        onOpenSettings={() => router.push('/settings')}
        onOpenBugReport={() => openDialog({ type: 'bug-report' })}
      />

      {activeTab === 'today' && <MiniWeekNav />}

      {/* The past-due pill used to sit here, mounted on Today only — which is
          also what made it a per-tab surface with a single global open flag, and
          the source of a drawer that could open on a tab it wasn't rendered on.
          It is a line in the bottom dock now
          (components/sidebar/dock-notices.tsx), which is mounted on every tab
          except Chat, so Braindump and Chat gained a voice they never had and
          Today got its 38px of content back. morning-check.tsx still owns both
          halves of the open-flag fix, because the desktop⇄mobile shell swap can
          still strand a tray. */}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" {...swipeHandlers}>
        {/* Keyed on activeTab → a soft cross-fade on tab change (auto-disabled
            under [data-reduce-motion]). */}
        <div
          key={activeTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in-0 duration-200"
        >
        {activeTab === 'chat' ? (
          <MobileChatPanel onOpenSettings={() => router.push('/settings/beacon')} />
        ) : (
          /* Content lives in a floating rounded panel on the paper backdrop —
             the mobile echo of the desktop canvas. In light mode canvas and
             backdrop are near-identical, so the border-surface-3 hairline +
             shadow-soft-lg + rounding carry the elevation. */
          <div
            className={cn(
              'mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-surface-3 bg-canvas shadow-soft-lg',
              // The deleted Scope Rail wrapper (pt-2 pb-2) used to hold the
              // braindump's quick-add well off this panel's rounded bottom
              // corner; restore that clearance, scoped to the braindump tab so
              // the Today canvas layout is untouched.
              activeTab === 'braindump' && 'pb-2'
            )}
          >
            {activeTab === 'braindump' && <Braindump />}
            {activeTab === 'today' && <MobileViewRouter />}
          </div>
        )}
        </div>
      </div>

      <MobileBottomDock />

      <ScheduleSheet />
    </div>
  );
}
