'use client';

import { Sparkles, ChevronDown } from 'lucide-react';
import { ChatConversation } from '@/components/ai/chat-conversation';
import { useChatStore } from '@/lib/chat-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { useUIStore } from '@/lib/ui-store';

/**
 * Chat body inside the sidebar dock. Mounted only while expanded (summoned
 * from the omnibar: `?` / Ask Beacon / ⌘]) — there is no persistent chat
 * bar. A slim header labels the provider and collapses back to the omnibar;
 * the chevron keeps aria-label="Toggle AI assistant" for the onboarding tour.
 */
export function ChatPanel({ focusSignal }: { focusSignal: number }) {
  const toggleChat = useSidebarStore((s) => s.toggleChat);
  const { openDialog } = useUIStore();
  const provider = useAISettingsStore((s) => s.provider);
  const agentId = useChatStore((s) => s.openclawAgentIdDisplay);

  const label =
    provider === 'openclaw' ? (agentId ? `OpenClaw · ${agentId}` : 'OpenClaw') : 'Beacon';

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface-2 shadow-soft-sm">
      <button
        onClick={toggleChat}
        aria-label="Toggle AI assistant"
        title="Collapse chat (⌘])"
        className="flex w-full shrink-0 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <Sparkles className="h-4 w-4 text-ai" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
        <ChatConversation
          variant="desktop"
          hideHeader
          focusSignal={focusSignal}
          onOpenSettings={() => openDialog({ type: 'settings' })}
        />
      </div>
    </section>
  );
}
