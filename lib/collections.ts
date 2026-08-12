'use client';

import { useMemo, useState } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { isPausedOn, isProgramActiveOn } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';
import type { Program, Routine } from '@/lib/planner-types';

/**
 * Shared machinery for the container surfaces — the manager, the ScopeRail, and
 * the Organize console that replaces the first of those.
 *
 * Extracted out of manage-collections-dialog.tsx rather than copied: every
 * function here encodes a rule that is wrong in a subtly different way if it
 * drifts, and the same reasoning that produced lib/overdue.ts's "ONE definition"
 * applies. No re-export is left behind in the dialog — a compatibility shim is
 * how a dead path survives for a year.
 *
 * See memory/plans/organize-console.md, Phase 1.
 */

/* ── time ─────────────────────────────────────────────────────────────── */

/**
 * Today, in the user's zone.
 *
 * Activation is DATELESS — never the selected date. Recomputed every render
 * rather than memoized, because a `today` captured once is the bug Phase 1 of
 * programs-routines shipped: an app left open overnight went on offering a
 * resume for a pause that had already expired. A render is cheap; being a day
 * wrong is not.
 */
export function useToday(): { todayStr: string; tz: string } {
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { todayStr: toDateStr(new Date(), tz), tz };
}

/**
 * `yyyy-MM-dd` → a LOCAL-NOON Date, or undefined.
 *
 * Never `new Date('yyyy-mm-dd')`: that overload parses as UTC midnight, which
 * formats as the PREVIOUS day everywhere west of Greenwich. A picked day is a
 * wall-calendar choice, not an instant.
 */
export function parseDay(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12);
}

/** `2026-08-20` → `Aug 20`, via the local-noon parse above. */
export function formatShort(dateStr: string): string {
  const d = parseDay(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── live-id indexes ──────────────────────────────────────────────────── */

/**
 * Member ids may name TRASHED items — join rows outlive an item's soft delete
 * by design (restore-intact), and the arrays are pruned only by the purge
 * CASCADE. Every consumer filters against this live index rather than eagerly
 * cleaning, so a restore puts the member back where it was.
 */
export function useLiveItemIds(): Set<string> {
  const items = usePlannerStore((s) => s.items);
  return useMemo(() => new Set(items.map((i) => i.id)), [items]);
}

/** The same rule one layer up: `program.routineIds` may name a trashed routine. */
export function useLiveRoutineIds(): Set<string> {
  const routines = usePlannerStore((s) => s.routines);
  return useMemo(() => new Set(routines.map((r) => r.id)), [routines]);
}

/**
 * Count only the ids that still resolve. Never a raw `.length` — a program that
 * holds one live and two trashed routines reads "3" from a length and "1" from
 * the detail pane one click away, so the manager disagrees with itself
 * permanently rather than for a frame.
 */
export const countLive = (ids: readonly string[], live: Set<string>) =>
  ids.reduce((n, id) => n + (live.has(id) ? 1 : 0), 0);

/* ── state labels ─────────────────────────────────────────────────────── */

/**
 * The one-line reason a routine is not carrying its members, or null when it is.
 *
 * A LIVE container wears no marker at all — only the exception is labelled.
 * This is the guilt-free law (overlap-blocks decision 1): never a warning
 * colour, never a badge, never a dotted border.
 */
export function routinePillLabel(routine: Routine, todayStr: string, tz: string): string | null {
  if (!isPausedOn(routine, todayStr, tz)) return null;
  return routine.pausedUntil ? `Until ${formatShort(routine.pausedUntil)}` : 'Paused';
}

/** The same, for a program's three ways of being off. */
export function programPillLabel(program: Program, todayStr: string): string | null {
  if (isProgramActiveOn(program, todayStr)) return null;
  if (program.state === 'paused') return 'Paused';
  if (program.startsOn && todayStr < program.startsOn) return `From ${formatShort(program.startsOn)}`;
  return 'Ended';
}

/* ── filtering ────────────────────────────────────────────────────────── */

/**
 * The Organize console's section filter: a case-insensitive substring match,
 * and nothing cleverer.
 *
 * No fuzzy matching and no ranking on purpose. This filters ONE section of a
 * personal planner — under thirty objects the user named themselves — where a
 * fuzzy matcher's whole value (finding what you half-remember among thousands)
 * does not apply, and its cost does: `prg` quietly matching "Morning" reads as
 * the filter being broken, and a reordered list breaks the muscle memory that
 * makes a short list fast in the first place.
 *
 * The text is supplied by the caller because "the name" is not one field —
 * an item type matches on its label AND its slug, since the slug is what shows
 * on the row and what the user may be hunting for.
 */
export function matching<T>(rows: readonly T[], query: string, text: (row: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => text(row).toLowerCase().includes(q));
}

/** The common case: an object with a `name`. */
export const byName = <T extends { name: string }>(row: T) => row.name;

/* ── membership ───────────────────────────────────────────────────────── */

/**
 * Swap two members BY ID, leaving every other position — including any id that
 * names a trashed item — exactly where it was. Returns the same array when
 * either id is absent, so a stale click writes nothing.
 *
 * By id and never by index, because the rendered list drops ids that name a
 * trashed item: visible position and array position diverge the moment one
 * member is in the bin, and an index swap would then reorder a row the user
 * cannot see instead of the two they are looking at.
 */
export function swapMembers(ids: string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0 || i === j) return ids;
  const next = [...ids];
  next[i] = b;
  next[j] = a;
  return next;
}

/* ── buffered rename ──────────────────────────────────────────────────── */

/**
 * A name draft that commits on blur and Enter, never per keystroke.
 *
 * Live binding is forbidden here and the reason is not taste: every update
 * action stamps a history label and set()s, and the subscriber deep-clones the
 * whole snapshot on every change — so a live-bound input turns renaming
 * "Morning kickoff" into ~15 undo entries and ~15 PATCHes, evicting the user's
 * real history from a 50-deep stack.
 *
 * The draft resets on `[id, name]`, not just `[name]`. Without the id in there,
 * switching selection in a two-pane layout carries the PREVIOUS container's
 * half-typed draft into the next one's field.
 */
export function useNameDraft(id: string, name: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(name);

  // Adjusted during render rather than in an effect — React's documented
  // "adjusting state when a prop changes" pattern. An effect paints one frame
  // holding the PREVIOUS container's text, and that frame is live: a blur or an
  // Enter landing in it commits the old name onto the new object.
  const source = `${id} ${name}`;
  const [lastSource, setLastSource] = useState(source);
  if (source !== lastSource) {
    setLastSource(source);
    setDraft(name);
  }

  return {
    draft,
    setDraft,
    reset: () => setDraft(name),
    commit: () => {
      const next = draft.trim();
      if (!next || next === name) {
        setDraft(name);
        return;
      }
      commit(next);
    },
  };
}
