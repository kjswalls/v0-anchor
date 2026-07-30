'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SkipForward, Undo2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupSection } from '@/components/primitives/group-section';
import { TaskRow, type RowItem } from '@/components/primitives/task-row';
import { PriorityGlyph, MetaText, RollingMetaText, formatDuration } from '@/components/primitives/pills';
import { useDayItems } from '@/hooks/use-day-items';
import { useFitHourPx, useResizeScrollCompensation } from '@/lib/use-fit-hour-px';
import { useScheduleResizeStore } from '@/lib/schedule-resize-store';
import { HOUR_PX } from '@/lib/schedule-constants';
import { getItemTypeConfig } from '@/lib/item-registry';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor } from '@/lib/ui-store';
import { useNowMinutes } from '@/lib/use-now-minutes';
import { useTimeFormat } from '@/lib/use-time-format';
import { isRecurring, isCompletedOnDate, isSkippedOnDate, toDateStr } from '@/lib/recurrence';
import { BUCKET_ORDER } from '@/lib/day-items';
import type { DayItems } from '@/lib/day-items';
import type { Task, Habit, TimeBucket } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

/**
 * Day × Schedule (P5d, per desktop_day_scheduleView.png): untimed items in
 * an ANYTIME section up top, then an hour gutter with duration-height
 * blocks. Dropping on an hour slot schedules at the top of that hour
 * (`hour:{H}`, CONTRACT.md).
 *
 * The block + derivation helpers are exported so week-schedule reuses them.
 *
 * ── The timeline's visual language ────────────────────────────────────────
 * Every block stands beside a LANE. The lane carries a hairline rail; the item's
 * accent swells that rail to 2px for exactly as long as the event runs, and a
 * bead pins its start on the hour line. So the accent is a mark ON the grid,
 * with real extent, rather than a stripe glued to a card — and the block itself
 * is lit from the rail side (see --sched-* in app/globals.css) so the colour
 * reads as a light source instead of as a coloured container.
 *
 * On hover the block picks up drafting-style REGISTRATION MARKS: four corner
 * crops and a caliper datum centred on each resizable edge. They sit OUTSIDE the
 * pane, the way real crop marks sit off the object they register, which is why
 * the component is built as an outer positioning wrapper around an
 * overflow-hidden pane — the pane would clip them — and why a hovered block
 * raises its z-index, so a flush neighbour can't paint over them.
 */

export { HOUR_PX };

/** Width of the lane the rail, bead and now-marker live in. The pane starts
 *  here, and so do the hour hairlines, so the lane reads as one unbroken
 *  channel down the grid instead of a series of gaps. */
export const LANE_PX = 12;

/** The pane is nudged down from its true start and shortened by twice that, so
 *  back-to-back blocks show a seam instead of touching. The rail span and bead
 *  ignore the nudge — they sit on the real time. */
const PANE_OFFSET = 3;
const PANE_TRIM = 4;
/** Floor for a pane's height: one line of text (17px) plus its 12px padding. */
const PANE_MIN_H = 34;
/** Above this the block splits its metadata onto a second row. */
const PANE_TALL_H = 56;

/**
 * Day view: the gutter's width, which is also the events layer's left offset —
 * the two now meet. They used to be 88 and 132, leaving 44px of nothing between
 * the hour labels and the first thing they label. That gap was survivable while
 * the gutter was a bordered box that read as its own object; against a bare
 * column of marks it just reads as the labels having drifted off the grid, and
 * it separated the live time from its own diamond by the width of a thumb.
 *
 * Sized to hold the widest thing the column prints — the live time at
 * "12:40 pm" — with the inset below, and no wider: every px past that reopens
 * the gap the labels just closed.
 */
export const DAY_FIELD_LEFT = 68;

/**
 * Where the hour marks start. This is TaskRow's own `px-2`, which is what puts
 * the Anytime rows' checkboxes at x=8 — and both the Anytime section and the
 * hour grid are direct children of the same canvas-container, so they share an
 * origin. Left-aligning the marks here therefore runs ONE edge down the whole
 * view: checkbox, checkbox, checkbox, 8 am, 9 am, 10 am.
 *
 * That's the reason these are left-aligned rather than right-aligned against
 * the lane, which is what the source study does. The study had no Anytime
 * section above its grid to answer to; this view does, and a shared edge with
 * the thing directly above beats a shared edge with the lane beside.
 */
export const DAY_GUTTER_INSET = 'pl-2';

/**
 * A clock time from minutes-since-midnight, in the user's 12h/24h preference.
 * `meridiem: false` drops the am/pm — used for the in-block start–end range,
 * where printing it twice spends the block's scarcest resource on nothing.
 */
