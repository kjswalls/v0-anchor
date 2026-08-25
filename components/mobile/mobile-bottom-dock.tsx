'use client';

import { useRef } from 'react';
import { Omnibar } from '@/components/sidebar/omnibar';
import { DockNoticesMobile } from '@/components/sidebar/dock-notices';
import { MobileTabBar } from '@/components/mobile/mobile-tab-bar';
import { useToastAnchor } from '@/hooks/use-toast-anchor';
import { useMobileNavStore } from '@/lib/mobile-nav-store';

/**
 * Mobile bottom dock — the port of the desktop sidebar-dock: one floating
 * surface-3 well capsule, inset from the screen edges, holding the app's notice
 * stack and the omnibar white pill on top (both hidden on Chat) and the tab bar
 * below. Owns pb-safe. NOT overflow-hidden — the omnibar's results panel opens
 * upward over content.
 *
 * The notice stack is capped at ONE row here against the desktop's two: this
 * capsule already stands 130–164px into a short viewport, and it moves 56px on
 * every visit to Chat as it is. Anything past the first notice folds into the
 * "+N more" row, which expands in place.
 */
export function MobileBottomDock() {
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const dockRef = useRef<HTMLDivElement>(null);

  // Ported from the desktop dock, and overdue independently of the notices:
  // app/globals.css pinned the mobile toast at a hardcoded `bottom: 120px`
  // against a capsule that is never 120px tall, so it has been drawing over the
  // tab bar. A stack that changes this height on its own made measuring it a
  // prerequisite rather than a tidy-up.
  useToastAnchor(dockRef);

  return (
    <div ref={dockRef} className="px-3 pb-safe pt-2">
      <div
        className="rounded-[24px] bg-surface-3 p-2 shadow-soft-lg"
        // Focus handoff target for a self-dismissing notice — see
        // useDismissWithFocus in components/ai/morning-check.tsx.
        data-dock-surface
      >
        {/* Outside the Chat gate that hides the omnibar, unlike everything else
            up here. The point of the move is that the app has ONE voice with one
            address; going quiet on the tab where the user is talking to Beacon
            would put the two halves of the same conversation on different
            screens. It is also the cheapest tab to afford it on — the omnibar's
            56px is already gone there. */}
        <DockNoticesMobile />

        {activeTab !== 'chat' && (
          <div className="pb-2">
            <Omnibar variant="dock" onAskBeacon={() => useMobileNavStore.getState().setActiveTab('chat')} />
          </div>
        )}
        <MobileTabBar />
      </div>
    </div>
  );
}
