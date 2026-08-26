'use client';

import { useCallback, useRef, useState } from 'react';
import { ChatPanel } from '@/components/sidebar/chat-panel';
import { DockNotices } from '@/components/sidebar/dock-notices';
import { UndoStrip } from '@/components/notices/undo-strip';
import { UserCard } from '@/components/sidebar/user-card';
import { Omnibar } from '@/components/sidebar/omnibar';
import { RelayField } from '@/components/primitives/relay-field';
import { useToastAnchor } from '@/hooks/use-toast-anchor';
import { RELAY } from '@/lib/relay-config';
import { useSidebarStore } from '@/lib/sidebar-store';
import { cn } from '@/lib/utils';

/**
 * The sidebar dock ("menu dock" in Figma): one flat gray capsule holding the
 * user menu + session history on top and the omnibar (white pill) below.
 * Exact dims from the Figma file (6ZFClj80tMQOCYUhzyuWFL): gray 406×137 r10;
 * top row at y21; omnibar pill 385×48 r10 at y72. Chat has no bar of its own
 * — when summoned from the omnibar (`?` / Ask Beacon / ⌘]) it mounts above the
 * user row and the capsule grows upward, shrinking the Braindump.
 *
 * It is also where the app SPEAKS — but from a STRIP above the capsule, not
 * from inside it. The notice stack used to be a capsule row, and that is what
 * made the omnibar move: the capsule's height was a function of how much the app
 * happened to have to say. The strip hangs off the wrapper instead, the
 * braindump's flex-1 absorbs it, and the capsule's height is now a function of
 * chat expansion alone.
 *
 * The conversation still shares an edge — you type into the pill, the app
 * answers one row above it — and a notice tray still grows upward out of its row
 * into the same airspace as the omnibar's suggestion panel, one occupant at a
 * time. See components/sidebar/dock-notices.tsx and
 * memory/plans/notices-in-place.md.
 */
export function SidebarDock() {
  const chatExpanded = useSidebarStore((s) => s.chatExpanded);
  const dockRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Relay wakes up while the omnibar input is focused. Driven by the omnibar's
  // own focus (via onFocusChange) rather than the dock's focus-within: the
  // latter sticks lit when a menu returns focus to its trigger or the chat
  // input unmounts, since neither fires a focusout that leaves the container.
  const [focused, setFocused] = useState(false);
  // Bumped by the omnibar the moment focus lands: the relay's ripple restarts
  // from the focal point and flares. Separate from `focused` on purpose — that
  // drives a sustained brightness the field holds for as long as you're in the
  // input, this marks the instant you arrived.
  const [burst, setBurst] = useState(0);
  const pulse = useCallback(() => setBurst((n) => n + 1), []);

  // What sonner's remaining toasts (item dialog, bug report, store errors) sit
  // above. The ref is on the WRAPPER, not the capsule, so it clears the strip
  // too — a toast that floated through the notice rows would be the old
  // stacking problem in a new place. The capsule's own height no longer moves
  // with the notices at all; it moves with chat, and nothing else.
  useToastAnchor(wrapperRef);

  return (
    <div ref={wrapperRef} className={cn('flex min-h-0 flex-col', chatExpanded && 'flex-1')}>
      {/* THE STRIP. Outside the capsule and above it, which is the entire
          geometry fix: the braindump above is flex-1, so a row arriving here is
          paid for by the braindump and the capsule's top edge — and therefore
          the omnibar — does not move. Both children render null when they have
          nothing to say, so the resting column is unchanged.

          Notices first, the transient row nearest the capsule: what leaves on
          its own sits closest to where it came from. */}
      <DockNotices />
      <UndoStrip />

      <div
        ref={dockRef}
        data-tour="right-sidebar"
        // The focus handoff target when a notice dismisses itself out from under
        // the keyboard: the capsule outlives every row in it and closes over the
        // gap the row leaves. See useDismissWithFocus in components/ai/morning-check.tsx.
        data-dock-surface
        // No overflow-hidden here: the omnibar's suggestion panel grows upward
        // out of the dock, so clipping the capsule would cut it off. The relay
        // clips itself instead (its own rounded overflow-hidden, below).
        className={cn(
          'relative flex min-h-0 flex-col rounded-[10px] bg-surface-3 px-[10px] pt-[18px] pb-[14px] shadow-[var(--shadow-elev-bar)]',
          chatExpanded && 'flex-1'
        )}
      >
        {RELAY.dock && (
          <RelayField
            className="absolute inset-0 z-0 rounded-[10px]"
            focalY={0.7}
            pitch={20}
            idleIntensity={0.2}
            activeIntensity={0.6}
            activeIntensityLight={0.4}
            active={focused}
            burst={burst}
            mask="radial-gradient(135% 120% at 50% 62%, black 30%, transparent 100%)"
          />
        )}
        {chatExpanded && (
          <div className="relative z-10 mb-4 flex min-h-0 flex-1 flex-col">
            <ChatPanel focusSignal={1} />
          </div>
        )}
        <div className="relative z-10">
          <UserCard />
        </div>
        <div className="relative z-10 mt-5">
          <Omnibar variant="dock" onFocusChange={setFocused} onPulse={pulse} />
        </div>
      </div>
    </div>
  );
}
