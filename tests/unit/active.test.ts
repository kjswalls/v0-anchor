import { describe, it, expect } from 'vitest';
import {
  isPausedOn,
  isItemActiveOn,
  isOpenLoopOn,
  isOpenLoopSuppressedOn,
  inactiveItemIdsOn,
  suppressionReason,
  type ActivationContext,
} from '@/lib/active';
import type { Item } from '@anchor-app/types';

const ctx: ActivationContext = { userTimezone: 'America/New_York' };

const task = (over: Partial<Item> = {}): Item => ({
  type: 'task', id: 't', title: 'T', status: 'pending', isScheduled: false, order: 0,
  ...over,
} as Item);

const habit = (over: Partial<Item> = {}): Item => ({
  type: 'habit', id: 'h', title: 'H', group: 'G', streak: 0, status: 'pending',
  completedDates: [], skippedDates: [], dailyCounts: {}, repeatFrequency: 'daily',
  ...over,
} as Item);

// Noon UTC on Aug 10 is still Aug 10 in New York (08:00 EDT) — keeps the
// fixtures free of accidental timezone-boundary meaning.
const AUG10 = '2026-08-10T12:00:00Z';

describe('isPausedOn — interval bounds', () => {
  it('is false with no pausedAt', () => {
    expect(isPausedOn({}, '2026-08-15', ctx.userTimezone)).toBe(false);
    expect(isPausedOn({ pausedUntil: '2026-09-01' }, '2026-08-15', ctx.userTimezone)).toBe(false);
  });

  it('is true from the pause date onward when open-ended', () => {
    const p = { pausedAt: AUG10 };
    expect(isPausedOn(p, '2026-08-10', ctx.userTimezone)).toBe(true);
    expect(isPausedOn(p, '2027-01-01', ctx.userTimezone)).toBe(true);
  });

  // The lower bound is the whole reason pausedAt is stored. Without it, pausing
  // a daily habit today would blank every unmarked day of its history.
  it('does NOT reach back before the pause began', () => {
    const p = { pausedAt: AUG10 };
    expect(isPausedOn(p, '2026-08-09', ctx.userTimezone)).toBe(false);
    expect(isPausedOn(p, '2026-07-01', ctx.userTimezone)).toBe(false);
  });

  it('treats pausedUntil as EXCLUSIVE — live again on that date', () => {
    const p = { pausedAt: AUG10, pausedUntil: '2026-09-01' };
    expect(isPausedOn(p, '2026-08-31', ctx.userTimezone)).toBe(true);
    expect(isPausedOn(p, '2026-09-01', ctx.userTimezone)).toBe(false);
    expect(isPausedOn(p, '2026-09-02', ctx.userTimezone)).toBe(false);
  });

  // An expired pause must keep reading as "was paused during [start, until)",
  // with no cron and no cleanup write — that history is what the auto-age
  // sweep's resume grace reads.
  it('an expired interval still answers correctly for dates inside it', () => {
    const p = { pausedAt: AUG10, pausedUntil: '2026-08-20' };
    expect(isPausedOn(p, '2026-08-15', ctx.userTimezone)).toBe(true);
    expect(isPausedOn(p, '2026-08-25', ctx.userTimezone)).toBe(false);
  });

  it('a manual resume (pausedUntil = today) ends the pause today', () => {
    const p = { pausedAt: AUG10, pausedUntil: '2026-08-14' };
    expect(isPausedOn(p, '2026-08-13', ctx.userTimezone)).toBe(true);
    expect(isPausedOn(p, '2026-08-14', ctx.userTimezone)).toBe(false);
  });

  it('resolves the pause start in the USER timezone, not the runtime one', () => {
    // 01:00 UTC Aug 11 is still Aug 10 in New York, so Aug 10 is inside.
    const p = { pausedAt: '2026-08-11T01:00:00Z' };
    expect(isPausedOn(p, '2026-08-10', ctx.userTimezone)).toBe(true);
    expect(isPausedOn(p, '2026-08-10', 'Europe/Berlin')).toBe(false); // there it's the 11th
  });

  it('fails OPEN on a junk timestamp — never silently swallows an item', () => {
    expect(isPausedOn({ pausedAt: 'not-a-date' }, '2026-08-15', ctx.userTimezone)).toBe(false);
  });

  it('tolerates a full-ISO date string for the queried day', () => {
    const p = { pausedAt: AUG10, pausedUntil: '2026-09-01' };
    expect(isPausedOn(p, '2026-08-15T00:00:00.000Z', ctx.userTimezone)).toBe(true);
  });
});

describe('isOpenLoopOn — what still wants doing', () => {
  it('a recurring item with no mark is open', () => {
    expect(isOpenLoopOn(habit(), '2026-08-15')).toBe(true);
  });

  it('any mark closes the day: completed, skipped, or a tally', () => {
    expect(isOpenLoopOn(habit({ completedDates: ['2026-08-15'] }), '2026-08-15')).toBe(false);
    expect(isOpenLoopOn(habit({ skippedDates: ['2026-08-15'] }), '2026-08-15')).toBe(false);
    expect(isOpenLoopOn(habit({ dailyCounts: { '2026-08-15': 1 } }), '2026-08-15')).toBe(false);
  });

  it('a mark on another day leaves today open', () => {
    expect(isOpenLoopOn(habit({ completedDates: ['2026-08-14'] }), '2026-08-15')).toBe(true);
  });

  it('a zero tally is not a mark', () => {
    expect(isOpenLoopOn(habit({ dailyCounts: { '2026-08-15': 0 } }), '2026-08-15')).toBe(true);
  });

  it('a one-shot task is open only while pending', () => {
    expect(isOpenLoopOn(task({ status: 'pending' }), '2026-08-15')).toBe(true);
    expect(isOpenLoopOn(task({ status: 'completed' }), '2026-08-15')).toBe(false);
    // Cancelled is terminal too — same reasoning selectOverdue uses.
    expect(isOpenLoopOn(task({ status: 'cancelled' }), '2026-08-15')).toBe(false);
  });

  it('a recurring TASK uses the per-date rule, not scalar status', () => {
    const t = task({ repeatFrequency: 'daily', status: 'pending', completedDates: ['2026-08-15'] });
    expect(isOpenLoopOn(t, '2026-08-15')).toBe(false);
    expect(isOpenLoopOn(t, '2026-08-16')).toBe(true);
  });
});

