'use client';

import { Flame } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Priority, RepeatFrequency } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Row metadata primitives — the "quiet rail".
 *
 * The old boxed pills (border + fill + 11px label, one per datum) were replaced
 * because their widths were content-driven: sitting left-aligned inside
 * fixed-width columns they produced ragged right edges and unequal gaps, and
 * tasks and habits used different column sets so a mixed list never shared an
 * edge. The fix is de-chroming, not more columns — every datum becomes either a
 * fixed-size glyph or bare tabular text, so alignment comes from identical box
 * sizes rather than from lining up unlike content.
 *
 * Color is quarantined: it lives in a 6px dot, three 2px bars, a flame, or the
 * single lime bead marking today in the weekday run — never in a container and
 * never in body text. See components/primitives/task-row.tsx for how these
 * compose into the trailing rail, and which of them reserve width.
 */

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Med', low: 'Low' };

/** How many of the three bars are lit. Count encodes level redundantly to hue,
 *  so the glyph survives colorblindness and low-contrast displays. */
const PRIORITY_BARS: Record<Priority, number> = { low: 1, medium: 2, high: 3 };

/* Static class names — Tailwind's JIT only keeps classes it can see as
   literals, so these must not be built by template interpolation. */
const PRIORITY_FILL: Record<Priority, string> = {
  low: 'bg-priority-low',
  medium: 'bg-priority-medium',
  high: 'bg-priority-high',
};
const BAR_HEIGHT = ['h-1', 'h-[7px]', 'h-2.5'];
/** Height of the tallest bar — the real vertical extent of the glyph's ink. */
const BAR_STACK_HEIGHT = 'h-2.5';

/**
 * Priority as a 16px cell-signal glyph — replaces the old solid PriorityPill.
 * Occupies the row's fixed glyph slot, so it aligns with the habit flame that
 * takes the same slot on habit rows.
 *
 * Two boxes, not one. The outer 16px square is the SLOT (and the hit/tooltip
 * target) and matches the flame's; the inner box is only as tall as the tallest
 * bar and is what actually gets centered. Bottom-aligning the bars directly
 * inside the 16px square — which is what this did before — centered the box but
 * not the ink: the bars only fill its lower 10px, so the glyph rendered 3px
 * below the row's optical center while every other rail item sat on it.
 */
