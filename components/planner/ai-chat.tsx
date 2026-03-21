'use client';

import { useState } from 'react';
import { MessageCircle, Send, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {isOpen ? (
        <div className="w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Planning Assistant</h3>
                <p className="text-[10px] text-muted-foreground">Ask about your tasks & habits</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages area placeholder */}
          <div className="h-64 p-4 overflow-y-auto">
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">How can I help?</p>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                Ask me about your schedule, tasks, or habits. I can help you plan your day.
              </p>
            </div>
          </div>

          {/* Input area */}
          <div className="p-3 border-t border-border bg-background">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Placeholder - no action yet
                setMessage('');
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask about your planning..."
                className="flex-1 h-9 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                disabled={!message.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className={cn(
            'h-12 w-12 rounded-full shadow-lg',
            'bg-primary hover:bg-primary/90',
            'transition-transform hover:scale-105'
          )}
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