export function formatClock(totalMin: number, timeFormatStr: string, meridiem = true) {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const hour = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  if (timeFormatStr === 'HH:mm') return `${String(hour).padStart(2, '0')}:${mm}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return meridiem ? `${h12}:${mm} ${hour < 12 ? 'am' : 'pm'}` : `${h12}:${mm}`;
}

/**
 * The live-time marker: a lime diamond seated on the rail, plus a short stub of
 * rule reaching into the lane.
 *
 * The rule is a STUB by design — it stops at the pane and never crosses it. A
 * lime hairline under 72%-opacity glass composites to a dimmed olive, and lime
 * is never allowed to dim (it is the one accent that stays at full strength in
 * both themes). So the marker lives in the lane, where nothing is layered over
 * it, and the hour gutter carries the reading of the clock.
 */
export function NowMarker({ top }: { top: number }) {
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-[5]" style={{ top }} aria-hidden>
      <span className="absolute left-[2px] top-[-3.5px] h-[7px] w-[7px] rotate-45 bg-primary shadow-[0_0_0_1px_var(--canvas)]" />
      <span className="absolute left-3 top-0 w-6 border-t border-primary" />
    </div>
  );
}

/** How close (px) the live time has to fall to an hour label before that label
 *  steps aside for it. Both share the gutter column, so one of them has to. */
export const ECLIPSE_PX = 34;

/* Literal class names — Tailwind's JIT only keeps classes it can see as
   literals, so the week title's clamp can't be built by interpolation. Index is
   the line count minus one; anything past six lines is already more block than
   a week column ever gets. */
const LINE_CLAMP = [
  'line-clamp-1',
  'line-clamp-2',
  'line-clamp-3',
  'line-clamp-4',
  'line-clamp-5',
  'line-clamp-6',
];

export type TimedEntry = {
  itemType: 'task' | 'habit';
  item: Task | Habit;
  startMin: number;
  duration: number;
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** The type's own fallback block length, for an item with no duration set. */
function defaultMinutes(item: Task | Habit, itemType: 'task' | 'habit'): number {
  const projected = item as { type?: string; customType?: string };
  return getItemTypeConfig(projected.type === 'custom' ? projected.customType! : itemType).schedule
    .defaultBlockMinutes;
}

/** Timed items (tasks/habits with startTime + project-block tasks) for one day. */
export function deriveTimedEntries(day: DayItems): TimedEntry[] {
  const allTasks = BUCKET_ORDER.flatMap((b) => day.tasksByBucket[b]);
  const allHabits = BUCKET_ORDER.flatMap((b) => day.habitsByBucket[b]);
  return [
    // Both branches read the item's own duration and fall back to the registry's
    // defaultBlockMinutes. The habit branch used to hardcode 30 because habits
    // had no duration field at all; now that they do, a habit block is as long as
    // the habit says it is.
    ...allHabits
      .filter((h) => h.startTime)
      .map((h) => ({
        itemType: 'habit' as const,
        item: h,
        startMin: toMin(h.startTime!),
        duration: h.duration ?? defaultMinutes(h, 'habit'),
      })),
    ...allTasks
      .filter((t) => t.startTime && !t.inProjectBlock)
      .map((t) => ({
        itemType: 'task' as const,
        item: t,
        startMin: toMin(t.startTime!),
        duration: t.duration ?? defaultMinutes(t, 'task'),
      })),
    ...day.recurringProjects
      .filter((p) => p.startTime)
      .flatMap((p) =>
        allTasks
          .filter((t) => t.inProjectBlock && t.project === p.name)
          .map((t) => ({ itemType: 'task' as const, item: t, startMin: toMin(p.startTime!), duration: p.duration ?? 60 }))
      ),
  ].sort((a, b) => a.startMin - b.startMin);
}

/** Untimed items (no startTime, not in a project block) for one day. */
export function deriveUntimedRows(day: DayItems): RowItem[] {
  const allTasks = BUCKET_ORDER.flatMap((b) => day.tasksByBucket[b]);
  const allHabits = BUCKET_ORDER.flatMap((b) => day.habitsByBucket[b]);
  return [
    ...allHabits.filter((h) => !h.startTime).map((h) => ({ itemType: 'habit' as const, item: h })),
    ...allTasks.filter((t) => !t.startTime && !t.inProjectBlock).map((t) => ({ itemType: 'task' as const, item: t })),
  ];
}

/**
 * Visible hour window for a schedule grid: the content's own span padded by an
 * hour of context each side, floored to a minimum span so a light day isn't a
 * cramped sliver. Empty days fall back to a sane 8am–7pm. This replaces the old
 * always-pad-to-8..19 rule — which only ever grew the grid — so the range now
 * tracks what's actually scheduled, then `useFitHourPx` shrinks the rows to fit.
 */
export const GRID_MIN_SPAN = 8;

/** While a drag is active the grid expands to the full day so every hour is a
 *  drop target — the compact content window alone strands the boundary blocks
 *  (the latest block has no rows beneath it, off-window hours are unreachable). */
export const FULL_DAY_RANGE = { gridStartHour: 0, gridEndHour: 24 } as const;

/**
 * `includeMin` is a minute-of-day the window must contain — the live clock, on
 * a grid showing today. Without it the now-marker had nowhere to render on any
 * day whose items don't happen to bracket the current hour (an evening-only day
 * at 9am, an empty day at 7am), which reads as the marker being broken rather
 * than as the window being tight. Pass null to leave the window content-fit.
 */
export function deriveGridRange(
  entries: TimedEntry[],
  includeMin?: number | null
): { gridStartHour: number; gridEndHour: number } {
  let start: number;
  let end: number;
  if (entries.length === 0) {
    start = 8;
    end = 19;
  } else {
    start = Math.max(0, Math.min(...entries.map((e) => Math.floor(e.startMin / 60))) - 1);
    end = Math.min(24, Math.max(...entries.map((e) => Math.ceil((e.startMin + e.duration) / 60))) + 1);
  }
  if (includeMin != null) {
    start = Math.max(0, Math.min(start, Math.floor(includeMin / 60)));
    end = Math.min(24, Math.max(end, Math.floor(includeMin / 60) + 1));
  }
  if (end - start < GRID_MIN_SPAN) {
    const mid = (start + end) / 2;
    start = Math.max(0, Math.round(mid - GRID_MIN_SPAN / 2));
    end = Math.min(24, start + GRID_MIN_SPAN);
    start = Math.max(0, end - GRID_MIN_SPAN);
  }
  return { gridStartHour: start, gridEndHour: end };
}

/**
 * The gutter's hour mark. In 12h the ":00" is dropped — every label in the
 * column sits on the hour, so the zeroes are two characters of nothing repeated
 * down the grid, and dropping them is what lets the live time ("2:40 pm") read
 * as the one label with minutes on it. 24h keeps "07:00": a bare "07" isn't a
 * time in that idiom.
 */
export function formatHourLabel(hour: number, timeFormatStr: string) {
  if (timeFormatStr === 'HH:mm') return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return '12 am';
  if (hour < 12) return `${hour} am`;
  if (hour === 12) return '12 pm';
  return `${hour - 12} pm`;
}

function HourSlot({
  hour,
  isActive,
  label,
  isFirst,
  hourPx,
  eclipsed,
}: {
  hour: number;
  isActive: boolean;
  label: string;
  isFirst: boolean;
  hourPx: number;
  /** The live time is sitting on this label — it yields the column. */
  eclipsed?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `hour:${hour}`, disabled: !isActive });
  return (
    <div
      ref={setNodeRef}
      data-dnd-id={`hour:${hour}`}
      data-dnd-over={isOver ? 'true' : 'false'}
      className="relative flex"
      style={{ height: hourPx }}
    >
      {/* Gutter: a bare column of mono marks, no box. The old bordered cells
          drew a second grid beside the real one — every hour boxed on three
          sides — which competed with the hairlines that actually carry the time.
          Mono at text-2xs puts them in the same voice as every other numeral in
          the app (durations, streaks, the live time below), and they start on
          the Anytime checkboxes' edge — see DAY_GUTTER_INSET. */}
      <div
        className={cn('flex-shrink-0 pt-[3px] font-num text-2xs text-muted-foreground', DAY_GUTTER_INSET)}
        style={{ width: DAY_FIELD_LEFT }}
      >
        <span className={cn(eclipsed && 'opacity-0')}>{label}</span>
      </div>
      {/* Hour line in the event area. It starts at the PANE (field + lane), not
          short of it, so the lane stays an unbroken channel; the right inset is
          Figma's. None above the first row. */}
      {!isFirst && (
        <div
          className={cn(
            'pointer-events-none absolute right-[17px] top-0 border-t border-border/50',
            isActive && 'border-dashed'
          )}
          style={{ left: DAY_FIELD_LEFT + LANE_PX }}
        />
      )}
      <div className={cn('flex-1 transition-colors', isOver && 'bg-primary/10')} />
    </div>
  );
}

export function ScheduleBlock({
  entry,
  gridStartMin,
  date,
  hourPx = HOUR_PX,
  variant = 'day',
}: {
  entry: TimedEntry;
  gridStartMin: number;
  date?: Date;
  hourPx?: number;
  /** Week columns are ~140px wide. They drop the emission wash and the whole
   *  metadata rail and spend the width on a WRAPPING title instead — see the
   *  content block below. */
  variant?: 'day' | 'week';
}) {
  const {
    getProjectColor,
    getHabitGroupColor,
    selectedDate,
    userTimezone,
    toggleTaskStatus,
    setItemSkipped,
    updateTask,
    updateHabit,
  } = usePlannerStore();
  const timeFormatStr = useTimeFormat();
  const isWeek = variant === 'week';
  const { item, itemType } = entry;
  const isTask = itemType === 'task';
  const task = isTask ? (item as Task) : null;
  const habit = !isTask ? (item as Habit) : null;

  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rowDate = date ?? selectedDate;
  const dateStr = toDateStr(rowDate, timezone);
  const done = isTask
    ? isRecurring(task!)
      ? isCompletedOnDate(task!, dateStr)
      : task!.status === 'completed'
    : habit!.completedDates.includes(dateStr);

  const accent = isTask
    ? task!.project
      ? getProjectColor(task!.project)
      : 'var(--primary)'
    : getHabitGroupColor(habit!.group);

  // Drag-to-resize an own-timed block. Bottom edge changes duration; top edge
  // changes start (bottom fixed). Live preview from local state; the store write
  // lands on pointer-up.
  //
  // WHETHER a type may be resized is a registry capability, not a task-vs-habit
  // branch — habits declare `resizable: false` because habitShape carries no
  // `duration` field to write the result to, and custom types declare true and
  // ride the task pipeline. The projected `Task`/`Habit` doesn't type its own
  // discriminator, so the registry name is resolved the way TaskRow's
  // delete-confirm resolves it. Project blocks are still excluded outright: they
  // take their extent from the project, not from the item.
  const projected = item as { type?: string; customType?: string };
  const typeName = projected.type === 'custom' ? projected.customType! : itemType;
  const typeConfig = getItemTypeConfig(typeName);
  const canResize = typeConfig.schedule.resizable && !!item.startTime && !task?.inProjectBlock;
  // Same capability + recurrence gate the row uses (lib/item-registry
  // isSkippable), resolved against the projection's runtime discriminator.
  const skipped =
    typeConfig.skippable && isRecurring(item) && isSkippedOnDate(item, dateStr);
  const [preview, setPreview] = useState<{ startMin: number; duration: number } | null>(null);
  const effStartMin = preview?.startMin ?? entry.startMin;
  const effDuration = preview?.duration ?? entry.duration;

  // Resize flips a global flag; the grid then expands to the full day at a frozen
  // scale (so the block doesn't rescale under the cursor) and we auto-scroll to
  // follow the dragged edge — so you can see and reach any target time. The edge
  // is tracked in CONTENT space (pointer delta + scroll delta), so both the
  // auto-scroll and the one-time expand-compensation extend the resize correctly.
  const setResizing = useScheduleResizeStore((s) => s.setResizing);
  const resizeRef = useRef<{
    edge: 'top' | 'bottom';
    startMin: number;
    duration: number;
    hourPx: number;
    viewport: HTMLElement | null;
    clientYBase: number;
    scrollTopBase: number | null;
  } | null>(null);
  const pointerYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const snap = (m: number) => Math.round(m / 15) * 15;
  const minToTime = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const bucketForMin = (m: number): TimeBucket => {
    const h = Math.floor(m / 60);
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  };

  const applyResize = () => {
    const r = resizeRef.current;
    if (!r || !r.viewport) return;
    // Baseline scroll captured on first apply — AFTER the expand-compensation has
    // settled — so only genuine (auto/user) scrolling extends the resize.
    if (r.scrollTopBase === null) r.scrollTopBase = r.viewport.scrollTop;
    const deltaPx = pointerYRef.current - r.clientYBase + (r.viewport.scrollTop - r.scrollTopBase);
    const delta = (deltaPx / r.hourPx) * 60;
    if (r.edge === 'bottom') {
      setPreview({ startMin: r.startMin, duration: Math.max(15, snap(r.duration + delta)) });
    } else {
      const end = r.startMin + r.duration;
      const ns = Math.min(Math.max(0, snap(r.startMin + delta)), end - 15);
      setPreview({ startMin: ns, duration: end - ns });
    }
  };

  // While resizing, scroll the viewport when the cursor nears its top/bottom edge
  // and re-apply so the dragged edge keeps tracking the pointer as rows scroll in.
  const autoScrollTick = () => {
    const r = resizeRef.current;
    if (!r || !r.viewport) {
      rafRef.current = null;
      return;
    }
    const rect = r.viewport.getBoundingClientRect();
    const EDGE = 56;
    const y = pointerYRef.current;
    let dy = 0;
    if (y > rect.bottom - EDGE) dy = Math.min(16, (y - (rect.bottom - EDGE)) / 3);
    else if (y < rect.top + EDGE) dy = -Math.min(16, (rect.top + EDGE - y) / 3);
    if (dy !== 0) {
      r.viewport.scrollTop += dy;
      applyResize();
    }
    rafRef.current = requestAnimationFrame(autoScrollTick);
  };

  const onResizeDown = (edge: 'top' | 'bottom', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const viewport = (e.currentTarget as HTMLElement).closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null;
    resizeRef.current = {
      edge,
      startMin: entry.startMin,
      duration: entry.duration,
      hourPx,
      viewport,
      clientYBase: e.clientY,
      scrollTopBase: null,
    };
    pointerYRef.current = e.clientY;
    setPreview({ startMin: entry.startMin, duration: entry.duration });
    setResizing(true);
    rafRef.current = requestAnimationFrame(autoScrollTick);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    pointerYRef.current = e.clientY;
    applyResize();
  };
  const onResizeUp = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const r = resizeRef.current;
    const p = preview;
    resizeRef.current = null;
    setPreview(null);
    setResizing(false);
    if (!r || !p) return;
    // The write has to go through the action for the item's OWN type: the store
    // narrows updateTask to task-like (non-habit) items, so sending a habit
    // resize through it would preview correctly and then silently no-op on
    // release. Both actions take the same Partial shape.
    const commit = isTask ? updateTask : updateHabit;
    if (r.edge === 'bottom') {
      if (p.duration !== entry.duration) commit(item.id, { duration: p.duration });
    } else if (p.startMin !== entry.startMin || p.duration !== entry.duration) {
      commit(item.id, {
        startTime: minToTime(p.startMin),
        duration: p.duration,
        timeBucket: bucketForMin(p.startMin),
      });
    }
  };

  // Stop the auto-scroll loop if the block unmounts mid-resize.
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // The rail span sits on the item's TRUE extent; the pane is nudged down and
  // trimmed so consecutive blocks show a seam. Both are driven off startY, so
  // the bead always lands exactly on the hour line the item starts at.
  const startY = ((effStartMin - gridStartMin) / 60) * hourPx;
  const spanH = (effDuration / 60) * hourPx;
  const top = startY + PANE_OFFSET;
  const height = Math.max(spanH - PANE_TRIM, PANE_MIN_H);
  const tall = height >= PANE_TALL_H;

  // How many lines of the title actually fit — the week column's answer to long
  // titles. text-content is 12/17, and the pane pays 6px of padding top and
  // bottom, so this is the honest count rather than a guess.
  const titleLines = Math.max(1, Math.floor((height - 12) / 17));

  // …and where even that isn't enough (a 30-minute block at the minimum hour
  // height is 34px — one line — and no amount of reclaimed width fixes that),
  // hovering grows the block past its slot to show the whole title. It is the
  // only in-place answer: the block's height is its DURATION, so the alternative
  // is a popover, and this keeps the text where you were already looking.
  // Suppressed mid-resize, where the height is the thing being edited.
  const canExpand = isWeek && !preview;

  // Done de-colours the rail with its bead: they are one glyph, not two states.
  const railColor = done ? 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)' : accent;

  // Blocks are drag sources — drop on another hour to reschedule, or on the
  // Anytime section to un-time. The source stays in place (dimmed) while the
  // DragOverlay ghost moves — same as TaskRow, and cheaper to repaint than
  // transforming this shadowed block every pointermove. Post-drop click guard
  // keeps a drop from opening the edit dialog.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const wasDraggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      wasDraggedRef.current = true;
      return;
    }
    if (wasDraggedRef.current) {
      const t = setTimeout(() => {
        wasDraggedRef.current = false;
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  // A skipped occurrence collapses on the timeline the same way it collapses in
  // a list row (#194/#195): the bead still pins WHEN it was meant to happen, but
  // the block stops claiming its duration. Blocks are absolutely positioned, so
  // shrinking one reflows nothing — the hour it vacates simply reads as free.
  // Gated on the registry capability, so recurring tasks and recurring custom
  // types collapse here exactly as habits do.
  if (skipped) {
    return (
      <div
        data-testid="schedule-block"
        data-item-id={item.id}
        data-item-kind={itemType}
        data-item-type={typeName}
        data-row-variant="skipped"
        data-completed="false"
        data-start-min={entry.startMin}
        data-duration={entry.duration}
        // Same pointer contract as a live block: the wrapper (and so the 12px
        // lane) stays click-through to the hour slot underneath; only the strip
        // itself opts back in.
        className="pointer-events-none absolute left-0 right-1 z-[2] h-[24px]"
        style={{ top }}
      >
        <span
          aria-hidden
          className="absolute left-[5px] w-[2px] rounded-[1px] bg-muted-foreground/35"
          style={{ top: -PANE_OFFSET, height: 24 }}
        />
        <span
          aria-hidden
          className="absolute left-[3px] h-[6px] w-[6px] rounded-full bg-muted-foreground/45 shadow-[0_0_0_1px_var(--canvas)]"
          style={{ top: -PANE_OFFSET - 3 }}
        />
        <div
          onClick={() => openEditFor(item, itemType)}
          style={{ marginLeft: LANE_PX }}
          className="pointer-events-auto flex h-full cursor-pointer items-center gap-1.5 rounded-[5px] bg-surface-3/60 px-2 hover-wash"
        >
          <SkipForward className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="min-w-0 flex-1 truncate font-content text-content text-muted-foreground/70">
            {item.title}
          </span>
          <button
            type="button"
            title="Unskip"
            aria-label="Unskip"
            data-testid="item-unskip-button"
            onClick={(e) => {
              e.stopPropagation();
              setItemSkipped(item.id, false, rowDate);
            }}
            className="-mr-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover-wash hover:text-foreground"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const checkbox = isTask ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleTaskStatus(item.id, undefined, isRecurring(task!) ? rowDate : undefined);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      className={cn(
        // Transparent, not filled: the pane behind it is already tinted glass,
        // and a second fill inside it reads as a box within a box.
        'mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border bg-transparent transition-colors',
        done ? 'border-primary bg-primary' : 'border-muted-foreground/45 hover:border-primary'
      )}
    />
  ) : null;

  const titleClass = cn(
    'min-w-0 flex-1 font-content text-content text-foreground',
    done && 'text-muted-foreground line-through opacity-60'
  );

  return (
    // The wrapper is the block's real extent: lane + pane. It is
    // pointer-events-none so the 12px lane stays click-through to the hour slot
    // underneath, with the pane and the resize targets opting back in — hover
    // still propagates up here from those children, which is what drives the
    // registration marks and the z-index raise.
    <div
      data-testid="schedule-block"
      data-item-id={item.id}
      data-item-kind={itemType}
      data-item-type={typeName}
      // A skipped block is a different DOM shape under the same testid (no
      // checkbox, no resize handles) — same disambiguation TaskRow carries.
      data-row-variant="default"
      data-completed={done ? 'true' : 'false'}
      // Duration and start are the whole point of a schedule block, and both
      // are otherwise encoded only in inline pixel styles. These make the
      // hour-drop and resize outcomes assertable.
      data-start-min={effStartMin}
      data-duration={effDuration}
      className={cn(
        'group/blk pointer-events-none absolute left-0 right-1 z-[2] h-[var(--blk-h)] hover:z-[7]',
        // The hover-expand. Everything that annotates the block — corners,
        // caliper marks — hangs off this wrapper, so they travel with it and the
        // grown block stays a coherent object rather than a pane escaping its
        // own registration.
        canExpand && 'hover:h-auto hover:min-h-[var(--blk-h)]',
        isDragging && 'opacity-50'
      )}
      style={{ top, '--blk-h': `${height}px` } as React.CSSProperties}
    >
      {/* The rail's accent span: the lane's 1px hairline swells to 2px for the
          duration of the event, so the accent has real extent on the grid rather
          than being a stripe glued to the card. Offset back up by PANE_OFFSET to
          undo the pane's nudge — this sits on the true start and end. */}
      <span
        aria-hidden
        className="absolute left-[5px] w-[2px] rounded-[1px]"
        style={{ top: -PANE_OFFSET, height: spanH, background: railColor }}
      />
      {/* The start bead, punched out of the canvas so two beads 15 minutes apart
          still read as two at the minimum hour height. */}
      <span
        aria-hidden
        className="absolute left-[3px] h-[6px] w-[6px] rounded-full shadow-[0_0_0_1px_var(--canvas)]"
        style={{ top: -PANE_OFFSET - 3, background: railColor }}
      />

      {/* The pane. overflow-hidden for the wash and the title, which is exactly
          why the registration marks below are siblings, not children. */}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (wasDraggedRef.current) return;
          openEditFor(item, itemType);
        }}
        className={cn(
          // In flow, not absolute: the wrapper's hover-expand height is `auto`,
          // and an absolutely positioned pane would contribute nothing to it.
          'pointer-events-auto relative h-full cursor-grab touch-manipulation overflow-hidden rounded-[5px] border border-border active:cursor-grabbing',
          // …but `h-full` against that `auto` wrapper is a percentage of an
          // indefinite height, so it collapses the pane to its CONTENT. On a
          // block whose slot is taller than its title (a 3-hour block holding
          // two lines) the pane shrank out from under the cursor on hover, hover
          // was lost — the wrapper is pointer-events-none, so the pane is the
          // only target — the pane sprang back, and the block flickered between
          // the two sizes forever. The floor makes hovering a block that already
          // fits a no-op, and only a genuinely clipped title grows past it.
          canExpand && 'min-h-[var(--blk-h)]',
          'bg-[var(--sched-pane)] shadow-[var(--sched-shadow)] transition-[background-color,box-shadow] duration-150',
          // Done recedes by thinning the plate and switching the lit edge off,
          // never by fading the whole block — opacity here composites the lime
          // checkbox down to olive. The text carries the rest of the fade.
          done
            ? 'bg-[var(--sched-pane-done)] shadow-[var(--sched-shadow-done)]'
            : 'hover:bg-[var(--sched-pane-hover)] hover:shadow-[var(--sched-shadow-hover)]'
        )}
        style={{ marginLeft: LANE_PX }}
      >
        {/* The emission wash — the accent bleeding off the rail-facing edge into
            the plate. Three stops, not two: a bright edge, a fast falloff by
            40px, then a long tail out to the reach. A straight two-stop ramp
            reads as a stripe with a soft right edge; this reads as light falling
            across the card and dissolving into it.

            Day only. Across a 140px week column an 84px gradient is more than
            half the pane, which is a coloured container by area. */}
        {!done && !isWeek && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-[var(--sched-wash)] transition-opacity duration-150 group-hover/blk:opacity-[var(--sched-wash-hover)]"
            style={{
              background:
                `linear-gradient(90deg,` +
                ` color-mix(in oklab, ${accent} 32%, transparent) 0px,` +
                ` color-mix(in oklab, ${accent} 12%, transparent) 40px,` +
                ` transparent var(--sched-wash-reach))`,
            }}
          />
        )}

        <div
          className={cn(
            'relative z-[1] flex h-full min-w-0 flex-col gap-px',
            isWeek ? 'justify-start py-1.5 pl-1.5 pr-1' : 'justify-center pl-2.5 pr-2'
          )}
        >
          {isWeek ? (
            /* Week columns: the title WRAPS to every line the block's height can
               actually hold, and nothing competes with it for the width. The
               start time is gone — the bead already pins it on the rail and the
               shared gutter reads it off — and so are the duration and the
               priority glyph, which between them cost about a quarter of a 140px
               column. Height is finite, so the wrap is clamped rather than
               allowed to spill; hovering releases the clamp and grows the block
               (see canExpand), which is what makes the whole title readable
               without a tooltip. */
            <div className="flex min-w-0 items-start gap-1.5">
              {checkbox}
              <span
                className={cn(
                  titleClass,
                  'break-words',
                  LINE_CLAMP[Math.min(titleLines, LINE_CLAMP.length) - 1],
                  canExpand && 'group-hover/blk:line-clamp-none'
                )}
                title={item.title}
              >
                {item.title}
              </span>
            </div>
          ) : tall ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {checkbox}
                <span className={cn(titleClass, 'truncate')}>{item.title}</span>
                {effDuration > 0 && (
                  <RollingMetaText
                    value={effDuration}
                    format={formatDuration}
                    className={cn('flex-shrink-0', done && 'opacity-60')}
                  />
                )}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <MetaText className={cn('min-w-0 flex-1 truncate', done && 'opacity-60')}>
                  {formatClock(effStartMin, timeFormatStr, false)}–
                  {formatClock(effStartMin + effDuration, timeFormatStr, false)}
                </MetaText>
                {task?.priority && <PriorityGlyph priority={task.priority} className={cn(done && 'opacity-60')} />}
              </div>
            </>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {checkbox}
              <span className={cn(titleClass, 'truncate')}>{item.title}</span>
              <span className={cn('flex flex-shrink-0 items-center gap-2', done && 'opacity-60')}>
                {task?.priority && <PriorityGlyph priority={task.priority} />}
                {effDuration > 0 && <RollingMetaText value={effDuration} format={formatDuration} />}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Registration corners — crop marks sitting 4px OFF the pane, annotating
          the block rather than drawing a second, misaligned border inside it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1 h-1.5 w-1.5 border-l border-t border-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
        style={{ left: LANE_PX - 4 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 -top-1 h-1.5 w-1.5 border-r border-t border-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-1 h-1.5 w-1.5 border-b border-l border-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
        style={{ left: LANE_PX - 4 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-1 -right-1 h-1.5 w-1.5 border-b border-r border-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
      />

      {/* Resize handles — drag the top or bottom edge to set start/duration.
          The mark lives OUTSIDE the pane on the corners' own -4px line: a caliper
          datum centred on the edge with its stem pointing into the block, in the
          same 1px hairline as the corners. Hover therefore reads as ONE set of
          marks laid over the pane rather than as a grabber bar sitting inside it.
          The hit zone still straddles the edge (9px out, 3px in) so the target
          stays reachable without hunting for the hairline. */}
      {canResize && (
        <>
          <div
            onPointerDown={(e) => onResizeDown('top', e)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute -top-[9px] right-0 z-[3] h-3 cursor-ns-resize"
            style={{ left: LANE_PX }}
            aria-label="Resize start"
          >
            <span
              aria-hidden
              className="absolute left-1/2 top-[5px] h-px w-4 -translate-x-1/2 bg-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
            >
              <span className="absolute left-1/2 top-px h-1 w-px bg-[var(--ink-1)]" />
            </span>
          </div>
          <div
            onPointerDown={(e) => onResizeDown('bottom', e)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute -bottom-[9px] right-0 z-[3] h-3 cursor-ns-resize"
            style={{ left: LANE_PX }}
            aria-label="Resize duration"
          >
            <span
              aria-hidden
              className="absolute bottom-[5px] left-1/2 h-px w-4 -translate-x-1/2 bg-[var(--ink-1)] opacity-0 transition-opacity group-hover/blk:opacity-100"
            >
              <span className="absolute bottom-px left-1/2 h-1 w-px bg-[var(--ink-1)]" />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function DaySchedule({ activeId }: { activeId: string | null }) {
  const day = useDayItems();
  const { selectedDate, navDirection, userTimezone, showCurrentTimeIndicator } = usePlannerStore();
  const timeFormatStr = useTimeFormat();
  const dragging = !!activeId;
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowMin = useNowMinutes(timezone);

  const { isOver: isOverAnytime, setNodeRef: setAnytimeRef } = useDroppable({
    id: 'unscheduled:anytime',
  });

  const untimed = useMemo(() => deriveUntimedRows(day), [day]);
  const timed = useMemo(() => deriveTimedEntries(day), [day]);

  // The marker only exists on today, and only if the setting allows it —
  // Settings → "Show current time indicator" sat there for a long time with
  // nothing to switch; this is the thing it switches.
  const isToday = toDateStr(selectedDate, timezone) === toDateStr(new Date(), timezone);
  const markerMin = showCurrentTimeIndicator && isToday ? nowMin : null;

  // Content-fit hour window when idle; the full day while dragging (every hour a
  // drop target) or resizing (see/reach any target time). Rows shrink to fit the
  // pane; during resize the scale is frozen and the grid auto-scrolls instead.
  //
  // On today the window is also widened to contain the live clock, so the marker
  // always has somewhere to land. Without that it silently disappeared whenever
  // the hour happened to fall outside what's scheduled — at 7am on a day that
  // starts at 9, which is exactly when you most want to see where "now" is.
  const resizing = useScheduleResizeStore((s) => s.resizing);
  const contentRange = useMemo(() => deriveGridRange(timed, markerMin), [timed, markerMin]);
  const { gridStartHour, gridEndHour } = dragging || resizing ? FULL_DAY_RANGE : contentRange;
  const hours = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);
  const { hourPx, anchorRef } = useFitHourPx(hours.length, resizing);
  useResizeScrollCompensation(gridStartHour, hourPx, resizing, anchorRef);

  // Still a range check: the drag/resize override swaps in the full day, and the
  // widening above doesn't apply to it.
  const showNow = markerMin !== null && markerMin >= gridStartHour * 60 && markerMin < gridEndHour * 60;
  const nowMinShown = showNow ? markerMin! : null;
  const nowY = showNow ? ((markerMin! - gridStartHour * 60) / 60) * hourPx : null;
  const eclipsedHour =
    nowMinShown !== null && ((nowMinShown % 60) / 60) * hourPx < ECLIPSE_PX
      ? Math.floor(nowMinShown / 60)
      : null;

  return (
    <ScrollArea className="h-full flex-1">
      <div
        key={`${selectedDate.toDateString()}-${navDirection ?? 'none'}`}
        className={cn(
          'canvas-container space-y-4 py-6 pb-20',
          navDirection && `animate-slide-in-from-${navDirection === 'left' ? 'right' : 'left'}`
        )}
      >
        {/* ANYTIME — untimed items; drop here to keep something time-free */}
        {(untimed.length > 0 || dragging) && (
          <div
            ref={setAnytimeRef}
            data-dnd-id="unscheduled:anytime"
            data-dnd-over={isOverAnytime ? 'true' : 'false'}
            className={cn('rounded-card transition-colors', isOverAnytime && 'bg-primary/5 ring-2 ring-ring/50')}
          >
            <GroupSection label="Anytime" variant="canvas">
              {untimed.map((row) => (
                <TaskRow key={row.item.id} row={row} />
              ))}
              {untimed.length === 0 && dragging && (
                <div className="py-2 text-center text-xs text-muted-foreground/50">
                  Drop here to keep it time-free
                </div>
              )}
            </GroupSection>
          </div>
        )}

        {/* Hour grid with absolutely positioned blocks */}
        <div ref={anchorRef} className="relative">
          <div>
            {hours.map((hour, i) => (
              <HourSlot
                key={hour}
                hour={hour}
                isActive={dragging}
                label={formatHourLabel(hour, timeFormatStr)}
                isFirst={i === 0}
                hourPx={hourPx}
                eclipsed={eclipsedHour === hour}
              />
            ))}
          </div>

          {/* The live time takes its place in the gutter's own column — same
              left edge, same face and size as every hour label, so it reads as
              one of them rather than as a chip floating over the grid. Lime and
              medium weight mark it as the living one; it is centred on the rule
              where the hour labels are top-aligned, which is the other half of
              why the label it lands on steps aside. */}
          {nowY !== null && (
            <span
              className={cn(
                'pointer-events-none absolute left-0 z-[6] -translate-y-1/2 font-num text-2xs font-medium text-success-text',
                DAY_GUTTER_INSET
              )}
              style={{ top: nowY }}
            >
              {formatClock(nowMinShown!, timeFormatStr)}
            </span>
          )}

          {/* The events layer: lane on the left, panes to the right of it. Top
              is flush with the grid — the old 4px nudge now lives inside the
              block (PANE_OFFSET) so the rail and bead can still sit on the true
              hour line while the pane clears its neighbour. */}
          <div className="absolute bottom-0 right-0 top-0" style={{ left: DAY_FIELD_LEFT }}>
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-[5px] top-0 w-px bg-[var(--sched-rail)]"
            />
            {timed.map((entry) => (
              <ScheduleBlock key={entry.item.id} entry={entry} gridStartMin={gridStartHour * 60} hourPx={hourPx} />
            ))}
            {nowY !== null && <NowMarker top={nowY} />}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
