'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Sparkles, MessageSquarePlus, Trash2 } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { buildAnchorContext } from '@/lib/ai-context';
import { createClient } from '@/lib/supabase';
import { isOnboardingComplete } from '@/lib/user-profile';
import { OnboardingChat } from '@/components/ai/onboarding-chat';
import { useAISettingsStore, PERSONALITY_PROMPTS } from '@/lib/ai-settings-store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_KEY = 'anchor-chat-history';
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const ASSISTANT_NAME = 'Beacon';
const OPENCLAW_NAME = 'OpenClaw';

export function MobileChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [openclawChatUrl, setOpenclawChatUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const aiProvider = useAISettingsStore((s) => s.provider);
  const displayName = aiProvider === 'openclaw' ? OPENCLAW_NAME : ASSISTANT_NAME;

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

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // Fetch OpenClaw chat URL when provider is openclaw
  useEffect(() => {
    if (aiProvider !== 'openclaw') return;
    Promise.all([
      fetch('/api/openclaw/chat-url').then((r) => r.json()),
      fetch('/api/openclaw/apikey').then((r) => r.json()),
    ])
      .then(([chatData, keyData]) => {
        setOpenclawChatUrl(chatData.chatUrl ?? null);
        if (keyData.apiKey) useAISettingsStore.getState().setOpenclawApiKey(keyData.apiKey);
      })
      .catch(() => setOpenclawChatUrl(null));
  }, [aiProvider]);

  // Load chat history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.savedAt && Date.now() - parsed.savedAt < HISTORY_TTL_MS && Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
        } else {
          localStorage.removeItem(HISTORY_KEY);
        }
      }
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  // Save chat history
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ messages, savedAt: Date.now() }));
    } catch { /* ignore */ }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const { tasks, habits, projects, habitGroups } = usePlannerStore.getState();
      const context = buildAnchorContext({ tasks, habits, projects, habitGroups });
      const { provider, apiKey, model, personality, systemPrompt, openclawApiKey } =
        useAISettingsStore.getState();
      const effectiveSystemPrompt = personality === 'custom' ? systemPrompt : PERSONALITY_PROMPTS[personality];

      let res: Response;

      if (provider === 'openclaw') {
        if (!openclawChatUrl) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                role: 'assistant',
                content: 'OpenClaw not connected yet — run `openclaw anchor-context setup` to connect.',
              };
            }
            return next;
          });
          setIsLoading(false);
          return;
        }

        const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (openclawApiKey) fetchHeaders['Authorization'] = `Bearer ${openclawApiKey}`;

        res = await fetch(openclawChatUrl, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify({ message: text, sessionKey: 'anchor-chat', context }),
        });
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages, context, provider, apiKey, model, systemPrompt: effectiveSystemPrompt }),
        });
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const { content } = JSON.parse(payload);
            if (content) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + content };
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, openclawChatUrl]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => setMessages([])}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Onboarding */}
      {showOnboarding && userId ? (
        <div className="flex-1 overflow-y-auto">
          <OnboardingChat userId={userId} onComplete={handleOnboardingComplete} />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                <div className="relative">
                  <MessageSquarePlus className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.25} />
                  <Sparkles className="h-5 w-5 text-primary/60 absolute -top-1 -right-1" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium text-foreground">
                    Plan with {displayName}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                    {aiProvider === 'openclaw'
                      ? `Ask anything — ${displayName} knows your tasks and habits.`
                      : aiProvider === 'none'
                      ? 'Connect an AI provider in Settings to start chatting.'
                      : 'Ask me to break down tasks, plan your day, or think through what to tackle next.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-4 py-4">
                {messages.map((msg, i) => (
                  <div key={i} className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
                    <div className={[
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm',
                    ].join(' ')}>
                      {(msg.role === 'assistant'
                        ? msg.content?.replace(/^\[\[reply_to[^\]]*\]\]\s*/i, '')
                        : msg.content
                      ) || (msg.role === 'assistant' && isLoading && i === messages.length - 1
                        ? <LoadingDots />
                        : null
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                      <LoadingDots />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-3 pb-3 pt-2 border-t border-border bg-card">
            <div className="rounded-xl border border-border bg-background focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-colors">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${displayName} anything…`}
                rows={1}
                className="resize-none min-h-0 text-sm leading-6 py-3 px-3 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                disabled={isLoading}
              />
              <div className="flex items-center justify-end px-2 pb-2">
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
