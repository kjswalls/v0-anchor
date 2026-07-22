'use client';

import { Timer, Sunrise, Sun, Moon } from 'lucide-react';
import { AddIconButton } from '@/components/primitives/add-icon-button';
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
 * Bucket card (day-buckets / week-buckets): light card (#FBFBFB, #EEEDED
 * stroke, r20) with a white header band (tinted icon + sans name + count +
 * add button), children as the row area. The add button is a rounded-square
 * box (r5, muted-foreground hairline) per the Figma mockup (node 62:38).
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
        'group/bucket rounded-[20px] border border-surface-3 bg-surface-2 transition-shadow',
        isCurrent && 'ring-2 ring-ring/60',
        isDropTarget && 'ring-2 ring-ring bg-primary/5',
        className
      )}
    >
      <header
        className={cn(
          'flex items-center gap-2 rounded-t-[20px] border-b border-surface-3 bg-canvas',
          mini ? 'h-[38px] px-3' : 'h-[45px] px-[21px]'
        )}
      >
        <Icon className={cn(meta.tint, mini ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        {/* Bucket label — Inter Regular 14→13 ramp, muted (mockup header band) */}
        <h3 className={cn('flex-1 font-sans font-normal text-muted-foreground', mini ? 'text-xs' : 'text-sm')}>
          {meta.label}
        </h3>
        <CountBadge count={count} />
        {onAdd && (
          <AddIconButton
            size={mini ? 'sm' : 'md'}
            onClick={() => onAdd(bucket, 'task')}
            aria-label={`Add to ${meta.label}`}
          />
        )}
      </header>
      <div className={cn(mini ? 'px-2.5 pb-2 pt-1' : 'px-[23px] pb-4 pt-2')}>{children}</div>
    </section>
  );
}
