'use client';

import { useRef } from 'react';
import { Omnibar } from '@/components/sidebar/omnibar';
import { DockNoticesMobile } from '@/components/sidebar/dock-notices';
import { ModeSwitcherSheet } from '@/components/mobile/mode-switcher-sheet';
import { useToastAnchor } from '@/hooks/use-toast-anchor';
import { useMobileNavStore } from '@/lib/mobile-nav-store';
import { cn } from '@/lib/utils';

/**
 * Mobile bottom dock — the desktop sidebar-dock recipe, at phone width: one
 * surface-3 well (radius 10, `--shadow-elev-bar`, inset 10px) holding the app's
 * notice stack over a single row — the 44px mode card, then the omnibar's white
 * pill. Owns the bottom safe area. NOT overflow-hidden — the omnibar's results
 * panel opens upward out of it.
 *
 * The soft radius-24 pill this replaces was the last surface still wearing the
 * old mobile chrome, and the three-tab bar under the omnibar went with it: the
 * mode card + its sheet (components/mobile/mode-switcher-sheet.tsx) are the way
 * between surfaces now, which is what let the well shrink from ~130px to 68px —
 * 88px counting this box's own 8px top gap and 12px bottom floor, and more only
 * where the safe-area inset exceeds that floor.
 *
 * The notice stack is capped at ONE row here against the desktop's two —
 * anything past the first folds into a "+N more" row that expands in place.
 */
export function MobileBottomDock() {
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const dockRef = useRef<HTMLDivElement>(null);

  // Measured, not estimated: app/globals.css pins the mobile toast at
  // `--toast-bottom`, and this dock's height moves with the notice stack, the
  // safe-area inset and the omnibar's absence on Chat. The ref sits on the
  // OUTERMOST box so every one of those is inside what the ResizeObserver
  // watches; the published value is `dock height + 8`, so it is correct at any
  // height rather than tuned to one.
  useToastAnchor(dockRef);

  return (
    <div
      ref={dockRef}
      data-testid="mobile-dock"
      // `max(12px, inset)` rather than `pb-safe`: the well still owns the safe
      // area, but both artboards draw an unconditional 12px under it and a bare
      // `env(safe-area-inset-bottom)` resolves to 0 on every device that reports
      // no inset — Android, iPhone SE, devtools emulation, the @mobile
      // Playwright project. The well would sit flush against the viewport edge
      // with its bottom corners and the downward half of `--shadow-elev-bar`
      // clipped off, while still showing its 10px gap left and right.
      className="px-[10px] pt-2 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
    >
      <div
        className={cn(
          'rounded-[10px] bg-surface-3 p-[10px] shadow-[var(--shadow-elev-bar)]',
          // Chat has no bar to fill the well with yet (see the gate below), and
          // a full-width capsule holding one 44px card reads as chrome that
          // failed to load. Hugging is fit-content, not a fixed width, so a
          // notice row — the one other thing mounted in here — still widens the
          // well to fit it. Goes away in Phase 3 with the gate.
          activeTab === 'chat' && 'w-fit'
        )}
        // Focus handoff target for a self-dismissing notice — see
        // useDismissWithFocus in components/ai/morning-check.tsx.
        data-dock-surface
      >
        {/* Outside the Chat gate that hides the omnibar, unlike everything else
            up here. The point of the move is that the app has ONE voice with one
            address; going quiet on the tab where the user is talking to Beacon
            would put the two halves of the same conversation on different
            screens. It is also the cheapest tab to afford it on — the omnibar's
            row is already gone there. */}
        <DockNoticesMobile />

        <div className="flex items-center gap-2">
          <ModeSwitcherSheet />
          {/* Chat still brings its own composer (ChatConversation), so the bar
              stands down there rather than stacking a second text field under
              the first; the well hugs the card it is left holding. Phase 3 gives
              Beacon this bar as its input and the gate goes away with it. */}
          {activeTab !== 'chat' && (
            <div className="min-w-0 flex-1">
              {/* Already the desktop pill — 48px, radius 10, px-[22px], the
                  key-rest shadow — so the dock leaves its skin alone and only
                  says where it sits. */}
              <Omnibar onAskBeacon={() => useMobileNavStore.getState().setActiveTab('chat')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
