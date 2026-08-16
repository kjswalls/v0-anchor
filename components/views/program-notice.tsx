'use client';

import { useMemo } from 'react';
import { Moon } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { useViewStore } from '@/lib/view-store';
import { programSuppressionOn } from '@/lib/program-boundaries';
import { toDateStr } from '@/lib/recurrence';
import { cn } from '@/lib/utils';

/**
 * The day view's answer to "where did everything go?"
 *
 * The week grid can show a boundary, because it renders the days on either side
 * of it. A day view renders one column, so the change has nothing on screen to
 * be a change *from* — the honest thing it can say is the consequence rather
 * than the transition: this many items are not here, and this is what is
 * holding them.
 *
 * It renders on NO other day, which is the point. A program that is off and
 * hiding nothing gets no line; a paused item gets no line either, because that
 * was the user's own decision about that row and it already has a home in the
 * braindump's Paused section. Only work that vanished because of a decision
 * made somewhere ELSE — in the manager, weeks ago, or by a date rolling over —
 * earns an explanation here.
 *
 * Guilt-free law (overlap-blocks decision 1): muted, a moon, no warning colour,
 * no border, no count badge. It is a statement of where things are, not a
 * backlog notification.
 *
 * WHY IT IS NOT A DOCK NOTICE. The dock holds things the user has to ANSWER
 * (lib/dock-notices.ts). This is bound to a date — it changes as you arrow
 * through the week and means nothing without the date it is about — so it
 * belongs beside the date, in the canvas header row, and not on a dateless
 * surface at the other end of the screen. Moving it there also cost it nothing
 * and gained it a layout: the row's height is max(children) = the capsule's 96,
 * so an h-8 line beside it is free, and it now renders in `buckets` too, where
 * it never has.
 *
 * The PERMANENT half of the same fact — "Summer is off and holds 4 items",
 * true on every date — is not here either. It lives on the Summer row in
 * components/sidebar/scope-rail.tsx, on the switch that causes it.
 */
export function ProgramNotice({ className }: { className?: string }) {
  const items = usePlannerStore((s) => s.items);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const selectedDate = usePlannerStore((s) => s.selectedDate);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const scope = useViewStore((s) => s.scope);
  const openDialog = useUIStore((s) => s.openDialog);

  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateStr(selectedDate, tz);

  const suppression = useMemo(() => {
    if (programs.length === 0) return null;
    return programSuppressionOn(dateStr, items, { userTimezone: tz, routines, programs });
  }, [dateStr, items, routines, programs, tz]);

  // Day scope only. In a week view `selectedDate` is one column of seven, so a
  // line reporting its suppression sits above six other days it is not about —
  // and those views already have the honest form of this, a boundary marker
  // drawn between the columns where the change actually happens.
  if (scope !== 'day' || !suppression) return null;

  const { programs: off, hidden } = suppression;
  const names = off.map((p) => p.name).join(' and ');

  return (
    <button
      type="button"
      // The manager is where this is undone, and it is otherwise reachable only
      // from the palette and the item chips — so the sentence that reports the
      // consequence is also the way back to the control that caused it.
      onClick={() => openDialog({ type: 'manage-collections', tab: 'programs' })}
      data-testid="program-notice"
      data-date={dateStr}
      data-hidden-count={hidden}
      className={cn(
        'text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors',
        className
      )}
    >
      <Moon className="h-3 w-3 shrink-0" aria-hidden />
      {/* min-w-0 as well as truncate: a flex child's automatic minimum size is
          its content, so without it the span refuses to shrink and the ellipsis
          never gets a chance to appear. */}
      <span className="min-w-0 truncate">
        {hidden} {hidden === 1 ? 'item is' : 'items are'} away with {names}
      </span>
    </button>
  );
}
