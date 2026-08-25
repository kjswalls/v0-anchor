'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, CloudOff, MoonStar, MoreHorizontal, Sunset, X } from 'lucide-react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWaitingNotice } from '@/components/ai/morning-check';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { minutesOfDay, nowMinutesIn, shouldShowEodNotice } from '@/lib/eod';
import { useSidebarStore } from '@/lib/sidebar-store';
import { toDateStr } from '@/lib/recurrence';
import { capNotices, NOTICE_RANK, rankNotices, type DockNotice } from '@/lib/dock-notices';
import { cn } from '@/lib/utils';

/**
 * The app's voice, given one place to speak from.
 *
 * It sits inside the dock capsule directly above the UserCard, which puts it
 * directly above the omnibar — so the two directions of the conversation share
 * an edge. The omnibar's suggestion panel grows upward out of the pill and a
 * notice tray grows upward out of its row: the same airspace, one occupant at a
 * time, and the exclusion comes free because each closes on an outside
 * pointerdown that the other's opening gesture is.
 *
 * WHY NOT THE CANVAS, which is where the waiting bar lived. lib/use-fit-hour-px.ts
 * derives the schedule grid's hour height from (viewport bottom − whatever sits
 * above the timeline), so anything in that column has to hold a fixed height
 * forever or it drives hourPx to its floor. The bar's famous 50px contract was
 * never a design decision — it was rent. The sidebar has no fit-to-height
 * consumer, so the cap here is discipline rather than obligation, and it is
 * kept anyway: this surface must never be the reason the braindump shrank.
 *
 * THE HEIGHT LADDER, and it is not a function of n:
 *   0 notices → 0      (nothing renders; the dock is byte-identical to before)
 *   1 notice  → 40     (26 row + 14 margin)
 *   2+        → 72     (26 + 6 + 26 + 14)
 * Past two the second row becomes a "+N more" that lifts the cap on demand, so
 * nothing is ever silently dropped — a surface that hides messages to protect
 * its own geometry is worse than one that grows.
 */

/** Rows shown before the stack folds into a "+N more". */
const MAX_ROWS = 2;

/* ── sources ─────────────────────────────────────────────────────────── */

/**
 * The one notice with no feature behind it.
 *
 * `planner-store.error` has been set on every failed load since the store was
 * written and read by precisely nothing — a silent failure mode that survived
 * because there was nowhere to put it that wasn't a modal or a toast, and
 * neither is right for a condition that persists until someone acts. That is
 * the argument for this surface in one bug.
 */
function useSyncErrorNotice(): DockNotice | null {
  const error = usePlannerStore((s) => s.error);
  const userId = usePlannerStore((s) => s.userId);
  const initializeStore = usePlannerStore((s) => s.initializeStore);
  // Keyed on the message, not a boolean: dismissing one failure must not
  // suppress the next, different one.
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!error || error === dismissed) return null;

  return {
    id: 'sync-error',
    rank: NOTICE_RANK.blocked,
    icon: CloudOff,
    iconClassName: 'text-destructive',
    label: <span className="font-semibold">Couldn’t load your data</span>,
    actionLabel: 'Retry',
    onSelect: () => {
      if (userId) void initializeStore(userId);
    },
    onDismiss: () => setDismissed(error),
    dismissLabel: 'Dismiss this warning',
  };
}

/** Today, in the user's SAVED timezone — the app-wide `toDateStr` convention. */
function useToday(): { todayStr: string; tz: string } {
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { todayStr: toDateStr(new Date(), tz), tz };
}

/**
 * "12 items were put aside this morning" — the app's only unattended write,
 * finally saying so.
 *
 * Ranked `receipt`, below anything asking for a decision: nothing is blocked on
 * this and the sweep was the user's own opt-in setting doing its job. It is
 * here so the work is not silently gone, not to ask forgiveness for it.
 *
 * "Put them back" is `restoreScheduling`, NOT undo. See the note on that verb
 * in lib/planner-store.ts — by the time this line is read the sweep is buried
 * in the history stack, and popping it would reverse whatever the user did
 * last.
 */
