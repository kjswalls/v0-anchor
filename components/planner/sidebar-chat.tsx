'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
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

export function SidebarChat() {
  const { provider, apiKey, model, assistantName, systemPrompt } = useAISettingsStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isDisabled = provider === 'none' || (provider === 'openai' && !apiKey);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 24 * 3 + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  }, [input]);

  const getEffectiveSystemPrompt = useCallback(() => {
    return systemPrompt || BEACON_SYSTEM_PROMPT;
  }, [systemPrompt]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || isDisabled) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          provider,
          model,
          apiKey,
          systemPrompt: getEffectiveSystemPrompt(),
        }),
      });

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
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + content };
                }
                return next;
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = {
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
          };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isDisabled, messages, provider, model, apiKey, getEffectiveSystemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="border-t border-border bg-background">
      {/* Message list — only shown when there are messages */}
      {messages.length > 0 && (
        <ScrollArea className="max-h-[200px] px-2 pt-2">
          <div className="flex flex-col gap-2 pb-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(
                  ' '
                )}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  ].join(' ')}
                >
                  {msg.content ||
                    (msg.role === 'assistant' && isLoading && i === messages.length - 1 ? (
                      <LoadingDots />
                    ) : null)}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl rounded-bl-sm px-2.5 py-1.5">
                  <LoadingDots />
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </ScrollArea>
      )}

      {/* Input area */}
      <div className="p-2">
        {isDisabled ? (
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
            <p className="text-xs text-muted-foreground/70 leading-snug">
              Add your API key in{' '}
              <span className="inline-flex items-center gap-0.5 font-medium text-muted-foreground">
                Settings <Settings className="h-2.5 w-2.5" /> AI Assistant
              </span>{' '}
              to chat with {assistantName}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-end gap-1 px-2 py-1.5">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${assistantName}…`}
                rows={1}
                className="resize-none min-h-0 border-0 bg-transparent shadow-none text-xs leading-6 py-0.5 flex-1 focus-visible:ring-0 placeholder:text-muted-foreground/50"
                disabled={isLoading}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
