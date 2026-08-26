import { describe, it, expect } from 'vitest';
import { format, subDays, addDays } from 'date-fns';
import {
  buildChatOpeners,
  BUSY_DAY_THRESHOLD,
  MAX_OPENERS,
  type OpenerContext,
} from '@/lib/ai-openers';
import type { Item } from '@/lib/planner-types';

/**
 * Openers replace a blank input, so the thing worth pinning is that they stay
 * RELEVANT — a static list would need no tests. Two rules carry the weight:
 * an opener may never be offered when its condition is false ("what can I let
 * go of?" on a clear week is noise), and the reflective one must survive every
 * state, because a brand new account has nothing else to offer.
 */

const TODAY = '2026-08-26';
const tz = 'UTC';

function task(id: string, startDate?: string, status: 'pending' | 'completed' = 'pending'): Item {
  return {
    type: 'task',
    id,
    title: id,
    status,
    isScheduled: false,
    order: 0,
    completedDates: [],
    ...(startDate ? { startDate } : {}),
  } as Item;
}

const ctx = (items: Item[]): OpenerContext => ({
  items,
  todayStr: TODAY,
  userTimezone: tz,
});

const ids = (items: Item[]) => buildChatOpeners(ctx(items)).map((o) => o.id);

describe('buildChatOpeners', () => {
  it('always ends with the reflective opener, even with an empty planner', () => {
    const openers = buildChatOpeners(ctx([]));
    expect(openers.at(-1)?.id).toBe('reflect');
    expect(openers.length).toBeGreaterThan(0);
  });

  it('offers to plan the day when nothing is scheduled for it', () => {
    expect(ids([task('a', addDays(new Date(TODAY), 3).toISOString().slice(0, 10))])).toContain(
      'plan'
    );
  });

  it('does not offer to plan a day that already has work on it', () => {
    expect(ids([task('a', TODAY)])).not.toContain('plan');
  });

  it('offers triage once today crosses the busy threshold', () => {
    const full = Array.from({ length: BUSY_DAY_THRESHOLD }, (_, i) => task(`t${i}`, TODAY));
    expect(ids(full)).toContain('triage');
    expect(ids(full.slice(0, BUSY_DAY_THRESHOLD - 1))).not.toContain('triage');
  });

  it('never offers triage and plan together — they contradict each other', () => {
    const full = Array.from({ length: BUSY_DAY_THRESHOLD + 4 }, (_, i) => task(`t${i}`, TODAY));
    const got = ids(full);
    expect(got).toContain('triage');
    expect(got).not.toContain('plan');
  });

  it('offers "what can I let go of" only when something is actually past due', () => {
    const past = format(subDays(new Date(TODAY), 5), 'yyyy-MM-dd');
    expect(ids([task('old', past)])).toContain('let-go');
    expect(ids([task('now', TODAY)])).not.toContain('let-go');
  });

  it('ignores completed work when deciding whether the day is clear', () => {
    // A day of finished tasks is a clear day, not a busy one — the opener has
    // to read open loops, not row counts.
    const done = Array.from({ length: BUSY_DAY_THRESHOLD + 2 }, (_, i) =>
      task(`d${i}`, TODAY, 'completed')
    );
    const got = ids(done);
    expect(got).toContain('plan');
    expect(got).not.toContain('triage');
  });

  it('treats work a routine paused as neither due today nor past due', () => {
    const past = format(subDays(new Date(TODAY), 5), 'yyyy-MM-dd');
    const items = [task('paused', past)];
    const got = buildChatOpeners({ ...ctx(items), inactiveIds: new Set(['paused']) }).map(
      (o) => o.id
    );
    // Suppressed work is set aside on purpose. Offering to triage it is the app
    // arguing with a decision the user already made (lib/active.ts).
    expect(got).not.toContain('let-go');
    expect(got).toContain('plan');
  });

  it('never returns more than MAX_OPENERS', () => {
    const past = format(subDays(new Date(TODAY), 9), 'yyyy-MM-dd');
    const items = [
      ...Array.from({ length: BUSY_DAY_THRESHOLD + 1 }, (_, i) => task(`t${i}`, TODAY)),
      task('old-1', past),
      task('old-2', past),
    ];
    expect(buildChatOpeners(ctx(items))).toHaveLength(MAX_OPENERS);
  });

  it('gives every opener a distinct id and a non-empty prompt', () => {
    const past = format(subDays(new Date(TODAY), 5), 'yyyy-MM-dd');
    const openers = buildChatOpeners(ctx([task('old', past)]));
    expect(new Set(openers.map((o) => o.id)).size).toBe(openers.length);
    for (const o of openers) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.prompt.length).toBeGreaterThan(o.label.length - 1);
    }
  });

  it('keeps the copy contract — no opener names a failure or counts a miss', () => {
    // memory/plans/ai-vision.md: the whole point of the surface is that it does
    // not manufacture guilt. A regression here is a product regression.
    const past = format(subDays(new Date(TODAY), 30), 'yyyy-MM-dd');
    const busy = Array.from({ length: BUSY_DAY_THRESHOLD, }, (_, i) => task(`t${i}`, TODAY));
    const everything = [...busy, task('old', past)];

    const forbidden = /overdue|late|behind|missed|failed|should have|neglect/i;
    for (const items of [[], [task('a', TODAY)], [task('old', past)], everything]) {
      for (const o of buildChatOpeners(ctx(items))) {
        expect(o.label).not.toMatch(forbidden);
        expect(o.prompt).not.toMatch(forbidden);
      }
    }
  });
});
