'use client';

import { useCallback, useMemo } from 'react';

import { EXT_GOALS, EXT_ORGANIZE, resolveEnabled } from './extension-registry';
import { useExtensionsStore } from './extensions-store';
import { useViewStore, type BraindumpGroupBy } from './view-store';
import { goalFilterItemIds } from './goals';
import type { Goal, GroupBy } from './planner-types';

/**
 * extension-gates.ts — one place to ask "is this idea switched on", and one
 * place that says what "off" MEANS.
 *
 * lib/extension-registry.ts declares that an extension EXISTS. This module is
 * how a surface asks about one, and it exists for the same reason
 * lib/item-registry.ts does: a component that writes
 * `resolveEnabled(s.enabled, 'goals')` has inlined a slug and a policy, and the
 * next component writes a subtly different one. Every gate below is a
 * capability question with its answer stated once.
 *
 * ── OFF MEANS INERT, NOT HIDDEN ─────────────────────────────────────────────
 *
 * Kirby, 2026-08-26: "I think off means inert, but still findable. Like an
 * extension store." So a switched-off extension keeps everything that lets you
 * FIND it — its catalog row in lib/extension-registry.ts, the settings pane
 * generated from that row, its search hits, and (for the palette) its command,
 * greyed rather than deleted. What stops is the BEHAVIOUR. Concretely:
 *
 *   Goals off
 *     · the Goal FILTER clause narrows nothing — `useGoalFilterIds` returns
 *       `null`, which lib/filters.ts already reads as inert. A stranded
 *       selection therefore hides no row; it is simply not consulted.
 *     · the Goal GROUPING value falls back to 'none' — `useCanvasGroupBy` /
 *       `useBraindumpGroupBy`. NOT to an empty goals list, which would mint one
 *       giant "No goal" section over every row and look like a bug.
 *     · goal MEMBERSHIP stops reaching the canvas: no role glyph, no Goal
 *       section in the item dialog, no goal line in Beacon's context.
 *     · /goal/[id] stops being a live surface and says so.
 *     · NO ITEM DISAPPEARS. That is the whole reason goals are an `aspire`
 *       kind (lib/container-registry.ts): a goal suppresses nothing when it is
 *       on, so switching it off must not suppress anything either. Every gate
 *       here removes a LAYER OVER items, never an item.
 *     · nothing is written. `goals` and `goal_items` are untouched, so
 *       switching back on restores every goal, every role and every membership.
 *     · THREE READS ARE DELIBERATELY NOT GATED, all of them the same one:
 *       `milestoneItemIds` in components/shell/app-shell.tsx (the bulk date
 *       verbs), components/ai/eod-review.tsx and components/ai/morning-triage-
 *       list.tsx. That set is what stops a sweep from overwriting a milestone's
 *       TARGET date, and that write is not undone by switching the extension
 *       back on — the date it replaced is gone. Gating them would make "off"
 *       destructive, which is the one thing off must never be. A gate that
 *       protects data stays on.
 *
 *   Organize off
 *     · the console does not open, and every door to it (the braindump button,
 *       the user card's Trash row, the palette's three Organize commands) is
 *       inert rather than absent.
 *     · nothing is written, and no container is deleted or hidden. Projects,
 *       routines, programs, habit groups and item types all keep working
 *       everywhere else — what goes away is the BULK MANAGEMENT surface.
 *
 * ── THE ONE PLACE THE TWO MEET ──────────────────────────────────────────────
 *
 * Goals are CREATED in the console's Goals section, so gating the console with
 * Goals still on would leave an extension you can switch on and then not use.
 * `consoleSectionsFor` resolves that: the Goals section rides EXT_GOALS and
 * every other section rides EXT_ORGANIZE, so each of the four combinations is
 * coherent and the console opens whenever it has at least one section to show.
 *
 * ── A GATE MUST NEVER THROW ─────────────────────────────────────────────────
 *
 * CLAUDE.md's rule for channels and stake adapters ("they must return a
 * failure, never throw it — an expired token in one must not cost the others")
 * applies harder here, because these gates run inside the canvas render. A gate
 * that threw would take the surface it was protecting down with it, which is
 * strictly worse than the feature it was gating. So every read is wrapped and
 * falls back to the manifest default.
 */

/** Never let a store read take down the surface asking the question. */
function safeEnabled(enabled: Record<string, boolean>, slug: string): boolean {
  try {
    return resolveEnabled(enabled, slug);
  } catch (error) {
    console.warn(`[extensions] gate read failed for "${slug}" — treating as off:`, error);
    return false;
  }
}

/** Reactive: re-renders the caller when the toggle flips. */
export function useExtensionEnabled(slug: string): boolean {
  return useExtensionsStore((s) => safeEnabled(s.enabled, slug));
}

