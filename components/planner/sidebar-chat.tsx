'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Sparkles, ArrowUp } from 'lucide-react';
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
      {/* Expanded chat info */}
      {shouldExpand && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Sparkles className="h-3 w-3" />
          <span>Ask about your tasks, habits, or planning</span>
        </div>
      )}

      {/* Input container - v0 style */}
      <div
        className={cn(
          'rounded-xl border border-border bg-card overflow-hidden transition-all',
          isFocused && 'border-primary/50 ring-1 ring-primary/20'
        )}
      >
        {/* Text input area */}
        <div className={cn('relative px-3', shouldExpand ? 'pt-3 pb-2' : 'py-0')}>
          {/* Custom placeholder with sparkle icon for collapsed state */}
          {!shouldExpand && !inputValue && (
            <div className="absolute inset-0 flex items-center gap-1.5 px-3 pointer-events-none text-muted-foreground/60">
              <Sparkles className="h-3 w-3 flex-shrink-0" />
              <span className="text-xs">Do all this for me...</span>
            </div>
          )}
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
            placeholder={shouldExpand ? 'Ask anything...' : ''}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent placeholder:text-muted-foreground/60 focus:outline-none',
              shouldExpand ? 'min-h-[24px] text-sm' : 'min-h-[32px] text-xs flex items-center leading-[32px]'
            )}
          />
        </div>

        {/* Bottom toolbar row - v0 style */}
        <div className={cn(
          'flex items-center justify-between px-2 pb-2',
          !shouldExpand && 'hidden'
        )}>
          {/* Left side - action buttons */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Add context"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="AI features"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>

          {/* Right side - send button */}
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className={cn(
              'h-7 w-7 rounded-lg transition-colors',
              inputValue.trim()
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>

        {/* Collapsed send button */}
        {!shouldExpand && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
