'use client';

import { cn } from '@/lib/utils';

/**
 * "/ HABITS"-style slash-label section used to group rows inside buckets
 * and lists (see design/redesign mockups).
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
  return (
    <div className={className}>
      <div className="px-1 pb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
        <span className="mr-1 text-muted-foreground/40">/</span>
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
