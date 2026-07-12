'use client';

import { ChatPanel } from '@/components/sidebar/chat-panel';
import { UserCard } from '@/components/sidebar/user-card';
import { Omnibar } from '@/components/sidebar/omnibar';
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

  return (
    <div
      data-tour="right-sidebar"
      className={cn(
        'flex min-h-0 flex-col rounded-[10px] bg-surface-3 px-[10px] pt-[18px] pb-[14px]',
        chatExpanded && 'flex-1'
      )}
    >
      {chatExpanded && (
        <div className="mb-4 flex min-h-0 flex-1 flex-col">
          <ChatPanel focusSignal={1} />
        </div>
      )}
      <UserCard />
      <div className="mt-5">
        <Omnibar />
      </div>
    </div>
  );
}
