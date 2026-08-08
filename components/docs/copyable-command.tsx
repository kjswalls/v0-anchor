'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A shell command in a docs page, with a copy button.
 * Styled to match the command block on /connect.
 */
export function CopyableCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2',
        className
      )}
    >
      <code className="flex-1 min-w-0 overflow-x-auto font-mono text-xs text-foreground whitespace-pre">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
