'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SidebarChat() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Close expanded view when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!isFocused) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFocused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    // Placeholder - will integrate with AI later
    console.log('Chat message:', inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const shouldExpand = isExpanded || isFocused;

  return (
    <div
      ref={containerRef}
      className={cn(
        'border-t border-border bg-background transition-all duration-200 ease-out',
        shouldExpand ? 'p-3' : 'p-2'
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        if (!isFocused) setIsExpanded(false);
      }}
    >
      {/* Expanded chat area placeholder */}
      {shouldExpand && (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Sparkles className="h-3 w-3" />
            <span>Ask about your tasks, habits, or planning</span>
          </div>
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            'relative flex items-end gap-2 rounded-xl border border-border bg-card transition-all',
            shouldExpand ? 'p-2' : 'p-1.5',
            isFocused && 'border-primary/50 ring-1 ring-primary/20'
          )}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              setIsExpanded(true);
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={shouldExpand ? 'Ask anything...' : 'Chat with AI...'}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none',
              shouldExpand ? 'min-h-[24px] px-2 py-1' : 'min-h-[20px] px-2 py-0.5 text-xs'
            )}
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={!inputValue.trim()}
            className={cn(
              'shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30',
              shouldExpand ? 'h-7 w-7' : 'h-6 w-6'
            )}
          >
            <Send className={cn(shouldExpand ? 'h-4 w-4' : 'h-3 w-3')} />
          </Button>
        </div>
      </form>
    </div>
  );
}
