'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Sparkles, MessageSquarePlus, Copy, Check, Plus, Mic, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { OnboardingChat } from '@/components/ai/onboarding-chat';
import { TypingIndicator } from '@/components/ui/typing-indicator';
import { useChatStore } from '@/lib/chat-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useTimeFormat } from '@/lib/use-time-format';
import { formatChatTimestamp } from '@/lib/format-chat-timestamp';
import { stripReasoningTags } from '@/lib/chat-utils';
import { createClient } from '@/lib/supabase';
import { isOnboardingComplete } from '@/lib/user-profile';
import { cn } from '@/lib/utils';

const ASSISTANT_NAME = 'Beacon';
const OPENCLAW_NAME = 'OpenClaw';

interface ChatConversationProps {
  variant: 'desktop' | 'mobile';
  onOpenSettings?: () => void;
  /** Increment to focus the input (e.g. when the panel expands / tab activates). */
  focusSignal?: number;
  /** Hide the provider header row (the desktop panel renders its own). */
  hideHeader?: boolean;
}

/**
 * The Beacon/OpenClaw conversation (messages + input) on top of chat-store.
 * Shared by the desktop sidebar chat panel and the mobile chat tab —
 * replaces the duplicated bodies of chat-sidebar and mobile-chat-panel.
 */
export function ChatConversation({ variant, onOpenSettings, focusSignal, hideHeader }: ChatConversationProps) {
  const { messages, isLoading, isTyping, send, hydrate, syncOpenclawInfo, openclawAgentIdDisplay } =
    useChatStore();
  const aiProvider = useAISettingsStore((s) => s.provider);
  const aiApiKey = useAISettingsStore((s) => s.apiKey);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const timeFormatStr = useTimeFormat();

  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isMobile = variant === 'mobile';
  const displayName = aiProvider === 'openclaw' ? OPENCLAW_NAME : ASSISTANT_NAME;

  useEffect(() => {
    hydrate();
    syncOpenclawInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check auth + onboarding status
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      setUserId(uid);
      const done = await isOnboardingComplete(uid);
      if (!done) setShowOnboarding(true);
    });
  }, []);

  // Focus input on request
  useEffect(() => {
    if (focusSignal !== undefined && focusSignal > 0) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [focusSignal]);

  // Auto-scroll to bottom — scroll within container, not the whole page
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, isTyping]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  const copyMessage = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    send(text);
  };

  if (showOnboarding && userId) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OnboardingChat userId={userId} onComplete={() => setShowOnboarding(false)} />
      </div>
    );
  }

  return (
    <>
      {!hideHeader && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <p className="text-2xs font-medium text-muted-foreground">
            {aiProvider === 'openclaw'
              ? openclawAgentIdDisplay
                ? `OpenClaw · ${openclawAgentIdDisplay}`
                : 'OpenClaw'
              : 'Beacon'}
          </p>
        </div>
      )}

      {/* Messages with fade at top */}
      <div ref={messagesContainerRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'pointer-events-none sticky top-0 z-10 bg-gradient-to-b from-surface-1 to-transparent',
            isMobile ? 'h-16 from-background' : 'h-8'
          )}
        />

        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <div className="relative">
              <MessageSquarePlus
                className={cn('text-muted-foreground/40', isMobile ? 'h-14 w-14' : 'h-10 w-10')}
                strokeWidth={1.25}
              />
              <Sparkles
                className={cn('absolute -top-1 -right-1 text-ai', isMobile ? 'h-6 w-6' : 'h-4 w-4')}
              />
            </div>
            {aiProvider === 'openai' && !aiApiKey ? (
              <div className="space-y-2">
                <p className={cn('font-medium text-foreground', isMobile ? 'text-lg' : 'text-sm')}>
                  API key needed
                </p>
                <p className="max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                  Beacon needs an API key to get started.
                </p>
                {onOpenSettings && (
                  <button onClick={onOpenSettings} className="text-xs text-success-text hover:underline">
                    → Go to Settings
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className={cn('font-serif font-semibold text-foreground', isMobile ? 'text-lg' : 'text-base')}>
                  {aiProvider === 'openclaw' ? `${displayName} is ready` : `Plan with ${displayName}`}
                </p>
                <p className="max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                  {aiProvider === 'openclaw' ? (
                    `Ask anything — ${displayName} knows your tasks, habits, and projects.`
                  ) : aiProvider === 'none' ? (
                    <span>
                      Connect <span className="font-medium text-foreground">OpenClaw</span> in Settings
                      for your personal AI agent, or add an OpenAI key to use Beacon.
                    </span>
                  ) : (
                    'Ask me to break down tasks, plan your day, or think through what to tackle next.'
                  )}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className={cn('flex flex-col gap-3 px-4 pb-4', isMobile ? '-mt-12' : '-mt-6')}>
            {messages.map((msg, i) => (
              <div key={i} className="group">
                {msg.role === 'user' ? (
                  <div className="flex items-start justify-end gap-3">
                    <div className="flex max-w-[85%] flex-col items-end gap-1">
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                        {msg.content}
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-2 transition-opacity',
                          isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'
                        )}
                      >
                        {msg.timestamp && (
                          <span className="text-2xs text-muted-foreground">
                            {formatChatTimestamp(msg.timestamp, timeFormatStr, userTimezone)}
                          </span>
                        )}
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {copiedIndex === i ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm leading-relaxed text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-success-text prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-3 prose-a:text-success-text prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground">
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {stripReasoningTags(msg.content).replace(/^\[\[reply_to[^\]]*\]\]\s*/i, '')}
                        </ReactMarkdown>
                      ) : isTyping && i === messages.length - 1 ? (
                        <TypingIndicator />
                      ) : isLoading && i === messages.length - 1 ? (
                        <LoadingDots />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-2 transition-opacity',
                        isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'
                      )}
                    >
                      {msg.timestamp && (
                        <span className="text-2xs text-muted-foreground">
                          {formatChatTimestamp(msg.timestamp, timeFormatStr, userTimezone)}
                        </span>
                      )}
                      {msg.content && (
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {copiedIndex === i ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="text-sm text-foreground">
                <LoadingDots />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={cn('shrink-0 px-3 pb-3 pt-2', isMobile && 'border-t border-border bg-background')}>
        <div className="rounded-2xl border border-border bg-muted/30 transition-colors focus-within:bg-muted/50">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${displayName}...`}
            rows={1}
            className="min-h-0 resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6 shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoading}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn('rounded-full text-muted-foreground', isMobile ? 'h-9 w-9' : 'h-8 w-8')}
              disabled
              title="Attach files (coming soon)"
            >
              <Plus className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            </Button>
            {input.trim() ? (
              <Button
                size="icon"
                className={cn('rounded-full', isMobile ? 'h-9 w-9' : 'h-8 w-8')}
                onClick={handleSend}
                disabled={isLoading}
                aria-label="Send"
              >
                <ArrowUp className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className={cn('rounded-full text-muted-foreground', isMobile ? 'h-9 w-9' : 'h-8 w-8')}
                disabled
                title="Voice input (coming soon)"
              >
                <Mic className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground opacity-60"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
