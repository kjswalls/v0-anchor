'use client';

import { useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';

import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileBottomDock } from '@/components/mobile/mobile-bottom-dock';
import { MobileViewRouter } from '@/components/mobile/mobile-view-router';
import { MobileChatPanel } from '@/components/mobile/mobile-chat-panel';
import { MiniWeekNav } from '@/components/mobile/mini-week-nav';
import { MorningCheckMobile } from '@/components/ai/morning-check';
import { ScheduleSheet } from '@/components/mobile/schedule-sheet';
import { Braindump } from '@/components/sidebar/braindump';
import { ScopeRail } from '@/components/sidebar/scope-rail';
import { useMobileNavStore, MOBILE_TAB_ORDER } from '@/lib/mobile-nav-store';
import { useUIStore } from '@/lib/ui-store';
import { rowSwipeActive, closeAllRowSwipes } from '@/lib/row-swipe';

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
        onOpenSettings={() => openDialog({ type: 'settings' })}
        onOpenBugReport={() => openDialog({ type: 'bug-report' })}
      />

      {activeTab === 'today' && <MiniWeekNav />}

      {/* Past-due pill — Today only, and fixed-height like the strip above it
          (h-8 + mb-1) so it's safe inside the min-h-0 flex-1 column below. The
          list is a portaled bottom Drawer, so it costs this column nothing.

          Today-only means this mounts and unmounts on every tab change, and the
          tray's open flag is a single global shared with the desktop popover —
          so the drawer would inherit an isOpen set while it wasn't even on
          screen (from `goto.overdue` run on Braindump, or from the desktop tray
          when the window crosses the 768px breakpoint). morning-check.tsx owns
          both halves of the fix: the surface closes the tray when it unmounts,
          and the drawer refuses to open in the commit it mounts in. It opens
          only when the user asks it to, on this tab, while it is visible. */}
      {activeTab === 'today' && <MorningCheckMobile />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" {...swipeHandlers}>
        {/* Keyed on activeTab → a soft cross-fade on tab change (auto-disabled
            under [data-reduce-motion]). */}
        <div
          key={activeTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in-0 duration-200"
        >
        {activeTab === 'chat' ? (
          <MobileChatPanel onOpenSettings={() => openDialog({ type: 'settings' })} />
        ) : (
          /* Content lives in a floating rounded panel on the paper backdrop —
             the mobile echo of the desktop canvas. In light mode canvas and
             backdrop are near-identical, so the border-surface-3 hairline +
             shadow-soft-lg + rounding carry the elevation. */
          <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-surface-3 bg-canvas shadow-soft-lg">
            {/* The rail rides the Braindump tab for the same reason the Paused
                section does: it is the one mobile surface that is about what
                exists rather than about today, and touch has no other route to
                the containers. Its hover preview simply never fires here — the
                switch and the count do all the work, which is also why the
                count exists rather than the preview alone. */}
            {activeTab === 'braindump' && (
              <>
                <Braindump />
                <div className="shrink-0 px-2 pb-2">
                  <ScopeRail />
                </div>
              </>
            )}
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
