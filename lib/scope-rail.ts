/**
 * scope-rail.ts — what the sidebar's Scopes strip shows, computed once.
 *
 * The rail is a switchboard, not a list of records: one row per container, a
 * switch, and a line saying what that switch is currently doing. Everything
 * hard about it is here, pure and date-parameterized, so the component is only
 * markup.
 *
 * Two rules carry the design, and both come out of the path algebra rather than
 * out of taste:
 *
 *   1. **Local state on the switch, effective state in the luminance.** A
 *      routine keeps its own `pausedAt` while a program suppresses it. Render
 *      that routine as "off" and resuming the program hands back a routine the
 *      user believes they turned off — so the switch always shows the STORED
 *      value and the row's dimming shows the RESOLVED one. They never merge.
 *      Only routines can disagree; a program has nothing above it.
 *
 *   2. **A member count is wrong under an OR rule.** An item held by two
 *      programs does not move when one of them goes off. So every number here
 *      is a resolver DELTA — flip the switch in a copy of the world, re-run
 *      `inactiveItemIdsOn`, diff. The same delta drives the hover preview, so
 *      the number and the ghost can never disagree about what is about to
 *      happen. (The manager's attach confirm already reasons this way; see
 *      `wouldHide` in manage-collections-dialog.tsx.)
 *
 * See memory/plans/programs-routines.md, Phase 5.
 */

import {
  formatDay,
  inactiveItemIdsOn,
  isOpenLoopOn,
  isPausedOn,
  isProgramActiveOn,
  programResumeDate,
  type ActivationContext,
} from './active';
import type { Item, Program, Routine } from './planner-types';
import type { GateKind } from './container-registry';

/**
 * The rail's rows are exactly the GATE containers — the kinds whose membership
 * switches work off rather than describing it.
 *
 * Aliased rather than re-declared so the seam is one fact: a kind that starts
 * gating gets a rail row by declaring `role: 'gate'`, and a classify kind can
 * never acquire one by someone widening a string union here. This is the type
 * half of what `ActivationContext` enforces at runtime by taking only routines
 * and programs.
 */
export type ScopeKind = GateKind;

export interface ScopeRow {
  kind: ScopeKind;
  id: string;
  name: string;
  icon?: string;
  /** The switch: what the user set on THIS container. Never the resolved answer. */
  localOn: boolean;
  /** What resolves today, once the containers above have had their say. */
  effectiveOn: boolean;
  /** The right-hand line — "On · follows dates", "Off · back Sep 8". */
  state: string;
  /**
   * Ids of the open work whose visibility actually changes when this switch is
   * flipped. Drives both the row's number and the hover ghost.
   */
  flips: string[];
  /** Open members this container holds at all (live rows only — see the dangling-id rule). */
  holds: number;
  /** Open members currently visible that this switch does NOT govern — another path carries them. */
  heldElsewhere: number;
}

/**
 * A pause with no beginning and no end, for simulating "switched off".
 *
 * The epoch rather than `now`: {@link isPausedOn} compares the pause's start
 * against the date being resolved, and the rail resolves at today — but a
 * caller asking about a future column would get "not paused yet" from a
 * `now`-stamped simulation, which is the opposite of what the switch means.
 */
const SIMULATED_PAUSE = { pausedAt: '1970-01-01T00:00:00.000Z', pausedUntil: undefined };

/**
 * The program state a binary switch should write — the rule that keeps the rail
 * from quietly destroying date-following.
 *
 * Prefer `auto` whenever `auto` already gives the answer being asked for; write
 * a manual override only when the user is genuinely overruling the calendar.
 *
 * This matters in both directions and the plugin notes only caught one of them.
 * Turning a live summer off with `paused` and back on with `active` leaves a
 * program that no longer ends on Aug 31 and that nobody will remember to switch
 * off (the Phase 4d note). But the mirror is just as bad: a term switched on
 * early with `active` and then off again with `paused` has also lost its Sep 1
 * start, and the row that used to say "back Sep 1" now says nothing. Under this
 * rule both round-trip exactly, because in each case `auto` was already
 * producing the requested state and no override was needed.
 */