function useSweepNotice(): DockNotice | null {
  const userId = usePlannerStore((s) => s.userId);
  const restoreScheduling = usePlannerStore((s) => s.restoreScheduling);
  const receiptsByUser = useMorningStore((s) => s.morningAutoAgeReceiptByUser);
  const clearAutoAgeReceipt = useMorningStore((s) => s.clearAutoAgeReceipt);
  const { todayStr } = useToday();

  // Date-checked here rather than through the store's getter so the component
  // re-renders when the map changes — a getState() read would not subscribe.
  const receipt = useMemo(() => {
    if (!userId) return null;
    const found = receiptsByUser[userId];
    return found && found.date === todayStr && found.items.length > 0 ? found : null;
  }, [receiptsByUser, userId, todayStr]);

  if (!receipt || !userId) return null;

  const n = receipt.items.length;

  return {
    id: 'auto-age-receipt',
    rank: NOTICE_RANK.receipt,
    icon: MoonStar,
    label: (
      <>
        <span className="font-semibold">{n === 1 ? '1 item' : `${n} items`}</span> put aside this
        morning
      </>
    ),
    actionLabel: 'Put back',
    onSelect: () => {
      restoreScheduling(receipt.items);
      clearAutoAgeReceipt(userId);
    },
    // Waving it away is not the same as putting them back — it drops the
    // receipt only. The items stay where the sweep left them, in the braindump,
    // which is where the setting the user turned on says they belong.
    onDismiss: () => clearAutoAgeReceipt(userId),
    dismissLabel: 'Dismiss this receipt',
  };
}

/**
 * "Today's review is waiting" — the review's first in-app entry point.
 *
 * Ranked `decision` alongside the waiting pile: the review is a thing only the
 * user can do, and it is the one surface in the app that was reachable ONLY
 * through a push notification. Deny the permission or swipe the notification
 * away and, before this line, nothing on screen ever mentioned it again.
 *
 * Deliberately not a modal that opens itself. The review is a ritual, not an
 * interruption, and the case for putting it on the dock is precisely that it
 * can wait there instead of ambushing whatever the user was doing at 21:00.
 */
