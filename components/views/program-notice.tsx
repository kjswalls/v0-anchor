'use client';

import { useMemo } from 'react';
import { Moon } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { useUIStore } from '@/lib/ui-store';
import { programSuppressionOn } from '@/lib/program-boundaries';
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
 */
export function ProgramNotice({ dateStr, className }: { dateStr: string; className?: string }) {
  const items = usePlannerStore((s) => s.items);
  const routines = usePlannerStore((s) => s.routines);
  const programs = usePlannerStore((s) => s.programs);
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const openDialog = useUIStore((s) => s.openDialog);

  const suppression = useMemo(() => {
    if (programs.length === 0) return null;
    const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return programSuppressionOn(dateStr, items, { userTimezone: tz, routines, programs });
  }, [dateStr, items, routines, programs, userTimezone]);

  if (!suppression) return null;

  const { programs: off, hidden } = suppression;
  const names = off.map((p) => p.name).join(' and ');

  return (
    <button
      type="button"
      // The console is where this is undone, so the sentence that reports the
      // consequence is also the way back to the control that caused it — and it
      // lands on the program actually doing the hiding rather than on the list.
      // With several off, the first named is the one the sentence leads with.
      onClick={() =>
        openDialog({ type: 'organize', section: 'programs', focusId: off[0]?.id })
      }
      data-testid="program-notice"
      data-date={dateStr}
      data-hidden-count={hidden}
      className={cn(
        'text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors',
        className
      )}
    >
      <Moon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        {hidden} {hidden === 1 ? 'item is' : 'items are'} away with {names}
      </span>
    </button>
  );
}
