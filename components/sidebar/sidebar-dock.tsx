'use client';

import { useCallback, useRef, useState } from 'react';
import { ChatPanel } from '@/components/sidebar/chat-panel';
import { DockNotices } from '@/components/sidebar/dock-notices';
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
 * It is also where the app SPEAKS — see components/sidebar/dock-notices.tsx.
 * The omnibar is the user's half of that (they type, the panel answers upward
 * out of the pill); the notice stack is the app's (it speaks, the tray answers
 * upward out of the row). Putting both on one capsule is the whole argument for
 * the placement: one edge of the screen where you and the app talk, instead of
 * a bar in the canvas, a modal, and a toast.
 */
export function SidebarDock() {
  const chatExpanded = useSidebarStore((s) => s.chatExpanded);
  const dockRef = useRef<HTMLDivElement>(null);
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

  // The undo toast anchors just above this capsule — exact instead of an
  // estimate, and it follows the dock when chat expands, when a notice arrives,
  // and when one is dismissed. Shared with the mobile dock, which never had it.
  useToastAnchor(dockRef);

  return (
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
      {/* Above the UserCard rather than above the ChatPanel: chat takes flex-1
          and wants the top of the capsule, and a notice line pushed up there by
          an open conversation would read as part of it. Below chat, the stack
          sits on the same short run of rows as the identity line — chrome with
          chrome. It renders nothing at all when there is nothing to answer, so
          the resting capsule is unchanged. */}
      <DockNotices />

      <div className="relative z-10">
        <UserCard />
      </div>
      <div className="relative z-10 mt-5">
        <Omnibar variant="dock" onFocusChange={setFocused} onPulse={pulse} />
      </div>
    </div>
  );
}