export function PriorityGlyph({ priority, className }: { priority: Priority; className?: string }) {
  const lit = PRIORITY_BARS[priority];
  const label = `${PRIORITY_LABEL[priority]} priority`;
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center', className)}
    >
      <span className={cn('flex items-end gap-px', BAR_STACK_HEIGHT)}>
        {BAR_HEIGHT.map((h, i) => (
          <span
            key={h}
            className={cn('w-0.5 rounded-full', h, i < lit ? PRIORITY_FILL[priority] : 'bg-muted-foreground/25')}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Habit streak as a flame in the same 16px glyph slot: presence says "this is a
 * habit", color says "the streak is alive". The count itself renders as bare
 * numerals in the quantity slot, so the flame never changes width.
 */
export function StreakFlame({ active, className }: { active: boolean; className?: string }) {
  return (
    <Flame
      aria-hidden
      className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-warning-text' : 'text-muted-foreground/40', className)}
    />
  );
}

/**
 * Quantitative / contextual metadata: duration, start time, habit progress,
 * streak count. Bare mono text, no chrome — right-aligned in a fixed slot by
 * the caller so digits form one hard rail down the list.
 */
export function MetaText({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <span className={cn('font-num text-2xs text-muted-foreground', className)}>{children}</span>;
}

/**
 * Project / habit-group identity as a 6px color dot + muted name. The dot
 * carries the category color at full saturation (a tiny area reads in both
 * themes); the name stays muted gray so a list of tags never shouts. Callers
 * hide `nameClassName` at narrow widths, leaving the dot as a presence
 * indicator with the name on hover.
 *
 * Callers pass a FIXED width in `className` (see task-row.tsx). That is what
 * turns the dot into a rail: with the slot width constant, the dot's left edge
 * is constant too, and a name longer than the slot ellipsizes instead of pushing
 * its neighbours. Sizing this to content is what left the column ragged before.
 */
export function TagDot({
  name,
  color,
  className,
  nameClassName,
}: {
  name: string;
  color?: string;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-shrink-0 items-center gap-1.5', className)} title={name}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
      />
      <span className={cn('truncate text-2xs font-medium text-muted-foreground', nameClassName)}>{name}</span>
    </span>
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Two-letter keycap faces. Every label is the same width at a mono size, which
 *  is what lets the seven caps sit on one even pitch without a fixed width. */
const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Which weekday indices a recurrence lands on; null when it isn't a weekly pattern. */
function recurrenceDays(frequency?: RepeatFrequency | string, repeatDays?: number[]): number[] | null {
  switch (frequency) {
    case 'daily':
      return [0, 1, 2, 3, 4, 5, 6];
    case 'weekdays':
      return [1, 2, 3, 4, 5];
    case 'weekends':
      return [0, 6];
    case 'weekly':
    case 'custom':
      return repeatDays ?? [];
    default:
      return null;
  }
}

/**
 * Seven beads — which days an item repeats on. Scheduled days are a filled 5px
 * dot, the rest are drawn as a 1px ring.
 *
 * All seven positions ALWAYS render. That's the fix for what made the old boxed
 * version the worst offender in the row audit: printing only the active days
 * made the run swing 40px ("Sa Su") to 120px ("Su M T W Th F Sa"), so it never
 * lined up. Rendering all seven says strictly more, too — you can see which days
 * are *off*, not just which are on.
 *
 * Off-days are a ring rather than a faded fill so presence is carried by SHAPE,
 * not opacity: a 25%-alpha 5px dot dissolves on a dimmed laptop or a glare-lit
 * screen, an outlined one doesn't. Ring weight is theme-specific — see --day-off
 * in app/globals.css for why the two grounds can't share one alpha.
 *
 * WIDTH CONTRACT: this always occupies exactly 59px (7 × 5px + 6 × 4px gap),
 * including when the item doesn't repeat at all — it renders an empty slot
 * rather than nothing. Reserving the void is what lets a mixed task+habit list
 * put the tag column on a straight edge; see the rail comment in task-row.tsx.
 *
 * Hovering the run opens a real tooltip (not the native `title`) that expands
 * the beads into named keycaps. 5px beads are as compact as a weekly pattern
 * can get, but they cost you WHICH days without counting positions — and a
 * browser tooltip could only have handed back the same sentence in a system
 * font, at the OS's own half-second delay, unstyleable. The keycaps put the
 * letters back on the marks they belong to.
 */
const DAY_DOTS_WIDTH = 'w-[59px]';

/**
 * Hit-area bleed for the tooltip trigger. The beads are 5px tall, which is a
 * cruel target to have to land on with a mouse, so the trigger stretches to
 * the rail's height and then bleeds 6px past it in each direction — the row's
 * own py-1.5 — making the whole 59px column hoverable edge to edge.
 *
 * The negative margin is what keeps this free: flexbox sizes the line from the
 * items' OUTER hypothetical heights, so -my-1.5 cancels the py-1.5 and the rail
 * measures this slot at its 5px content height exactly as before. Nothing moves.
 *
 * The 6px is task-row's padding, and this is coupled to it — safe only because
 * DayDots renders in one place, the default-density bucket row. If it ever gets
 * a compact caller (py-1), this has to come from the caller instead.
 */
const DAY_DOTS_HIT = 'self-stretch -my-1.5 py-1.5';

export function DayDots({
  frequency,
  repeatDays,
  highlightDay,
  className,
}: {
  frequency?: RepeatFrequency | string;
  repeatDays?: number[];
  /** Weekday index to emphasize — the day this row is being rendered for. */
  highlightDay?: number;
  className?: string;
}) {
  const days = frequency === 'monthly' ? null : recurrenceDays(frequency, repeatDays);

  // Monthly recurs on a date, not a weekday, so there is nothing to plot. It
  // borrows the same fixed box and spends it on a word — "Monthly" sets to
  // ~42px at text-2xs, comfortably inside 59px, so the rail is unaffected.
  if (frequency === 'monthly') {
    return (
      <span
        /* justify-, not text-center: callers switch this slot to a flex box at
           lg, where the bare text is an anonymous flex item that text-center
           can't reach. */
        className={cn(DAY_DOTS_WIDTH, 'flex-shrink-0 justify-center text-2xs text-muted-foreground/70', className)}
      >
        Monthly
      </span>
    );
  }

  // One-off items reserve the slot and draw nothing in it.
  if (!days || days.length === 0) {
    return <span aria-hidden className={cn(DAY_DOTS_WIDTH, 'flex-shrink-0', className)} />;
  }

  const label =
    days.length === 7 ? 'Repeats every day' : `Repeats ${days.map((d) => DAY_NAMES[d]).join(', ')}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn(DAY_DOTS_WIDTH, DAY_DOTS_HIT, 'flex flex-shrink-0 items-center gap-1', className)}
        >
          {DAY_NAMES.map((name, day) => {
            const on = days.includes(day);
            const today = day === highlightDay;
            return (
              <span
                key={name}
                aria-hidden
                /* border-box keeps every bead exactly 5px whether it is filled or
                   outlined, so the run never reflows between states. */
                className={cn(
                  'h-[5px] w-[5px] flex-shrink-0 rounded-full border',
                  on ? 'bg-day-on border-day-on' : 'border-day-off',
                  today && (on ? 'bg-day-today border-day-today' : 'border-day-today')
                )}
              />
            );
          })}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {/* Same eyebrow as the History popover's label — one panel language. */}
        <div className="mb-1.5 px-0.5 text-2xs font-medium text-muted-foreground">
          {repeatSummary(days)}
        </div>
        <DayKeycaps days={days} highlightDay={highlightDay} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The pattern in words — what the beads can't say. Deliberately NOT a list of
 * day names: the caps below it already spell those out, so this line carries
 * the shape of the recurrence (and, for custom sets, how many days a week)
 * instead of repeating them.
 */
function repeatSummary(days: number[]): string {
  const has = (d: number) => days.includes(d);
  if (days.length === 7) return 'Repeats every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every(has)) return 'Repeats on weekdays';
  if (days.length === 2 && has(0) && has(6)) return 'Repeats on weekends';
  if (days.length === 1) return 'Repeats once a week';
  return `Repeats ${days.length}× a week`;
}

/**
 * The seven weekdays as keycaps — the expanded reading of the bead run, shown
 * only inside its tooltip. Scheduled days are a pressed key (recessed
 * surface-3 fill + full hairline, the boxed language RowControl already uses);
 * off days keep the cap outline but leave it empty, so the row still reads as
 * seven keys rather than as a gappy word.
 *
 * Recessed-for-on, rather than raised, because the panel is surface-2 and
 * surface-3 sits BELOW it in both themes — a raised treatment would have to
 * invert between light and dark to stay visible, and this doesn't.
 *
 * Today is marked the same way the bead is: the --day-today accent, on the
 * border and the face, independent of whether the day is on.
 */
function DayKeycaps({ days, highlightDay }: { days: number[]; highlightDay?: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {DAY_KEYS.map((key, day) => {
        const on = days.includes(day);
        const today = day === highlightDay;
        return (
          <span
            key={key}
            className={cn(
              'flex h-[19px] min-w-[23px] items-center justify-center rounded-[5px] border px-1 font-num text-2xs leading-none',
              on ? 'border-border bg-surface-3 text-foreground' : 'border-border/50 text-muted-foreground/45',
              today && 'border-day-today text-day-today'
            )}
          >
            {key}
          </span>
        );
      })}
    </span>
  );
}

/** "15m" / "1h" / "1h 30m" — the one duration format used everywhere. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Item count beside a bucket name. The only metadata that keeps a container —
 *  it's a chip in the header band, not a row datum. 20×20 minimum with 6px side
 *  padding, so a single digit reads as a square and a three-digit count grows
 *  sideways only. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-surface-3 px-1.5 font-num text-2xs font-medium text-muted-foreground',
        className
      )}
    >
      {count}
    </span>
  );
}