describe('isOpenLoopSuppressedOn — hide open loops, never history', () => {
  it('hides an unmarked occurrence inside the pause', () => {
    expect(isOpenLoopSuppressedOn(habit({ pausedAt: AUG10 }), '2026-08-15', ctx)).toBe(true);
  });

  // The worked example from locked decision 4: did it at 8am, paused at noon.
  it('KEEPS a day that was already marked', () => {
    const h = habit({ pausedAt: AUG10, completedDates: ['2026-08-15'] });
    expect(isOpenLoopSuppressedOn(h, '2026-08-15', ctx)).toBe(false);
  });

  it('keeps a skipped day too', () => {
    const h = habit({ pausedAt: AUG10, skippedDates: ['2026-08-15'] });
    expect(isOpenLoopSuppressedOn(h, '2026-08-15', ctx)).toBe(false);
  });

  it('never hides history from before the pause', () => {
    const h = habit({ pausedAt: AUG10 });
    expect(isOpenLoopSuppressedOn(h, '2026-08-01', ctx)).toBe(false);
  });

  it('stops hiding once the resume date arrives', () => {
    const h = habit({ pausedAt: AUG10, pausedUntil: '2026-09-01' });
    expect(isOpenLoopSuppressedOn(h, '2026-08-31', ctx)).toBe(true);
    expect(isOpenLoopSuppressedOn(h, '2026-09-01', ctx)).toBe(false);
  });

  it('keeps a completed one-off visible while paused', () => {
    const t = task({ pausedAt: AUG10, status: 'completed' });
    expect(isOpenLoopSuppressedOn(t, '2026-08-15', ctx)).toBe(false);
  });

  it('an unpaused item is never suppressed', () => {
    expect(isOpenLoopSuppressedOn(habit(), '2026-08-15', ctx)).toBe(false);
    expect(isOpenLoopSuppressedOn(task(), '2026-08-15', ctx)).toBe(false);
  });
});

describe('isItemActiveOn', () => {
  it('is liveness, NOT visibility — a marked-but-paused item is still inactive', () => {
    const h = habit({ pausedAt: AUG10, completedDates: ['2026-08-15'] });
    expect(isItemActiveOn(h, '2026-08-15', ctx)).toBe(false);
    expect(isOpenLoopSuppressedOn(h, '2026-08-15', ctx)).toBe(false);
  });

  it('an item with no pause state is active (today\'s behavior, unchanged)', () => {
    expect(isItemActiveOn(task(), '2026-08-15', ctx)).toBe(true);
  });
});

describe('inactiveItemIdsOn', () => {
  it('collects exactly the suppressed open loops', () => {
    const items = [
      task({ id: 'live' }),
      task({ id: 'paused', pausedAt: AUG10 }),
      habit({ id: 'paused-but-done', pausedAt: AUG10, completedDates: ['2026-08-15'] }),
      task({ id: 'resumed', pausedAt: AUG10, pausedUntil: '2026-08-12' }),
    ];
    expect(inactiveItemIdsOn(items, '2026-08-15', ctx)).toEqual(new Set(['paused']));
  });

  it('is date-parameterized — the same items answer differently per day', () => {
    const items = [habit({ id: 'h', pausedAt: AUG10, pausedUntil: '2026-09-01' })];
    expect(inactiveItemIdsOn(items, '2026-08-09', ctx).size).toBe(0); // before
    expect(inactiveItemIdsOn(items, '2026-08-15', ctx).size).toBe(1); // during
    expect(inactiveItemIdsOn(items, '2026-09-02', ctx).size).toBe(0); // after
  });

  it('is empty for a store with no paused items', () => {
    expect(inactiveItemIdsOn([task(), habit()], '2026-08-15', ctx).size).toBe(0);
  });
});

describe('suppressionReason', () => {
  it('is null when live, so !reason is the liveness check', () => {
    expect(suppressionReason(task(), '2026-08-15', ctx)).toBeNull();
  });

  it('reports the resume date when there is one', () => {
    const t = task({ pausedAt: AUG10, pausedUntil: '2026-09-01' });
    expect(suppressionReason(t, '2026-08-15', ctx)).toEqual({ kind: 'paused', until: '2026-09-01' });
  });

  it('reports an open-ended pause', () => {
    expect(suppressionReason(task({ pausedAt: AUG10 }), '2026-08-15', ctx))
      .toEqual({ kind: 'paused', until: undefined });
  });

  // Deliberately reports on marked days too: the item panel must explain why an
  // item is inactive even when today's row happens to still be rendering.
  it('reports for a paused item even on a day it still renders', () => {
    const h = habit({ pausedAt: AUG10, completedDates: ['2026-08-15'] });
    expect(suppressionReason(h, '2026-08-15', ctx)).not.toBeNull();
  });
});