/**
 * Non-reactive, for the plain modules that have no React in scope — command
 * `availableWhen` predicates and `run()` bodies, which already read stores this
 * way (see lib/commands/registry.ts).
 */
export function extensionEnabled(slug: string): boolean {
  try {
    return safeEnabled(useExtensionsStore.getState().enabled, slug);
  } catch (error) {
    console.warn(`[extensions] gate read failed for "${slug}" — treating as off:`, error);
    return false;
  }
}

/**
 * A predicate over slugs, for the surfaces whose gate is DATA rather than a
 * hand-named feature — the Organize console's section list is one manifest
 * entry per row, each naming its own extension, and it resolves them all
 * through this (see components/planner/organize/console-rail.tsx).
 *
 * Stable while the toggles are: `enabled` is a whole object the store replaces
 * only when something is actually written, so the callback identity survives
 * ordinary re-renders and a `useMemo` keyed on it does not churn.
 */
export function useExtensionPredicate(): (slug: string) => boolean {
  const enabled = useExtensionsStore((s) => s.enabled);
  return useCallback((slug: string) => safeEnabled(enabled, slug), [enabled]);
}

export const useGoalsEnabled = (): boolean => useExtensionEnabled(EXT_GOALS);
export const goalsEnabled = (): boolean => extensionEnabled(EXT_GOALS);
export const useOrganizeEnabled = (): boolean => useExtensionEnabled(EXT_ORGANIZE);
export const organizeEnabled = (): boolean => extensionEnabled(EXT_ORGANIZE);

/* ── grouping ─────────────────────────────────────────────────────────────── */

/**
 * Group-by values that belong to an extension, and which one.
 *
 * Declarative so the next gated axis is a line here rather than a branch in six
 * view mounts — the same bargain lib/item-registry.ts makes for item types.
 */
const GROUP_BY_EXTENSION: Record<string, string> = {
  goal: EXT_GOALS,
};

/**
 * A stored group-by value, resolved against what is actually switched on.
 *
 * Falls back to `'none'` rather than to an empty container list, and the
 * difference is the whole point: `groupRows(rows, 'goal', { goals: [] })`
 * returns ONE section labelled "No goal" holding every row on the surface,
 * which reads as a bug. `'none'` is what the surface looked like before anyone
 * grouped by anything.
 *
 * The STORED value is untouched — this resolves on read only — so a user who
 * grouped by goal, switched Goals off and switched it back on finds their
 * grouping still selected. Neither `setScope` nor `setLayout` clears a stranded
 * group-by either (lib/view-options.ts says why); this is the same posture.
 */
function resolveGroupBy<T extends string>(value: T, enabled: Record<string, boolean>): T | 'none' {
  const slug = GROUP_BY_EXTENSION[value];
  if (!slug) return value;
  return safeEnabled(enabled, slug) ? value : 'none';
}

/** The canvas group-by every view should actually group by. */
export function useCanvasGroupBy(): GroupBy {
  const stored = useViewStore((s) => s.canvasGroupBy);
  return useExtensionsStore((s) => resolveGroupBy(stored, s.enabled));
}

/** The braindump's own, smaller vocabulary — same resolution. */
export function useBraindumpGroupBy(): BraindumpGroupBy {
  const stored = useViewStore((s) => s.braindumpGroupBy);
  return useExtensionsStore((s) => resolveGroupBy(stored, s.enabled));
}

/* ── goal membership ──────────────────────────────────────────────────────── */

/** One identity, so a memo dependency on it never churns. */
const NO_GOALS: readonly Goal[] = [];

/**
 * The goal records a display surface may read — empty while Goals is off.
 *
 * Empty rather than absent because every consumer already handles "this item
 * serves no goal": the role glyph renders nothing, `goalRolesByItem` returns an
 * empty index, Beacon's focused-item section omits its "Serves:" line. None of
 * them drops a row, which is the contract an aspire container may never break.
 */
export function useGoalsForDisplay(goals: readonly Goal[]): readonly Goal[] {
  const on = useGoalsEnabled();
  return on ? goals : NO_GOALS;
}

/**
 * The Goal filter clause resolved to item ids, or `null` for "cannot narrow".
 *
 * `null` is the INERT answer lib/filters.ts' `passesGoalFilter` already
 * understands (`if (!memberIds) return true`), and it is what makes switching
 * Goals off safe on a surface that was filtered by one: the clause stops being
 * consulted, so every row that was hidden comes back. Returning an empty Set
 * instead would empty the surface with nothing on it to say why — the exact
 * failure `goalFilterItemIds` documents at length.
 */
export function useGoalFilterIds(
  goals: readonly Goal[],
  selectedGoalIds: readonly string[]
): ReadonlySet<string> | null {
  const on = useGoalsEnabled();
  return useMemo(
    () => (on ? goalFilterItemIds(goals, selectedGoalIds) : null),
    [on, goals, selectedGoalIds]
  );
}
