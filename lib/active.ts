/**
 * active.ts — the ONE definition of "is this item live right now?"
 *
 * Written the way lib/overdue.ts was, and for the same reason: that module
 * exists because one predicate had been copied into three surfaces and the
 * copies drifted. Suppression is going to be asked by MORE surfaces than
 * "past due" ever was — the grid, the past-due bar, the EOD review, the
 * braindump, Beacon's context, the agent projections, search — so it gets a
 * single home before the first copy can happen, not after the third.
 *
 * Everything here is pure and string-based. Nothing reads a store and nothing
 * calls `new Date()` for "today" — callers pass the day, which is what makes
 * the whole thing testable and timezone-stable.
 *
 * Three layers answer "is it live": the item's own pause, the routines holding
 * it, and the programs holding those (or holding it directly). They combine
 * through the path algebra in {@link isItemActiveOn} — read that first; the
 * rest of this file is its supporting cast.
 *
 * See memory/plans/programs-routines.md, locked decisions 3 and 4.
 */

import { isRecurring, isCompletedOnDate, isSkippedOnDate, toDateStr } from './recurrence';
import { toDateOnly } from './overdue';
import type { Item, Routine, Program } from './planner-types';

/**
 * Everything the resolver needs beyond the item and the date.
 *
 * It is an object rather than positional arguments precisely so that growth is
 * additive at every call site — every Phase 1 caller passing `{ userTimezone }`
 * alone still compiles and still gets correct answers, because an item with no
 * containers is unconditionally live (decision 3's "no paths = today's
 * behavior, unchanged").
 */
export interface ActivationContext {
  /** IANA zone — the pause interval's start is a timestamp and must be read in the user's day. */
  userTimezone: string;
  /**
   * The user's LIVE routines. Soft-deleted ones must never appear: decision 3
   * removes trashed containers from resolution *before* the standalone test, so
   * a routine in the trash neither suppresses its members nor keeps them scoped.
   * `fetchRoutines` filters `deleted_at`, so the store's array satisfies this.
   *
   * Omitted (any surface that legitimately has no container context) means "no
   * memberships known" — item-level pause only.
   */
  routines?: readonly Routine[];
  /**
   * The user's LIVE programs, same soft-delete contract as `routines` and for a
   * sharper reason: a trashed program must not keep suppressing the items it
   * held. Trashing it removes its paths, so a routine it was the only holder of
   * falls back to standalone and its members return — which is what makes
   * "restore within 30 days" restore the suppression too, intact.
   */
  programs?: readonly Program[];
}

/** The pause columns, on an item or (from Phase 2) a routine. */
export interface Pausable {
  pausedAt?: string;
  pausedUntil?: string;
}

/**
 * Is `x` inside a pause interval on `dateStr`?
 *
 * The interval is [pausedAt's date, pausedUntil), and BOTH bounds matter:
 *
 * - The lower bound is why `pausedAt` is stored at all. Without it, pausing a
 *   habit today would suppress every unmarked occurrence backwards through its
 *   whole history — habits are deliberately un-anchored (they render on every
 *   matching day, forever) precisely so that history stays visible, and a
 *   pause must not retroactively erase a July that actually happened.
 * - The upper bound is EXCLUSIVE: "paused until Sep 1" is live again ON Sep 1.
 *   That makes auto-resume a read-side predicate — no cron, no cleanup write,
 *   and an expired pause still reads correctly as "was paused during […]",
 *   which is what the auto-age sweep's resume grace needs (plan decision 9).
 *
 * A manual resume normalizes to `pausedUntil = today` rather than clearing the
 * pair, so the interval survives on the row.
 */
export function isPausedOn(x: Pausable, dateStr: string, userTimezone: string): boolean {
  if (!x.pausedAt) return false;
  const day = toDateOnly(dateStr);
  const started = pauseStartDate(x.pausedAt, userTimezone);
  // Unparseable timestamp: treat as not-paused. Hiding work is the costlier
  // failure, and a bad value here would otherwise silently swallow items.
  if (!started || started > day) return false;
  if (x.pausedUntil && day >= toDateOnly(x.pausedUntil)) return false;
  return true;
}

