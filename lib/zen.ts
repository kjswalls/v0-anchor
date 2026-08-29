import { BUCKET_ORDER, type DayItems } from './day-items';
import { getItemTypeConfig } from './item-registry';
import type { HabitItem, Task } from './planner-types';

/**
 * Zen's pure half — how a day becomes one list, and which row of that list
 * takes the hero.
 *
 * Separated from components/zen/zen-room.tsx so the two decisions that carry
 * any judgement can be read and tested without a DOM: the ORDER (anytime
 * before the clock, habits and tasks interleaved) and the PICK (now beats
 * unscheduled beats next). Everything here is a function of data already
 * derived by lib/day-items.ts — nothing in this module decides whether an item
 * wants doing, which is lib/active.ts's job and must stay there.
 */

export type ZenRow = { itemType: 'task'; item: Task } | { itemType: 'habit'; item: HabitItem };

/** Why this row is the hero — drives the kicker above it. */
export type ZenHeroKind = 'now' | 'anytime' | 'next' | 'missed';

export interface ZenHero {
  row: ZenRow;
  kind: ZenHeroKind;
}

/**
 * How long this item's block runs, in minutes.
 *
 * An item with no `duration` is NOT an instant: every scheduled surface falls
 * back to the registry's `defaultBlockMinutes` for its type (see
 * `defaultMinutes` in components/views/day-schedule.tsx, which this mirrors).
 * Reading the raw field instead would make a timed item with no duration a
 * one-minute flicker in this room while the grid drew it as a half-hour block —
 * the hero would skip past it seconds after it began, and the rail would refuse
 * to draw at all.
 */
export function blockMinutes(row: ZenRow): number {
  if (row.item.duration != null) return row.item.duration;
  // The projections are filters, not maps, so the runtime discriminator
  // survives on the row even though the declared Task/HabitItem does not carry
  // it — the same cast task-row.tsx makes to resolve a custom type.
  const projected = row.item as { type?: string; customType?: string };
  const typeName =
    projected.type === 'custom' ? projected.customType! : projected.type ?? row.itemType;
  return getItemTypeConfig(typeName).schedule.defaultBlockMinutes;
}

/**
 * A multi-count habit's progress today, or null for everything else.
 *
 * `isRowDone` only turns true at the target, so without this the first N−1
 * ticks of a "drink 3 glasses" habit change nothing the room draws and read as
 * dead clicks. task-row answers the same question with a fill rising inside the
 * checkbox plus an n/N readout; this is that state, minus the DOM.
 */
export function multiCount(
  row: ZenRow,
  dateStr: string
): { count: number; target: number; pct: number } | null {
  if (row.itemType !== 'habit') return null;
  const habit = row.item;
  const target = habit.timesPerDay && habit.timesPerDay > 1 ? habit.timesPerDay : 0;
  if (target === 0) return null;
  const done = habit.completedDates.includes(dateStr);
  const tallied = (habit.dailyCounts ?? {})[dateStr] ?? 0;
  // A habit marked done without a tally still counts as a full day — the same
  // fallback the write side uses.
  const count = done ? tallied || habit.timesPerDay || target : tallied;
  return { count, target, pct: Math.min(100, Math.round((count / target) * 100)) };
}

