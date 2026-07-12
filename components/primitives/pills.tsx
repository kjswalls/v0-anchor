'use client';

import { Clock, Flame } from 'lucide-react';
import type { Priority, RepeatFrequency } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Metadata pills for item rows and bucket headers (see mockups in
 * design/redesign/). All colors come from the token layer.
 */

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Med', low: 'Low' };

export function PriorityPill({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-2xs font-semibold',
        priority === 'high' && 'bg-priority-high text-priority-high-foreground',
        priority === 'medium' && 'bg-priority-medium text-priority-medium-foreground',
        priority === 'low' && 'bg-priority-low text-priority-low-foreground',
        className
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function DurationPill({ minutes, className }: { minutes: number; className?: string }) {
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  return (
    <span
      className={cn(
        'rounded-md border border-border bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground',
        className
      )}
    >
      {label}
    </span>
  );
}

export function TimePill({ time, className }: { time: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-3 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground',
        className
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {time}
    </span>
  );
}

export function StreakPill({ streak, className }: { streak: number; className?: string }) {
  if (streak <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-2xs font-semibold text-warning-text',
        className
      )}
    >
      <Flame className="h-2.5 w-2.5" />
      {streak} {streak === 1 ? 'day' : 'days'}
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-[19px] min-w-[22px] items-center justify-center rounded-[5px] bg-surface-3 px-1.5 text-[12px] font-medium tabular-nums text-muted-foreground',
        className
      )}
    >
      {count}
    </span>
  );
}

/** Outlined emoji+name chip for a project or habit group; color via inline style. */
export function TagPill({
  emoji,
  name,
  color,
  className,
}: {
  emoji?: string | null;
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-36 items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-2xs font-medium',
        className
      )}
      style={
        color
          ? {
              borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
              backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
            }
          : undefined
      }
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      <span className="truncate text-foreground/80">{name}</span>
    </span>
  );
}

const DAY_LETTERS = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

/** "Su M T W Th F Sa" chip — the days this item repeats, today emphasized. */
export function RecurrencePills({
  frequency,
  repeatDays,
  className,
}: {
  frequency?: RepeatFrequency | string;
  repeatDays?: number[];
  className?: string;
}) {
  if (!frequency || frequency === 'none') return null;

  let days: number[];
  switch (frequency) {
    case 'daily':
      days = [0, 1, 2, 3, 4, 5, 6];
      break;
    case 'weekdays':
      days = [1, 2, 3, 4, 5];
      break;
    case 'weekends':
      days = [0, 6];
      break;
    case 'monthly':
      return (
        <span className={cn('rounded-md border border-border bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground', className)}>
          monthly
        </span>
      );
    default:
      days = repeatDays ?? [];
  }
  if (days.length === 0) return null;

  const today = new Date().getDay();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-surface-3 px-1.5 py-0.5 text-2xs text-muted-foreground/70',
        className
      )}
    >
      {days.map((d) => (
        <span key={d} className={cn(d === today && 'font-bold text-foreground')}>
          {DAY_LETTERS[d]}
        </span>
      ))}
    </span>
  );
}