/** The user-local calendar day a pause began, or null if the stamp is junk. */
function pauseStartDate(pausedAt: string, userTimezone: string): string | null {
  const at = new Date(pausedAt);
  if (Number.isNaN(at.getTime())) return null;
  return toDateStr(at, userTimezone);
}

/**
 * Is this program switched on for `dateStr`?
 *
 * The tri-state exists because a period of life has two different kinds of
 * boundary. `auto` follows the calendar — a summer that starts on Jun 1 should
 * not need a reminder to turn itself on. `active`/`paused` are manual overrides
 * and they ALWAYS win, because a person who flips a program by hand ("we came
 * back early") must never be second-guessed by a date they set weeks ago.
 *
 * Only `auto` is date-resolved. The manual states genuinely have no date
 * history — nothing records when they were flipped — so they apply uniformly to
 * every rendered column, past and future alike. That asymmetry is deliberate:
 * pretending a manual flip had a start date would invent history the row does
 * not contain, and a week view would render a boundary that never happened.
 *
 * The range is INCLUSIVE at both ends, unlike a pause's exclusive upper bound.
 * A pause is written as "until Sep 1" (come back ON the 1st); a program range is
 * written as a period you are inside — "Jun 1 to Aug 31" plainly includes Aug 31.
 * The two read differently in the UI, so they resolve differently here.
 */
export function isProgramActiveOn(program: Program, dateStr: string): boolean {
  if (program.state === 'active') return true;
  if (program.state === 'paused') return false;
  const day = toDateOnly(dateStr);
  if (program.startsOn && day < toDateOnly(program.startsOn)) return false;
  if (program.endsOn && day > toDateOnly(program.endsOn)) return false;
  return true;
}

/**
 * The routines holding `item`, live ones only.
 *
 * Linear in the routine count, which is fine for the single-item callers (a
 * dialog, a sheet). Bulk callers go through {@link inactiveItemIdsOn}, which
 * inverts the membership once instead of scanning per item.
 */
export function routinesForItem(
  itemId: string,
  routines: readonly Routine[] | undefined,
): readonly Routine[] {
  if (!routines?.length) return EMPTY_ROUTINES;
  return routines.filter((r) => r.itemIds.includes(itemId));
}

/** The programs holding `item` DIRECTLY — not the ones reached through a routine. */
export function programsForItem(
  itemId: string,
  programs: readonly Program[] | undefined,
): readonly Program[] {
  if (!programs?.length) return EMPTY_PROGRAMS;
  return programs.filter((p) => p.itemIds.includes(itemId));
}

const EMPTY_ROUTINES: readonly Routine[] = [];
const EMPTY_PROGRAMS: readonly Program[] = [];

/**
 * One way an item can be scoped: a routine, a program, or a routine inside a
 * program. Never neither — an item with no paths is unconditionally live and
 * never produces one of these.
 */
export interface ActivationPath {
  routine?: Routine;
  program?: Program;
}

/**
 * Every path that scopes `itemId`, per decision 3.
 *
 * Three shapes, and the third is the one that carries the design:
 *
 *   1. direct      item → P
 *   2. via routine item → R → P   (one path per program holding R)
 *   3. standalone  item → R       (only when R belongs to NO program)
 *
 * The standalone rule is why attaching a routine to its first program is a
 * visible event rather than a no-op: before the attach, the routine answers for
 * itself; after it, the program answers too. Detaching from the last program
 * hands the answer back. The manager's attach flow states this consequence out
 * loud (decision 3's "known discontinuity, accepted") because a join write that
 * silently hides five items would otherwise read as a bug.
 *
 * Soft-deleted containers are already absent — `ctx.routines`/`ctx.programs`
 * carry live rows only — which is what makes trashing a program restore its
 * routine to standalone rather than stranding its members behind a container
 * nobody can see or resume.
 */