/** 'HH:mm' → minutes since midnight. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight → 'H:mm' on a 12-hour clock, no meridiem. */
export function clockOf(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

/** "46m left" / "1h left" / "1h 12m left". */
export function formatRemaining(mins: number): string {
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/**
 * Timed rows lead, in time order; untimed rows hold the order they arrived in.
 *
 * `Array.prototype.sort` is stable, so returning 0 for two untimed rows keeps
 * the habits-then-tasks tie-break the derivation emitted rather than shuffling
 * them — the same guarantee `flattenDayRows` leans on.
 */
export function byStart(a: ZenRow, b: ZenRow): number {
  const at = a.item.startTime;
  const bt = b.item.startTime;
  if (at && bt) return at.localeCompare(bt);
  if (at) return -1;
  if (bt) return 1;
  return 0;
}

/**
 * One day as one list: the anytime bucket first, then the scheduled hours.
 *
 * That order is the schedule view's, and BUCKET_ORDER already encodes it
 * ('anytime' is its first member) — so this reads the constant rather than
 * restating the sequence, and a change there moves both surfaces together.
 *
 * Habits and tasks are merged and re-sorted WITHIN each bucket instead of being
 * kept in separate runs the way `flattenDayRows` keeps them. In this room a
 * habit is an item like any other, so a 5pm gym block belongs between the 3:30
 * and the 7:00 rather than in a cluster of its own.
 */
export function zenRows(day: DayItems): ZenRow[] {
  return BUCKET_ORDER.flatMap((bucket) =>
    [
      ...day.habitsByBucket[bucket].map((item) => ({ itemType: 'habit' as const, item })),
      ...day.tasksByBucket[bucket].map((item) => ({ itemType: 'task' as const, item })),
    ].sort(byStart)
  );
}

/**
 * Which open row takes the hero.
 *
 * The precedence IS the design: something happening right now beats an
 * unscheduled item, which beats the next thing on the clock. Anything still
 * open after those is a block whose hour has passed — 'missed' — and it stays
 * in the room rather than being quietly dropped.
 *
 * There is deliberately NO stored pointer. Completing the hero removes it from
 * `openRows` and the next row wins this same test, so there is no cursor that
 * can fall out of step with the data — which is also what makes the room
 * correct after an edit made anywhere else in the app.
 *
 * `nowMin` is null only before hydration (lib/use-now-minutes.ts); with no
 * clock the "now" arm cannot be judged and is skipped rather than guessed.
 */
export function pickHero(openRows: readonly ZenRow[], nowMin: number | null): ZenHero | null {
  const timed = openRows.filter((r) => r.item.startTime);

  if (nowMin !== null) {
    const current = timed.find((r) => {
      const start = minutesOf(r.item.startTime!);
      // `blockMinutes`, never the raw field: an item with no duration is a
      // half-hour block on the grid, not an instant. The floor of 1 remains for
      // a type whose configured default really is zero, so "now" can still land
      // on it rather than stepping over it in the tick it starts.
      const end = start + Math.max(blockMinutes(r), 1);
      return nowMin >= start && nowMin < end;
    });
    if (current) return { row: current, kind: 'now' };
  }

  // Unscheduled: no clock at all, so it can be picked up whenever. Reached
  // before the next block because `zenRows` puts the anytime bucket first.
  const anytime = openRows.find((r) => !r.item.startTime);
  if (anytime) return { row: anytime, kind: 'anytime' };

  const next = timed.find((r) => minutesOf(r.item.startTime!) > (nowMin ?? -1));
  if (next) return { row: next, kind: 'next' };

  if (openRows.length > 0) return { row: openRows[0], kind: 'missed' };
  return null;
}

/** The words above the hero. */
export function heroKicker(hero: ZenHero | null): string {
  if (!hero) return 'Clear';
  switch (hero.kind) {
    case 'now':
      return 'Now';
    case 'anytime':
      return 'Anytime';
    case 'next':
      return `Next · ${clockOf(minutesOf(hero.row.item.startTime!))}`;
    case 'missed':
      return 'Unfinished';
  }
}

/**
 * The hero's time line: 'anytime', a single clock, or a range.
 *
 * The end is computed in MINUTES and formatted once, rather than by building an
 * 'HH:mm' string and re-parsing it — a 90-minute block starting at 23:00 would
 * otherwise have to spell an hour of 24.
 */
export function heroTimeLabel(row: ZenRow): string {
  const start = row.item.startTime;
  if (!start) return 'anytime';
  const startMin = minutesOf(start);
  const duration = blockMinutes(row);
  return duration > 0
    ? `${clockOf(startMin)} – ${clockOf(startMin + duration)}`
    : clockOf(startMin);
}

/** Progress through the hero's block, 0–100, or null when it has no extent. */
export function elapsedPct(hero: ZenHero | null, nowMin: number | null): number | null {
  if (!hero || hero.kind !== 'now' || nowMin === null) return null;
  const start = hero.row.item.startTime;
  if (!start) return null;
  const duration = blockMinutes(hero.row);
  if (duration <= 0) return null;
  return Math.min(100, Math.max(0, ((nowMin - minutesOf(start)) / duration) * 100));
}

/** Minutes left in the hero's block, or null when it has no extent. */
export function remainingMins(hero: ZenHero | null, nowMin: number | null): number | null {
  if (!hero || hero.kind !== 'now' || nowMin === null) return null;
  const start = hero.row.item.startTime;
  if (!start) return null;
  const duration = blockMinutes(hero.row);
  if (duration <= 0) return null;
  return Math.max(0, minutesOf(start) + duration - nowMin);
}
