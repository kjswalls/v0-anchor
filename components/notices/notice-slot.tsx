'use client';

import { X } from 'lucide-react';

import { TypewriterText } from '@/components/primitives/typewriter-text';
import { useAnchorableNotices } from '@/components/notices/notice-sources';
import { placeNotices, type DockNotice, type NoticeAnchor } from '@/lib/dock-notices';
import { useLiveNoticeAnchors, useNoticeAnchor } from '@/lib/notice-anchors';
import { usePlannerStore } from '@/lib/planner-store';
import { toDateStr } from '@/lib/recurrence';
import { cn } from '@/lib/utils';

/**
 * A notice standing on the thing it is about.
 *
 * Same 26px, same ink, same glyph-carries-the-kind reading as the dock's row —
 * they are the same sentence and they should read as the same kind of row. Two
 * differences, both deliberate:
 *
 *  1. **It types.** Here there is room and there is context, and the reveal is
 *     what makes a line that appeared under your cursor read as having been said
 *     rather than as having always been there. The dock's line never types (see
 *     TypewriterText).
 *  2. **The ✕ is always drawn**, on touch as well as pointer. The dock
 *     suppresses it on touch because a 24px destructive target pressed against a
 *     full-width tap target is a mis-tap generator and its trays carry their own
 *     dismissal instead. In place there is neither a tray nor a full-bleed row
 *     to collide with, and "every notice must be easily dismissible" is the
 *     amendment this surface exists under.
 */
function InPlaceNotice({ notice }: { notice: DockNotice }) {
  const Icon = notice.icon;

  return (
    <div
      data-testid="in-place-notice"
      data-notice-id={notice.id}
      data-notice-anchor={notice.anchor}
      className="flex items-center"
    >
      <button
        type="button"
        onClick={notice.onSelect}
        className="hover-wash flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-left"
      >
        <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', notice.iconClassName)} />
        <TypewriterText
          revealKey={notice.id}
          className="min-w-0 flex-1 font-num text-xs tracking-[0.04em] text-foreground"
        >
          {notice.label}
        </TypewriterText>
        {notice.actionLabel && (
          <span className="flex-shrink-0 font-num text-xs tracking-[0.04em] text-muted-foreground">
            {notice.actionLabel}
          </span>
        )}
      </button>
      {notice.onDismiss && (
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
 * "There is a place for a notice here, and here is what is in it."
 *
 * Mounting a slot is the whole of what makes an anchor real. It registers in a
 * layout effect (lib/notice-anchors.ts), so within the same commit the dock
 * already knows this notice has somewhere better to be and never paints the
 * frame where it is still on the dock line.
 *
 * `active` is how a slot says "my object is the one this notice is about" — the
 * day-foot slots pass `dateStr === today`, so arrowing to another day takes the
 * anchor down and the notice goes back to the dock rather than sitting under a
 * day it has nothing to do with.
 *
 * Renders nothing at all when there is nothing placed here, so a slot costs an
 * empty fragment and no layout on every surface that mounts one.
 */
export function NoticeSlot({
  anchor,
  active = true,
  className,
}: {
  anchor: NoticeAnchor;
  active?: boolean;
  className?: string;
}) {
  useNoticeAnchor(anchor, active);
  const live = useLiveNoticeAnchors();
  const notices = useAnchorableNotices();

  // Placement runs through the same pure function the dock uses, so the two
  // cannot disagree about who owns a notice: exactly one of them finds it in
  // its own bucket. `blocked` and tray-bearing notices never reach here — see
  // placeNotices.
  const { anchored } = placeNotices(notices, live);
  const mine = active ? (anchored.get(anchor) ?? []) : [];
  if (mine.length === 0) return null;

  return (
    <div
      data-testid="notice-slot"
      data-anchor={anchor}
      className={cn('flex flex-col gap-1', className)}
    >
      {mine.map((notice) => (
        <InPlaceNotice key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

/**
 * The foot of the day, in all three day layouts.
 *
 * `active` is `this column is TODAY`, resolved through the user's SAVED timezone
 * — the app-wide `toDateStr` convention, shared with the notices themselves, so
 * the slot and the notice can never disagree about which day it is. Arrow to
 * Thursday and the anchor goes dark: the end-of-day line returns to the dock
 * rather than sitting under a day it is not about.
 *
 * The week layouts do not mount this at all. `selectedDate` there is one column
 * of seven, and a line about "today" under a seven-day grid is the same mistake
 * ProgramNotice refuses to make.
 */
export function DayFootNotice({ dateStr }: { dateStr: string }) {
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const todayStr = toDateStr(
    new Date(),
    userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  return <NoticeSlot anchor="day-foot" active={dateStr === todayStr} className="pt-2" />;
}