export function activationPathsFor(itemId: string, ctx: ActivationContext): ActivationPath[] {
  const paths: ActivationPath[] = [];
  for (const program of programsForItem(itemId, ctx.programs)) paths.push({ program });
  for (const routine of routinesForItem(itemId, ctx.routines)) {
    const holders = (ctx.programs ?? []).filter((p) => p.routineIds.includes(routine.id));
    if (holders.length === 0) paths.push({ routine });
    else for (const program of holders) paths.push({ routine, program });
  }
  return paths;
}

/** A path carries the item on `dateStr` iff every container on it is switched on. */
export function isPathLiveOn(path: ActivationPath, dateStr: string, tz: string): boolean {
  if (path.routine && isPausedOn(path.routine, dateStr, tz)) return false;
  if (path.program && !isProgramActiveOn(path.program, dateStr)) return false;
  return true;
}

/**
 * Is this item live on `dateStr`?
 *
 * Decision 3's path algebra, complete. An item is live if it is not itself
 * paused AND (it has no paths at all, OR at least one path is live).
 *
 * The "no paths" arm is what keeps this backwards-compatible: the overwhelming
 * majority of items belong to nothing, and they behave exactly as they did
 * before any of this existed. Joining a container is what makes an item's
 * visibility answerable by something other than itself.
 *
 * The rule is DISJUNCTIVE across paths and that is a product decision, not an
 * implementation convenience: a second container is an additional reason for an
 * item to appear, never a new way for it to vanish. Put the gym habit in both
 * "Morning" and "Summer" and pausing Morning leaves it on the grid, because
 * Summer still wants it. The alternative (all paths must agree) would make
 * every membership a liability and nobody would ever add the second one.
 *
 * Note this answers "is it live", NOT "should it be hidden" — a suppressed item
 * with a completion mark still renders. Hiding surfaces want
 * {@link isOpenLoopSuppressedOn}.
 */
export function isItemActiveOn(item: Item, dateStr: string, ctx: ActivationContext): boolean {
  if (isPausedOn(item, dateStr, ctx.userTimezone)) return false;
  const paths = activationPathsFor(item.id, ctx);
  if (paths.length === 0) return true;
  return paths.some((p) => isPathLiveOn(p, dateStr, ctx.userTimezone));
}

/**
 * Does this item still want doing on `dateStr` — i.e. is it an OPEN LOOP there?
 *
 * A recurring item's obligation on a date is discharged by any mark: a
 * completion, a skip, or (for a counted habit) a tally. A one-shot item's is
 * discharged by leaving `pending` — which covers 'completed' and, deliberately,
 * 'cancelled', matching selectOverdue's reasoning that a cancelled item must
 * never resurface in a surface whose exits assume it can be completed.
 */
export function isOpenLoopOn(item: Item, dateStr: string): boolean {
  const day = toDateOnly(dateStr);
  if (isRecurring(item)) {
    if (isCompletedOnDate(item, day)) return false;
    if (isSkippedOnDate(item, day)) return false;
    // Habit-only, and only when timesPerDay is in play; absent elsewhere.
    const counts = (item as { dailyCounts?: Record<string, number> }).dailyCounts;
    if (counts && (counts[day] ?? 0) > 0) return false;
    return true;
  }
  return item.status === 'pending';
}

/**
 * THE predicate every hiding surface asks: suppressed AND still an open loop.
 *
 * This is locked decision 4 in one function — "suppression hides open loops,
 * never history". A paused habit you already ticked today keeps its row in the
 * EOD review, in Beacon's narration and in the agent projection; only the
 * unanswered obligations disappear. Get this wrong in the hiding direction and
 * pausing quietly rewrites the past.
 */
export function isOpenLoopSuppressedOn(
  item: Item,
  dateStr: string,
  ctx: ActivationContext,
): boolean {
  return !isItemActiveOn(item, dateStr, ctx) && isOpenLoopOn(item, dateStr);
}

/**
 * Ids of every item that must be hidden on `dateStr`.
 *
 * The pure derivations downstream (deriveDayItems, selectOverdue) take this Set
 * rather than the containers themselves: they are store-free by design, and
 * from Phase 2 resolving an item would mean walking item → routine → program.
 * Resolving once per rendered date and passing ids keeps that walk in one place.
 */
