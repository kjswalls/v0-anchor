'use client';

import { Plus, Timer, Sunrise, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountBadge } from '@/components/primitives/pills';
import type { TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

export const BUCKET_META: Record<
  TimeBucket,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  anytime: { label: 'Anytime', icon: Timer, tint: 'text-anytime' },
  morning: { label: 'Morning', icon: Sunrise, tint: 'text-morning' },
  afternoon: { label: 'Afternoon', icon: Sun, tint: 'text-afternoon' },
  evening: { label: 'Evening', icon: Moon, tint: 'text-evening' },
};

interface BucketCardProps {
  bucket: TimeBucket;
  count: number;
  onAdd?: (bucket: TimeBucket, type: 'task' | 'habit') => void;
  /** "You are here" — lime ring on the current time-of-day bucket. */
  isCurrent?: boolean;
  /** Drop highlight while dragging over. */
  isDropTarget?: boolean;
  density?: 'full' | 'mini';
  children: React.ReactNode;
  className?: string;
}

/**
 * Floating bucket card (day-buckets / week-buckets): tinted icon + serif
 * name + count, add button, children as the row area.
 */
export function BucketCard({
  bucket,
  count,
  onAdd,
  isCurrent,
  isDropTarget,
  density = 'full',
  children,
  className,
}: BucketCardProps) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  const mini = density === 'mini';

  return (
    <section
      className={cn(
        'group/bucket rounded-card bg-surface-2 shadow-soft-sm transition-shadow',
        isCurrent && 'ring-2 ring-ring/60',
        isDropTarget && 'ring-2 ring-ring bg-primary/5',
        className
      )}
    >
      <header className={cn('flex items-center gap-2', mini ? 'px-2.5 pt-2 pb-1' : 'px-4 pt-3 pb-1.5')}>
        <Icon className={cn(meta.tint, mini ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        <h3 className={cn('flex-1 font-serif font-semibold text-muted-foreground', mini ? 'text-sm' : 'text-lg')}>
          {meta.label}
        </h3>
        <CountBadge count={count} />
        {onAdd && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/bucket:opacity-100"
            onClick={() => onAdd(bucket, 'task')}
            aria-label={`Add to ${meta.label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </header>
      <div className={cn(mini ? 'px-2 pb-2' : 'px-4 pb-3')}>{children}</div>
    </section>
  );
}
