'use client';

import { useEffect, useState } from 'react';
import { ChatConversation } from '@/components/ai/chat-conversation';
import { useMobileNavStore } from '@/lib/mobile-nav-store';

interface MobileChatPanelProps {
  onOpenSettings?: () => void;
}

/**
 * Mobile chat tab — thin wrapper over the shared ChatConversation
 * (lib/chat-store.ts). The former ~500-line duplicate of chat-sidebar
 * lives on only in git history.
 */
export function MobileChatPanel({ onOpenSettings }: MobileChatPanelProps) {
  const activeTab = useMobileNavStore((s) => s.activeTab);
  const [focusSignal, setFocusSignal] = useState(0);

  useEffect(() => {
    if (activeTab === 'chat') setFocusSignal((n) => n + 1);
  }, [activeTab]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ChatConversation variant="mobile" focusSignal={focusSignal} onOpenSettings={onOpenSettings} />
    </div>
  );
}