export function inactiveItemIdsOn(
  items: readonly Item[],
  dateStr: string,
  ctx: ActivationContext,
): Set<string> {
  // Invert the membership ONCE. Calling activationPathsFor per item would be
  // O(items × routines × programs) on every rendered column of every week view;
  // this is O(total memberships + items). The value is the item's live-path
  // count on this date, which is all the algebra needs: >0 live, or 0 with no
  // paths at all.
  const pathsByItem = new Map<string, { total: number; live: number }>();
  const bump = (itemId: string, total: number, live: number) => {
    const tally = pathsByItem.get(itemId);
    if (tally) {
      tally.total += total;
      tally.live += live;
    } else {
      pathsByItem.set(itemId, { total, live });
    }
  };

  // Resolve each program's state ONCE — a program held by four routines would
  // otherwise be re-resolved four times per column.
  const programs = ctx.programs ?? [];
  const programLive = new Map<string, boolean>();
  for (const program of programs) programLive.set(program.id, isProgramActiveOn(program, dateStr));

  // Direct item → program paths.
  for (const program of programs) {
    const live = programLive.get(program.id) ? 1 : 0;
    for (const itemId of program.itemIds) bump(itemId, 1, live);
  }

  const holdersByRoutine = new Map<string, string[]>();
  for (const program of programs) {
    for (const routineId of program.routineIds) {
      const holders = holdersByRoutine.get(routineId);
      if (holders) holders.push(program.id);
      else holdersByRoutine.set(routineId, [program.id]);
    }
  }

  // Routine paths. A routine's contribution is IDENTICAL for every one of its
  // members, so it is computed once per routine rather than once per membership.
  for (const routine of ctx.routines ?? []) {
    const holders = holdersByRoutine.get(routine.id);
    const routinePaused = isPausedOn(routine, dateStr, ctx.userTimezone);
    // No holder ⇒ standalone: one path, governed by the routine alone.
    const total = holders?.length ?? 1;
    const live = routinePaused
      ? 0
      : (holders?.filter((id) => programLive.get(id)).length ?? 1);
    for (const itemId of routine.itemIds) bump(itemId, total, live);
  }

  const ids = new Set<string>();
  for (const item of items) {
    const tally = pathsByItem.get(item.id);
    const active =
      !isPausedOn(item, dateStr, ctx.userTimezone) && (!tally || tally.total === 0 || tally.live > 0);
    if (!active && isOpenLoopOn(item, dateStr)) ids.add(item.id);
  }
  return ids;
}

/**
 * Why an item is suppressed, for the surfaces that must SAY so — the item
 * panel's activation line, the /item/[id] header, the braindump's Paused
 * section. Returns null when the item is live, so `!reason` doubles as the
 * liveness check.
 *
 * A discriminated union rather than a pre-rendered string: the copy differs per
 * surface (a chip has room for "Hidden with Summer", a list subtitle does not)
 * and only the caller knows which.
 */
export type SuppressionReason =
  | { kind: 'paused'; until?: string }
  | { kind: 'routine'; routine: Routine; until?: string }
  | { kind: 'program'; program: Program; routine?: Routine; until?: string };

/**
 * The date an inactive program switches itself back on, if it will.
 *
 * Only an `auto` program with a future start has one. A manually paused program
 * has no scheduled return by construction, and one past its `endsOn` is over —
 * both correctly answer "no date", which the ranking below reads as "returns
 * last" rather than inventing a reassurance the row cannot support.
 */
function programResumeDate(program: Program, dateStr: string): string | undefined {
  if (program.state !== 'auto' || !program.startsOn) return undefined;
  return toDateOnly(dateStr) < toDateOnly(program.startsOn) ? program.startsOn : undefined;
}

/**
 * For a path that is NOT carrying the item: when it would, and which of its
 * containers to blame.
 *
 * "Which to blame" is the whole difficulty. A path through a paused routine
 * inside an out-of-season program is blocked twice, and naming the one that
 * clears FIRST would promise a return date the item will not honour — the user
 * resumes the routine on the strength of the note and nothing appears. So the
 * binding constraint wins: whichever clears last, with an unknown return
 * counting as latest of all.
 */
