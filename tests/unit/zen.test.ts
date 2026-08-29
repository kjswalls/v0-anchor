import { describe, it, expect, vi } from 'vitest';
import {
  clockOf,
  elapsedPct,
  formatRemaining,
  heroKicker,
  heroTimeLabel,
  minutesOf,
  pickHero,
  remainingMins,
  multiCount,
  blockMinutes,
  zenRows,
  type ZenRow,
} from '@/lib/zen';
import {
  isRowDone,
  isRowSkipped,
  toggleHabitDone,
  toggleRowDone,
  toggleTaskDone,
  type ItemToggleActions,
} from '@/lib/item-toggle';
import type { DayItems } from '@/lib/day-items';
import type { HabitItem, Task, TimeBucket } from '@/lib/planner-types';

const DATE_STR = '2026-08-28';

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t${++seq}`,
    title: 'task',
    status: 'pending',
    isScheduled: true,
    order: 0,
    ...overrides,
  } as Task;
}

function habit(overrides: Partial<HabitItem> = {}): HabitItem {
  return {
    id: `h${++seq}`,
    title: 'habit',
    status: 'pending',
    streak: 0,
    completedDates: [],
    repeatFrequency: 'daily',
    ...overrides,
  } as HabitItem;
}

/** A DayItems with the given rows dropped into the named buckets. */
function day(
  buckets: Partial<Record<TimeBucket, { tasks?: Task[]; habits?: HabitItem[] }>>
): DayItems {
  const empty = <T>() => ({ anytime: [] as T[], morning: [] as T[], afternoon: [] as T[], evening: [] as T[] });
  const tasksByBucket = empty<Task>();
  const habitsByBucket = empty<HabitItem>();
  for (const [bucket, contents] of Object.entries(buckets)) {
    tasksByBucket[bucket as TimeBucket] = contents?.tasks ?? [];
    habitsByBucket[bucket as TimeBucket] = contents?.habits ?? [];
  }
  return { tasksByBucket, habitsByBucket, recurringProjects: [], totalCount: 0 };
}

const taskRow = (t: Task): ZenRow => ({ itemType: 'task', item: t });

describe('zenRows — the day as one list', () => {
  it('puts anytime rows ahead of the scheduled hours, like the schedule view', () => {
    const loose = task({ title: 'book flights' });
    const morning = task({ title: 'standup', startTime: '09:30' });
    const evening = task({ title: 'dinner', startTime: '19:00' });

    const rows = zenRows(
      day({ morning: { tasks: [morning] }, evening: { tasks: [evening] }, anytime: { tasks: [loose] } })
    );

    expect(rows.map((r) => r.item.title)).toEqual(['book flights', 'standup', 'dinner']);
  });

  it('interleaves habits and tasks by time instead of clustering habits', () => {
    // The whole point of "a habit is an item like any other" in this room: a
    // 17:00 habit belongs BETWEEN the 15:30 and 19:00 tasks, not above them.
    const gym = habit({ title: 'gym', startTime: '17:00' });
    const dana = task({ title: 'reply to Dana', startTime: '15:30' });
    const dinner = task({ title: 'dinner', startTime: '19:00' });

    const rows = zenRows(day({ afternoon: { tasks: [dana, dinner], habits: [gym] } }));

    expect(rows.map((r) => r.item.title)).toEqual(['reply to Dana', 'gym', 'dinner']);
  });

  it('keeps timed rows ahead of untimed ones within a bucket, habits first on a tie', () => {
    const untimedHabit = habit({ title: 'journal' });
    const untimedTask = task({ title: 'tidy' });
    const timed = task({ title: 'call', startTime: '14:00' });

    const rows = zenRows(day({ afternoon: { tasks: [untimedTask, timed], habits: [untimedHabit] } }));

    expect(rows.map((r) => r.item.title)).toEqual(['call', 'journal', 'tidy']);
  });
});

describe('pickHero — what the room puts in front of you', () => {
  const inProgress = task({ title: 'draft the doc', startTime: '13:30', duration: 90 });
  const loose = task({ title: 'book flights' });
  const later = task({ title: 'dinner', startTime: '19:00' });

  it('prefers the block happening right now over everything else', () => {
    const rows = [taskRow(loose), taskRow(inProgress), taskRow(later)];
    // 14:14 — inside 13:30 + 90m.
    expect(pickHero(rows, 14 * 60 + 14)).toEqual({ row: rows[1], kind: 'now' });
  });

  it('falls to the first unscheduled item when nothing is in progress', () => {
    const rows = [taskRow(loose), taskRow(later)];
    const hero = pickHero(rows, 15 * 60);
    expect(hero).toEqual({ row: rows[0], kind: 'anytime' });
  });

  it('offers the next block only once the unscheduled ones are gone', () => {
    const rows = [taskRow(later)];
    expect(pickHero(rows, 15 * 60)).toEqual({ row: rows[0], kind: 'next' });
  });

  it('still surfaces a block whose hour has passed rather than dropping it', () => {
    const missed = task({ title: 'the 9am', startTime: '09:00', duration: 30 });
    const rows = [taskRow(missed)];
    expect(pickHero(rows, 15 * 60)).toEqual({ row: rows[0], kind: 'missed' });
  });

  it('is null on an empty day — the room says so rather than picking nothing', () => {
    expect(pickHero([], 12 * 60)).toBeNull();
    expect(heroKicker(null)).toBe('Clear');
  });

  it('skips the "now" arm entirely before the clock has hydrated', () => {
    // useNowMinutes is null on the server and through hydration. With no clock
    // the in-progress test cannot be judged, so it must not be guessed.
    const rows = [taskRow(inProgress), taskRow(loose)];
    expect(pickHero(rows, null)).toEqual({ row: rows[1], kind: 'anytime' });
  });

  it('holds a timed block with no explicit duration for its type default', () => {
    // Not an instant: the grid draws it as a real block, so the room must too,
    // or the hero would drop it seconds after it began.
    const standup = task({ title: 'standup', startTime: '09:00' });
    const rows = [taskRow(standup)];
    const span = blockMinutes(rows[0]);
    expect(pickHero(rows, 8 * 60 + 59)).toEqual({ row: rows[0], kind: 'next' });
    expect(pickHero(rows, 9 * 60)).toEqual({ row: rows[0], kind: 'now' });
    expect(pickHero(rows, 9 * 60 + span - 1)).toEqual({ row: rows[0], kind: 'now' });
    // Once it is genuinely over it is 'missed', not 'next' — still in the room,
    // just no longer pretending it is upcoming.
    expect(pickHero(rows, 9 * 60 + span)).toEqual({ row: rows[0], kind: 'missed' });
  });

  it('treats the end of a block as exclusive, so back-to-back blocks never both win', () => {
    const first = task({ title: 'first', startTime: '13:00', duration: 60 });
    const second = task({ title: 'second', startTime: '14:00', duration: 60 });
    const rows = [taskRow(first), taskRow(second)];
    expect(pickHero(rows, 14 * 60)).toEqual({ row: rows[1], kind: 'now' });
  });
});

describe('the hero labels', () => {
  it('names the hour on a next block', () => {
    const hero = pickHero([taskRow(task({ startTime: '15:30' }))], 12 * 60);
    expect(heroKicker(hero)).toBe('Next · 3:30');
  });

  it('reads a range for a timed block and says "anytime" for an unscheduled one', () => {
    expect(heroTimeLabel(taskRow(task({ startTime: '13:30', duration: 90 })))).toBe('1:30 – 3:00');
    // No explicit duration still reads as a range, because the item occupies its
    // type's default block everywhere else in the app.
    const row = taskRow(task({ startTime: '13:30' }));
    expect(heroTimeLabel(row)).toBe(`1:30 – ${clockOf(13 * 60 + 30 + blockMinutes(row))}`);
    expect(heroTimeLabel(taskRow(task({})))).toBe('anytime');
  });

  it('does not spell an hour of 24 when a block runs past midnight', () => {
    // Computed in minutes and formatted once — building 'HH:mm' and re-parsing
    // it would produce "24:30" here.
    expect(heroTimeLabel(taskRow(task({ startTime: '23:00', duration: 90 })))).toBe('11:00 – 12:30');
  });

  it('formats midnight and noon as 12, not 0', () => {
    expect(clockOf(0)).toBe('12:00');
    expect(clockOf(12 * 60)).toBe('12:00');
    expect(minutesOf('00:00')).toBe(0);
  });
});

describe('the rail', () => {
  const hero = pickHero([taskRow(task({ startTime: '13:30', duration: 90 }))], 14 * 60 + 14)!;

  it('reports progress and what is left of the current block', () => {
    expect(Math.round(elapsedPct(hero, 14 * 60 + 14)!)).toBe(49);
    expect(remainingMins(hero, 14 * 60 + 14)).toBe(46);
    expect(formatRemaining(46)).toBe('46m left');
    expect(formatRemaining(60)).toBe('1h left');
    expect(formatRemaining(72)).toBe('1h 12m left');
  });

  it('has no rail at all for a hero with no extent', () => {
    const anytime = pickHero([taskRow(task({}))], 12 * 60);
    expect(elapsedPct(anytime, 12 * 60)).toBeNull();
    expect(remainingMins(anytime, 12 * 60)).toBeNull();
  });

  it('clamps rather than overflowing once a block has run over', () => {
    expect(elapsedPct(hero, 20 * 60)).toBe(100);
    expect(remainingMins(hero, 20 * 60)).toBe(0);
  });
});

/**
 * The extraction guard.
 *
 * lib/item-toggle.ts was lifted verbatim out of task-row.tsx so Zen and the
 * planner's own rows could not drift apart. These pin each arm of it — most of
 * all the multi-count un-tick, which is the one place the OBVIOUS behaviour
 * (step down by one) is the wrong one: task-row's own comment has said since it
 * was written that unchecking a box means "I didn't do this", so it clears the
 * day, and that stepping down is what the trailing `−` control is for. A patch
 * that "fixes" this to `count - 1` looks reasonable and is a regression.
 */
describe('toggle semantics, extracted from task-row', () => {
  const on = { date: new Date(`${DATE_STR}T12:00:00Z`), dateStr: DATE_STR };
  const actions = (): ItemToggleActions => ({
    toggleTaskStatus: vi.fn(),
    toggleHabitStatus: vi.fn(),
  });

  it('passes a date for a RECURRING task and withholds one for a one-off', () => {
    const a = actions();
    toggleTaskDone(task({ repeatFrequency: 'daily' }) as never, on, a);
    expect(a.toggleTaskStatus).toHaveBeenCalledWith(expect.any(String), undefined, on.date);

    const b = actions();
    toggleTaskDone(task({}) as never, on, b);
    // A one-off has no per-date dimension; handing the store a date it would
    // resolve and then ignore is what this `undefined` prevents.
    expect(b.toggleTaskStatus).toHaveBeenCalledWith(expect.any(String), undefined, undefined);
  });

  it('flips a binary habit both ways', () => {
    const a = actions();
    const fresh = habit({});
    toggleHabitDone(fresh, on, a);
    expect(a.toggleHabitStatus).toHaveBeenCalledWith(fresh.id, 'done', undefined, on.date);

    const b = actions();
    const done = habit({ completedDates: [DATE_STR] });
    toggleHabitDone(done, on, b);
    expect(b.toggleHabitStatus).toHaveBeenCalledWith(done.id, 'pending', undefined, on.date);
  });

  it('takes a SKIPPED habit back to pending rather than jumping it to done', () => {
    const a = actions();
    const skipped = habit({ skippedDates: [DATE_STR] });
    toggleHabitDone(skipped, on, a);
    expect(a.toggleHabitStatus).toHaveBeenCalledWith(skipped.id, 'pending', undefined, on.date);
  });

  it('counts a multi-count habit up, and marks it done on reaching target', () => {
    const a = actions();
    const oneOfThree = habit({ timesPerDay: 3, dailyCounts: { [DATE_STR]: 1 } });
    toggleHabitDone(oneOfThree, on, a);
    expect(a.toggleHabitStatus).toHaveBeenCalledWith(oneOfThree.id, 'pending', 2, on.date);

    const b = actions();
    const twoOfThree = habit({ timesPerDay: 3, dailyCounts: { [DATE_STR]: 2 } });
    toggleHabitDone(twoOfThree, on, b);
    expect(b.toggleHabitStatus).toHaveBeenCalledWith(twoOfThree.id, 'done', 3, on.date);
  });

  it('CLEARS the day when un-ticking a finished multi-count habit — never target-1', () => {
    const a = actions();
    const full = habit({
      timesPerDay: 3,
      completedDates: [DATE_STR],
      dailyCounts: { [DATE_STR]: 3 },
    });
    toggleHabitDone(full, on, a);
    expect(a.toggleHabitStatus).toHaveBeenCalledWith(full.id, 'pending', 0, on.date);
  });

  it('treats a habit marked done with no tally as a full day', () => {
    const a = actions();
    const noTally = habit({ timesPerDay: 3, completedDates: [DATE_STR] });
    toggleHabitDone(noTally, on, a);
    expect(a.toggleHabitStatus).toHaveBeenCalledWith(noTally.id, 'pending', 0, on.date);
  });
});

describe('isRowDone — the read side of a tick', () => {
  it('reads a habit per-date, never off its scalar status', () => {
    const done = habit({ completedDates: [DATE_STR] });
    expect(isRowDone({ itemType: 'habit', item: done }, DATE_STR)).toBe(true);
    expect(isRowDone({ itemType: 'habit', item: done }, '2026-08-27')).toBe(false);
  });

  it('reads a RECURRING task per-date and a one-off off its status', () => {
    const recurring = task({ repeatFrequency: 'daily', completedDates: [DATE_STR] });
    expect(isRowDone(taskRow(recurring), DATE_STR)).toBe(true);
    expect(isRowDone(taskRow(recurring), '2026-08-27')).toBe(false);

    expect(isRowDone(taskRow(task({ status: 'completed' })), DATE_STR)).toBe(true);
    expect(isRowDone(taskRow(task({ status: 'pending' })), DATE_STR)).toBe(false);
  });
});

describe('a skipped occurrence is answered, not open', () => {
  const on = { date: new Date(`${DATE_STR}T12:00:00Z`), dateStr: DATE_STR };

  it('reads as skipped, and NOT as done', () => {
    const row = taskRow(task({ repeatFrequency: 'daily', skippedDates: [DATE_STR] }));
    expect(isRowSkipped(row, DATE_STR)).toBe(true);
    expect(isRowDone(row, DATE_STR)).toBe(false);
    expect(isRowSkipped(row, '2026-08-27')).toBe(false);
  });

  it('refuses the tick outright, for a task and for a habit', () => {
    // A skipped recurring TASK would otherwise end up skipped AND completed on
    // the same date — a pair the rest of the app treats as impossible.
    const a: ItemToggleActions = { toggleTaskStatus: vi.fn(), toggleHabitStatus: vi.fn() };
    toggleRowDone(taskRow(task({ repeatFrequency: 'daily', skippedDates: [DATE_STR] })), on, a);
    expect(a.toggleTaskStatus).not.toHaveBeenCalled();

    // A skipped HABIT is the expensive one: the tick would resolve to 'pending',
    // silently clearing the skip and turning a deliberately-answered occurrence
    // back into an open loop the nightly settlement charges as a miss.
    const b: ItemToggleActions = { toggleTaskStatus: vi.fn(), toggleHabitStatus: vi.fn() };
    toggleRowDone(
      { itemType: 'habit', item: habit({ skippedDates: [DATE_STR] }) },
      on,
      b
    );
    expect(b.toggleHabitStatus).not.toHaveBeenCalled();
  });
});

describe('blockMinutes — an untimed block is not an instant', () => {
  it('reads the item\'s own duration when it has one', () => {
    expect(blockMinutes(taskRow(task({ duration: 90 })))).toBe(90);
  });

  it('falls back to the type default, not to zero', () => {
    // The grid draws a timed item with no duration as a real block
    // (defaultBlockMinutes). Reading the raw field would make it a 1-minute
    // flicker in the room and refuse to draw the rail at all.
    const fallback = blockMinutes(taskRow(task({ startTime: '09:00' })));
    expect(fallback).toBeGreaterThan(1);
    const hero = pickHero([taskRow(task({ startTime: '09:00' }))], 9 * 60 + 5);
    expect(hero?.kind).toBe('now');
  });
});

describe('multiCount — so partial ticks are not dead clicks', () => {
  it('is null for tasks and for ordinary one-a-day habits', () => {
    expect(multiCount(taskRow(task({})), DATE_STR)).toBeNull();
    expect(multiCount({ itemType: 'habit', item: habit({}) }, DATE_STR)).toBeNull();
    expect(
      multiCount({ itemType: 'habit', item: habit({ timesPerDay: 1 }) }, DATE_STR)
    ).toBeNull();
  });

  it('reports the running tally and its percentage', () => {
    const row = {
      itemType: 'habit' as const,
      item: habit({ timesPerDay: 4, dailyCounts: { [DATE_STR]: 1 } }),
    };
    expect(multiCount(row, DATE_STR)).toEqual({ count: 1, target: 4, pct: 25 });
  });

  it('counts a habit marked done with no tally as a full day', () => {
    const row = {
      itemType: 'habit' as const,
      item: habit({ timesPerDay: 3, completedDates: [DATE_STR] }),
    };
    expect(multiCount(row, DATE_STR)).toEqual({ count: 3, target: 3, pct: 100 });
  });
});
