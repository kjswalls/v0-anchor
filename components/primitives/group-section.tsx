'use client';

import { cn } from '@/lib/utils';

/**
 * "/ Habits"-style sentence-case slash-label section used to group rows
 * inside buckets and lists (Linear-style exploration).
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
      <div className="px-1 pb-1 text-sm font-medium text-muted-foreground">
        <span className="mr-1 text-muted-foreground/40">/</span>
        {label}
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
