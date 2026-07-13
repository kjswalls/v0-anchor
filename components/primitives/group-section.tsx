'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "/ Habits"-style slash-label section: lime slash mark (Figma 140:1241) +
 * label in the content color + a chevron that collapses/expands the rows.
 * The whole heading row is the hit target — hovering anywhere reveals the
 * chevron and a subtle highlight, Linear-style. Collapse state is local.
 */
export function GroupSection({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={className}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="group/heading flex w-full items-center gap-1 rounded-[5px] px-1 py-1 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        <span className="mr-0.5 text-primary">/</span>
        {label}
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground opacity-0 transition-[transform,opacity] group-hover/heading:opacity-100',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && <div className="space-y-0">{children}</div>}
    </div>
  );
}
