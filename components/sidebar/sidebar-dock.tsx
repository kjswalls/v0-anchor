'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/components/sidebar/chat-panel';
import { UserCard } from '@/components/sidebar/user-card';
import { Omnibar } from '@/components/sidebar/omnibar';
import { RelayField } from '@/components/primitives/relay-field';
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
 */
export function SidebarDock() {
  const chatExpanded = useSidebarStore((s) => s.chatExpanded);
  const dockRef = useRef<HTMLDivElement>(null);
  // Relay wakes up while anything in the dock (the omnibar, chiefly) has focus.
  const [focused, setFocused] = useState(false);

  // Publish the dock's top edge (distance from the viewport bottom) as
  // --toast-bottom so the undo toast can anchor just above it — exact instead
  // of an estimate, and it follows the dock when chat expands/collapses.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      document.documentElement.style.setProperty(
        '--toast-bottom',
        `${Math.max(16, Math.round(window.innerHeight - top + 8))}px`
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      ref={dockRef}
      data-tour="right-sidebar"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      // No overflow-hidden here: the omnibar's suggestion panel grows upward
      // out of the dock, so clipping the capsule would cut it off. The relay
      // clips itself instead (its own rounded overflow-hidden, below).
      className={cn(
        'relative flex min-h-0 flex-col rounded-[10px] bg-surface-3 px-[10px] pt-[18px] pb-[14px]',
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
        <Omnibar />
      </div>
    </div>
  );
}
