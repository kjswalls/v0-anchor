'use client';

import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { ChatConversation } from '@/components/ai/chat-conversation';
import { useChatStore } from '@/lib/chat-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { useUIStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/**
 * Chat card in the sidebar (P4): collapsed it's a slim "Beacon" bar, expanded
 * it holds the shared ChatConversation. Replaces the right chat drawer.
 * Keeps data-tour="right-sidebar" so the existing tour step still resolves
 * until the P7 tour rewrite.
 */
export function ChatPanel({ focusSignal }: { focusSignal: number }) {
  const { chatExpanded, toggleChat } = useSidebarStore();
  const { openDialog } = useUIStore();
  const provider = useAISettingsStore((s) => s.provider);
  const agentId = useChatStore((s) => s.openclawAgentIdDisplay);

  const label =
    provider === 'openclaw' ? (agentId ? `OpenClaw · ${agentId}` : 'OpenClaw') : 'Beacon';

  return (
    <section
      data-tour="right-sidebar"
      className={cn(
        'flex min-h-0 flex-col rounded-card bg-surface-2 shadow-soft-md',
        chatExpanded ? 'flex-1' : 'flex-none'
      )}
    >
      <button
        onClick={toggleChat}
        aria-label="Toggle AI assistant"
        title={chatExpanded ? 'Collapse chat (⌘])' : 'Expand chat (⌘])'}
        className="flex w-full shrink-0 items-center gap-2 rounded-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <Sparkles className="h-4 w-4 text-ai" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{label}</span>
        {chatExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {chatExpanded && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
          <ChatConversation
            variant="desktop"
            hideHeader
            focusSignal={focusSignal}
            onOpenSettings={() => openDialog({ type: 'settings' })}
          />
        </div>
      )}
    </section>
  );
}