export function programStateForSwitch(
  program: Program,
  on: boolean,
  todayStr: string,
): Program['state'] {
  if (isProgramActiveOn({ ...program, state: 'auto' }, todayStr) === on) return 'auto';
  return on ? 'active' : 'paused';
}

/** The container as it would be with its switch flipped — the input to the delta. */
function flippedProgram(program: Program, todayStr: string): Program {
  const on = isProgramActiveOn(program, todayStr);
  return { ...program, state: programStateForSwitch(program, !on, todayStr) };
}

function flippedRoutine(routine: Routine, localOn: boolean): Routine {
  return localOn
    ? { ...routine, ...SIMULATED_PAUSE }
    : { ...routine, pausedAt: undefined, pausedUntil: undefined };
}

/** Ids in exactly one of the two sets. A container flip only ever moves work one way. */
function symmetricDifference(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of a) if (!b.has(id)) out.push(id);
  for (const id of b) if (!a.has(id)) out.push(id);
  return out;
}

/**
 * Every open-loop item this container governs, live rows only.
 *
 * Live rows only because member arrays may name trashed items — the join rows
 * survive an item's soft delete by design, and the locked rule is that consumers
 * filter against the live index rather than pruning the array.
 *
 * Open loops only because the count is about work that would MOVE. A habit
 * already ticked today keeps rendering whatever this switch does (the history
 * rule), so counting it would promise a disappearance that cannot happen.
 */
function openMemberIds(
  container: Routine | Program,
  routines: readonly Routine[],
  byId: ReadonlyMap<string, Item>,
  todayStr: string,
): string[] {
  const ids = new Set(container.itemIds);
  if ('routineIds' in container) {
    for (const routineId of container.routineIds) {
      const routine = routines.find((r) => r.id === routineId);
      if (routine) for (const id of routine.itemIds) ids.add(id);
    }
  }
  const out: string[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item && isOpenLoopOn(item, todayStr)) out.push(id);
  }
  return out;
}

function programStateLine(program: Program, todayStr: string): string {
  if (program.state === 'active') return 'On · you turned it on';
  if (program.state === 'paused') return 'Off · you turned it off';
  if (isProgramActiveOn(program, todayStr)) {
    return program.endsOn ? `On · until ${formatDay(program.endsOn)}` : 'On';
  }
  const back = programResumeDate(program, todayStr);
  if (back) return `Off · back ${formatDay(back)}`;
  // An INVERTED range gets neither half of this. It is live on no date, so its
  // start is not a return (which `programResumeDate` already refuses) and its
  // end never arrived — "ended Aug 1" would report a season that never ran.
  const inverted = !!program.startsOn && !!program.endsOn && program.startsOn > program.endsOn;
  if (!inverted && program.endsOn && todayStr > program.endsOn) {
    return `Off · ended ${formatDay(program.endsOn)}`;
  }
  return 'Off';
}

/**
 * The line for a routine, including the one case the whole local/effective
 * split exists for: the routine's own switch says on, and it still is not
 * carrying anything, because every program holding it is off.
 *
 * The blocking program is NAMED but its return date is not repeated — that
 * program has its own row in this same rail, two lines away, already carrying
 * it. Holders are ranked by the disjunctive rule (the routine comes back when
 * the FIRST of them does), which is why `programResumeDate` is shared with
 * `active.ts` rather than re-derived here.
 */
function routineStateLine(
  routine: Routine,
  localOn: boolean,
  effectiveOn: boolean,
  blockers: readonly Program[],
  todayStr: string,
  tz: string,
): string {
  if (!localOn) {
    return isPausedOn(routine, todayStr, tz) && routine.pausedUntil
      ? `Off · back ${formatDay(routine.pausedUntil)}`
      : 'Off';
  }
  // A blocked holder is only worth naming when it is actually blocking. Under
  // the disjunctive rule one live program carries the routine regardless of how
  // many others are off, and naming them there would report a suppression that
  // is not happening.
  if (effectiveOn || blockers.length === 0) return 'On';
  const soonest = [...blockers].sort((a, b) => {
    const da = programResumeDate(a, todayStr);
    const db = programResumeDate(b, todayStr);
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  })[0];
  const more = blockers.length - 1;
  return `On · held with ${soonest.name}${more > 0 ? ` +${more}` : ''}`;
}