function useEodNotice(): DockNotice | null {
  const eodReviewEnabled = useEODStore((s) => s.eodReviewEnabled);
  const eodReviewTime = useEODStore((s) => s.eodReviewTime);
  const lastEodReviewDate = useEODStore((s) => s.lastEodReviewDate);
  const eodDeferredDate = useEODStore((s) => s.eodDeferredDate);
  const hasHydrated = useEODStore((s) => s._hasHydrated);
  const open = useEODStore((s) => s.open);
  const deferToday = useEODStore((s) => s.deferToday);
  const { todayStr, tz } = useToday();

  const nowMinutes = nowMinutesIn(new Date(), tz);
  const due = minutesOfDay(eodReviewTime);

  /**
   * Wake up ONCE, at the review hour.
   *
   * Everything else on this surface is driven by a store write, so it re-renders
   * when its answer changes. This one is driven by a clock: sit with the app
   * open from 20:00 and nothing at all happens at 21:00, so the line would only
   * appear whenever some unrelated state next moved it. A single timeout for the
   * exact crossing beats a minute-interval that re-renders the notice stack all
   * day to catch one moment.
   *
   * Only the crossing. Midnight rollover is left alone deliberately — the
   * waiting notice resolves `todayStr` at render for the same reason, and an app
   * left open across midnight is a rarer case than an app left open all evening.
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasHydrated || !eodReviewEnabled || due === null) return;
    if (nowMinutes >= due) return;
    const ms = (due - nowMinutes) * 60_000;
    const timer = setTimeout(() => setTick((n) => n + 1), ms);
    return () => clearTimeout(timer);
  }, [hasHydrated, eodReviewEnabled, due, nowMinutes]);

  // Pre-hydration the store holds its defaults, and `eodReviewEnabled` defaults
  // false — so this is belt and braces rather than load-bearing. It costs one
  // boolean and it means the line can never flash in on a rehydrate that is
  // about to say "already reviewed".
  if (!hasHydrated) return null;

  const owed = shouldShowEodNotice(
    { eodReviewEnabled, eodReviewTime, lastEodReviewDate, eodDeferredDate },
    todayStr,
    nowMinutes
  );
  if (!owed) return null;

  return {
    id: 'eod-review',
    rank: NOTICE_RANK.decision,
    icon: Sunset,
    iconClassName: 'text-sunrise-glyph',
    label: <span className="font-semibold">Today’s review is waiting</span>,
    actionLabel: 'Start',
    onSelect: open,
    onDismiss: () => deferToday(todayStr),
    dismissLabel: 'Not tonight',
  };
}

/**
 * Every source, in one place. Adding a notice kind is adding a line here.
 *
 * Order in this array is irrelevant — `rankNotices` sorts by what is pending,
 * not by which module raised it, which is the whole reason the rank exists.
 */
function useDockNotices(): DockNotice[] {
  const waiting = useWaitingNotice();
  const eod = useEodNotice();
  const sweep = useSweepNotice();
  const syncError = useSyncErrorNotice();
  return rankNotices(
    [waiting, eod, sweep, syncError].filter((n): n is DockNotice => n !== null)
  );
}

/* ── the row ─────────────────────────────────────────────────────────── */

/**
 * 26px, transparent, one coloured glyph.
 *
 * No filled tint and no border, unlike the honey bar this replaces. That bar
 * could afford a container because it was alone on the canvas; in a stack of
 * rows, n filled strips read as an alert list, which is the one thing the
 * guilt-free ruling forbids this surface from becoming. The glyph carries the
 * kind, the count carries the weight, and everything else is body ink — the
 * same reading the recent bucket work landed on: a thing on a line, not a band.
 */
function NoticeRow({
  notice,
  open,
  onOpenChange,
  asTrigger,
  dismissible = true,
}: {
  notice: DockNotice;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Desktop wraps the pressable region in a PopoverTrigger; mobile doesn't. */
  asTrigger?: boolean;
  /**
   * Touch turns every ✕ off, whatever the notice asked for. It is a property of
   * the input device, not of the message: a 24px destructive target pressed up
   * against a full-width tap target is a mis-tap generator, and there is no
   * hover to disambiguate them. Each notice's tray carries its own dismissal
   * there instead.
   */
  dismissible?: boolean;
}) {
  const Icon = notice.icon;
  const hasTray = !!notice.tray;
  const Chevron = open ? ChevronUp : ChevronDown;

  const content = (
    <>
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', notice.iconClassName)} />
      <span className="min-w-0 flex-1 truncate text-left font-num text-xs tracking-[0.04em] text-foreground">
        {notice.label}
      </span>
      {notice.actionLabel && (
        <span className="flex flex-shrink-0 items-center gap-1 font-num text-xs tracking-[0.04em] text-muted-foreground">
          {open && hasTray ? 'Close' : notice.actionLabel}
          {hasTray && <Chevron className="h-3.5 w-3.5" />}
        </span>
      )}
    </>
  );

  const button = (
    <button
      type="button"
      onClick={hasTray ? () => onOpenChange?.(!open) : notice.onSelect}
      className="hover-wash flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-left"
    >
      {content}
    </button>
  );

  return (
    <div
      data-testid={notice.testId ?? 'dock-notice'}
      data-notice-id={notice.id}
      className="flex items-center"
    >
      {asTrigger && hasTray ? <PopoverTrigger asChild>{button}</PopoverTrigger> : button}
      {dismissible && notice.onDismiss && (
        <button
          type="button"
          onClick={notice.onDismiss}
          aria-label={notice.dismissLabel ?? 'Dismiss'}
          title={notice.dismissLabel ?? 'Dismiss'}
          className="hover-wash flex h-[26px] w-6 flex-shrink-0 items-center justify-center rounded-[6px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Desktop row + its tray, growing UP out of the dock.
 *
 * PopoverAnchor carries the box rather than the trigger, for the reason the
 * waiting bar discovered: the trigger is only the pressable region, so a width
 * measured off it comes up short of the row once a ✕ is present.
 */
function DesktopNotice({ notice }: { notice: DockNotice }) {
  const open = !!notice.open;

  if (!notice.tray) return <NoticeRow notice={notice} />;

  return (
    <Popover modal={false} open={open} onOpenChange={(o) => notice.onOpenChange?.(o)}>
      <PopoverAnchor asChild>
        <div>
          <NoticeRow notice={notice} open={open} onOpenChange={notice.onOpenChange} asTrigger />
        </div>
      </PopoverAnchor>

      <PopoverContent
        data-testid={notice.trayTestId ?? 'dock-notice-tray'}
        side="top"
        align="start"
        sideOffset={8}
        // Never flip to `bottom`: below this anchor is the omnibar, and a tray
        // that lands on the input the user is about to type into is worse than
        // one that runs tall. The bodies cap their own height instead.
        avoidCollisions={false}
        /* Floors at 420px rather than inheriting the dock outright. The triage
           rows are a title beside a 52px date column and a 124px action column,
           which is habitable at 420 and cramped at the 386 a default-width
           sidebar would hand it. Widening past the anchor overhangs to the
           right, over the canvas — the same place this tray has always
           opened over, just from the other side. */
        style={{ width: 'max(var(--radix-popover-trigger-width), 420px)' }}
        /* Every PopoverContent default is overridden (the primitive ships
           w-72 p-4 rounded-md border shadow-md). Opaque bg-popover, because
           this floats over a live grid. */
        className="z-50 flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[6px] border border-border bg-popover p-0 shadow-[var(--shadow-elev-md)]"
        /* The per-row "Pick a date" Popover portals to <body>, so its content
           is outside this layer's subtree and both the pointerdown and the
           auto-focus register as "outside" — the tray would slam shut the
           instant a calendar opened. Everything else stays Radix's job. */
        onInteractOutside={(event) => {
          const target = event.detail.originalEvent.target as HTMLElement | null;
          if (target?.closest?.('[data-radix-popper-content-wrapper]')) event.preventDefault();
        }}
      >
        {notice.tray('tray')}
      </PopoverContent>
    </Popover>
  );
}

/* ── the stack ───────────────────────────────────────────────────────── */

function useCappedStack(notices: DockNotice[], max: number) {
  const [expanded, setExpanded] = useState(false);
  // Derived, not stored: the cap coming back on its own when the pile drains
  // means there is no stale "expanded" to reset in an effect.
  const isExpanded = expanded && notices.length > max;
  const { visible, overflow } = capNotices(notices, max, isExpanded);
  return { visible, overflow, isExpanded, setExpanded };
}

/**
 * The fold. Same 26px, same ink, no glyph colour — it is chrome, not a message.
 *
 * Two readings, because "2 more" is only true when there is something for them
 * to be more THAN. On mobile the cap is one row, so a second notice folds the
 * first away with it and this row stands alone: "2 to answer" then, which is
 * also the membership rule for this surface said out loud.
 */
function OverflowRow({
  count,
  expanded,
  standalone,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  /** True when no notice rows are drawn above this one. */
  standalone?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="dock-notice-overflow"
      data-overflow-count={count}
      className="hover-wash flex h-[26px] items-center gap-2 rounded-[6px] px-2 text-left"
    >
      <MoreHorizontal className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-num text-xs tracking-[0.04em] text-muted-foreground">
        {expanded ? 'Show less' : standalone ? `${count} to answer` : `${count} more`}
      </span>
    </button>
  );
}

/**
 * Desktop mount: components/sidebar/sidebar-dock.tsx, above the UserCard.
 *
 * Renders nothing while the sidebar is away. This is the accepted cost of the
 * placement and it is deliberately NOT patched with a force-open: a rule where
 * some notices reopen your collapsed sidebar and others don't is one no user
 * can hold in their head, and the palette still reaches every one of these.
 */
export function DockNotices() {
  const notices = useDockNotices();
  const { visible, overflow, isExpanded, setExpanded } = useCappedStack(notices, MAX_ROWS);
  const leftSidebarOpen = useSidebarStore((s) => s.leftSidebarOpen);
  const leftSidebarHovered = useSidebarStore((s) => s.leftSidebarHovered);
  const leftSidebarHoverEnabled = useSidebarStore((s) => s.leftSidebarHoverEnabled);

  // The column is clipped to w-0 when collapsed, not unmounted — so without
  // this a tray left open would keep floating over the canvas, anchored to a
  // zero-width box. Unmounting the rows closes every Popover with them.
  const columnVisible = leftSidebarOpen || (leftSidebarHoverEnabled && leftSidebarHovered);
  if (!columnVisible || notices.length === 0) return null;

  return (
    <div
      data-testid="dock-notices"
      className={cn(
        'relative z-10 mb-[14px] flex flex-col gap-1.5',
        // Only ever scrolls once the cap has been lifted by hand. A plain
        // overflow container, not <ScrollArea> — the Radix wrapper silently
        // drops max-h (CLAUDE.md).
        isExpanded && 'max-h-[132px] overflow-y-auto'
      )}
    >
      {visible.map((notice) => (
        <DesktopNotice key={notice.id} notice={notice} />
      ))}
      {overflow > 0 && (
        <OverflowRow
          count={overflow}
          expanded={false}
          standalone={visible.length === 0}
          onToggle={() => setExpanded(true)}
        />
      )}
      {isExpanded && <OverflowRow count={0} expanded onToggle={() => setExpanded(false)} />}
    </div>
  );
}

/**
 * Mobile mount: components/mobile/mobile-bottom-dock.tsx, above the omnibar.
 *
 * One row, never two: the dock already stands ~88px into a short viewport
 * before a notice is added, plus whatever the safe-area inset adds past its
 * 12px floor. Trays are Drawers rather than Popovers — a 420px tray does not
 * exist here.
 */
export function DockNoticesMobile() {
  const notices = useDockNotices();
  // max 1, so capNotices' last-slot rule folds the FIRST notice away as soon as
  // there is a second, and the single row becomes "2 to answer". That is the
  // right trade at this width: one row speaking for itself, or one row speaking
  // for the pile — never one row silently standing in for another.
  const { visible, overflow, isExpanded, setExpanded } = useCappedStack(notices, 1);

  if (notices.length === 0) return null;

  return (
    <>
      <div
        data-testid="dock-notices"
        className={cn(
          'flex flex-col gap-1 pb-2',
          isExpanded && 'max-h-[110px] overflow-y-auto'
        )}
      >
        {visible.map((notice) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            open={!!notice.open}
            onOpenChange={notice.onOpenChange}
            dismissible={false}
          />
        ))}
        {overflow > 0 && (
          <OverflowRow
            count={overflow}
            expanded={false}
            standalone={visible.length === 0}
            onToggle={() => setExpanded(true)}
          />
        )}
        {isExpanded && <OverflowRow count={0} expanded onToggle={() => setExpanded(false)} />}
      </div>

      {/* Drawers live outside the scroller so an expanded stack can't clip one,
          and are mounted for EVERY notice rather than the visible ones: a tray
          opened from the palette (`goto.overdue`) must still appear when its
          row is folded away under "+N more". */}
      {notices.map((notice) =>
        notice.tray ? <MobileNoticeTray key={notice.id} notice={notice} /> : null
      )}
    </>
  );
}

function MobileNoticeTray({ notice }: { notice: DockNotice }) {
  return (
    <Drawer open={!!notice.open} onOpenChange={(o) => !o && notice.onOpenChange?.(false)}>
      {/* max-h-[80vh] comes free from components/ui/drawer.tsx. */}
      <DrawerContent data-testid={notice.trayTestId ?? 'dock-notice-tray'}>
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-left text-base">{notice.trayTitle}</DrawerTitle>
          <DrawerDescription className="sr-only">{notice.trayDescription}</DrawerDescription>
        </DrawerHeader>
        {notice.tray?.('sheet')}
      </DrawerContent>
    </Drawer>
  );
}
