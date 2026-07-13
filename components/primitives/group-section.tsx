'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "/ Habits"-style slash-label section: lime slash mark (Figma 140:1241) +
 * muted label + hover-revealed chevron that collapses/expands the rows,
 * Linear-style. Collapse state is local — resets on unmount, cheap v1.
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
        className="group/heading flex items-center gap-1 px-1 pb-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="mr-0.5 text-primary">/</span>
        {label}
        <ChevronDown
          className={cn(
            'h-3 w-3 opacity-0 transition-[transform,opacity] group-hover/heading:opacity-100',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && <div className="space-y-0">{children}</div>}
    </div>
  );
}