/**
 * Build the rail.
 *
 * Cost is (containers + 1) passes of `inactiveItemIdsOn`, which is linear in
 * items + memberships. At the real data volume this feature was designed for —
 * a few programs, a handful of routines — that is one memoized pass per store
 * change, resolved at TODAY only. It is deliberately NOT resolved per rendered
 * column: the rail is a dateless surface (locked decision 3) and a week view
 * would otherwise re-run the whole thing seven times to draw one strip.
 */
export function buildScopeRows(
  items: readonly Item[],
  routines: readonly Routine[],
  programs: readonly Program[],
  todayStr: string,
  tz: string,
): ScopeRow[] {
  const ctx: ActivationContext = { userTimezone: tz, routines, programs };
  const baseline = inactiveItemIdsOn(items, todayStr, ctx);
  const byId = new Map(items.map((item) => [item.id, item]));

  const finish = (
    partial: Omit<ScopeRow, 'flips' | 'holds' | 'heldElsewhere'>,
    container: Routine | Program,
    flipped: ReadonlySet<string>,
  ): ScopeRow => {
    const flips = symmetricDifference(baseline, flipped);
    const moved = new Set(flips);
    const members = openMemberIds(container, routines, byId, todayStr);
    // Visible right now, and not one of the ones this switch would move: some
    // other path is carrying it, so the switch is not the whole story for it.
    const heldElsewhere = members.filter((id) => !baseline.has(id) && !moved.has(id)).length;
    return { ...partial, flips, holds: members.length, heldElsewhere };
  };

  const programRows = programs.map((program) => {
    const on = isProgramActiveOn(program, todayStr);
    return finish(
      {
        kind: 'program',
        id: program.id,
        name: program.name,
        icon: program.icon,
        localOn: on,
        // A program has nothing above it, so its stored switch IS its effect.
        effectiveOn: on,
        state: programStateLine(program, todayStr),
      },
      program,
      inactiveItemIdsOn(items, todayStr, {
        ...ctx,
        programs: programs.map((p) => (p.id === program.id ? flippedProgram(p, todayStr) : p)),
      }),
    );
  });

  const routineRows = routines.map((routine) => {
    const localOn = !isPausedOn(routine, todayStr, tz);
    const holders = programs.filter((p) => p.routineIds.includes(routine.id));
    const blockers = holders.filter((p) => !isProgramActiveOn(p, todayStr));
    // Disjunctive, exactly as in the resolver: a standalone routine answers for
    // itself, and one held by several programs is live while ANY holder is.
    const effectiveOn = localOn && (holders.length === 0 || blockers.length < holders.length);
    return finish(
      {
        kind: 'routine',
        id: routine.id,
        name: routine.name,
        icon: routine.icon,
        localOn,
        effectiveOn,
        state: routineStateLine(routine, localOn, effectiveOn, blockers, todayStr, tz),
      },
      routine,
      inactiveItemIdsOn(items, todayStr, {
        ...ctx,
        routines: routines.map((r) => (r.id === routine.id ? flippedRoutine(r, localOn) : r)),
      }),
    );
  });

  // Off ranks last but never leaves the list — Linear's rule, and it is what
  // makes turning something off feel reversible rather than like a disposal.
  // Programs before routines within each half: a program can switch a whole
  // routine, so the thing with the wider reach reads first.
  const rank = (row: ScopeRow) =>
    (row.effectiveOn ? 0 : 2) + (row.kind === 'program' ? 0 : 1);
  return [...programRows, ...routineRows].sort((a, b) => rank(a) - rank(b));
}

/**
 * The arithmetic, in words, for the row's tooltip.
 *
 * A raw member count is simply wrong under an OR rule, and this is the one
 * place the disjunction gets taught as a number rather than a paragraph.
 */
export function scopeCountLine(row: ScopeRow): string {
  const parts = [`holds ${row.holds}`];
  if (row.flips.length > 0) {
    parts.push(
      row.effectiveOn
        ? `${row.flips.length} would leave`
        : `${row.flips.length} would come back`,
    );
  }
  if (row.heldElsewhere > 0) parts.push(`${row.heldElsewhere} held elsewhere`);
  return parts.join(' · ');
}