function deadPathExplanation(
  path: ActivationPath,
  dateStr: string,
  tz: string,
): { returnsOn?: string; reason: SuppressionReason } {
  const routineBlocks = !!path.routine && isPausedOn(path.routine, dateStr, tz);
  const programBlocks = !!path.program && !isProgramActiveOn(path.program, dateStr);
  const routineReturns = routineBlocks ? path.routine!.pausedUntil : undefined;
  const programReturns = programBlocks ? programResumeDate(path.program!, dateStr) : undefined;

  const nameProgram =
    programBlocks &&
    (!routineBlocks ||
      !programReturns ||
      (!!routineReturns && programReturns >= routineReturns));

  // The path clears only when BOTH constraints do, so an unknown on either side
  // makes the whole path's return unknown.
  const returnsOn =
    (routineBlocks && !routineReturns) || (programBlocks && !programReturns)
      ? undefined
      : [routineReturns, programReturns].filter(Boolean).sort().pop();

  if (nameProgram) {
    return {
      returnsOn,
      reason: {
        kind: 'program',
        program: path.program!,
        routine: path.routine,
        until: programReturns,
      },
    };
  }
  return {
    returnsOn,
    reason: { kind: 'routine', routine: path.routine!, until: routineReturns },
  };
}

/**
 * The one place suppression is put into words.
 *
 * Three surfaces render this — the item panel's activation line, the /item/[id]
 * header chip, and the braindump's Paused section — and they were already
 * drifting at two. The `long` variant has room for the article-and-noun copy
 * rule ("your Summer program", never a bare "Program") and a return date; the
 * short one is for chips, where the container's name is the whole message.
 *
 * Never a warning colour and never an apology, per the guilt-free law
 * (overlap-blocks decision 1): this states where the work went, and that is all.
 */
export function suppressionLabel(reason: SuppressionReason, opts: { long?: boolean } = {}): string {
  const back = reason.until ? ` — back ${formatDay(reason.until)}` : '';
  switch (reason.kind) {
    case 'paused':
      return reason.until ? `Paused until ${formatDay(reason.until)}` : 'Paused';
    case 'routine':
      return opts.long
        ? `Hidden with your ${reason.routine.name} routine${back}`
        : `Hidden with ${reason.routine.name}`;
    case 'program':
      return opts.long
        ? `Hidden with your ${reason.program.name} program${back}`
        : `Hidden with ${reason.program.name}`;
  }
}

/** `2026-09-01` → `Sep 1`. Parsed as a plain calendar day, never as an instant. */
function formatDay(dateStr: string): string {
  const [y, m, d] = toDateOnly(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${MONTHS[m - 1]} ${d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function suppressionReason(
  item: Item,
  dateStr: string,
  ctx: ActivationContext,
): SuppressionReason | null {
  // The item's own pause wins the explanation when both are true. It is the one
  // the user set on this row and the one the row's own Resume undoes — naming a
  // container instead would send them to a control that leaves the item hidden.
  if (isPausedOn(item, dateStr, ctx.userTimezone)) {
    return { kind: 'paused', until: item.pausedUntil };
  }
  const paths = activationPathsFor(item.id, ctx);
  if (paths.length === 0) return null;
  if (paths.some((p) => isPathLiveOn(p, dateStr, ctx.userTimezone))) return null;

  // Every path is dead. Across paths the item returns as soon as the FIRST one
  // clears (they are disjunctive), so the soonest-returning path is both the
  // honest date and the one whose control is worth naming.
  const explanations = paths.map((p) => deadPathExplanation(p, dateStr, ctx.userTimezone));
  explanations.sort((a, b) => {
    if (a.returnsOn === b.returnsOn) return 0;
    if (!a.returnsOn) return 1;
    if (!b.returnsOn) return -1;
    return a.returnsOn < b.returnsOn ? -1 : 1;
  });
  return explanations[0].reason;
}
