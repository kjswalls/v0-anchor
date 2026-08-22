import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Absolute completedDates/skippedDates bodies are reconciled into per-date
 * intents (migrations 020 + 029).
 *
 * WHY THIS IS A CORRECTNESS TEST AND NOT A PERFORMANCE ONE. Both arrays used to
 * be written whole through the update allowlist, which makes the WRITER's copy
 * the new server truth. That is only safe while every writer holds the complete
 * history, and the OpenClaw plugin does not: its update_task sends "the full set
 * of ISO date strings representing all completion dates", assembled by a model
 * from injected context rather than read from the row. Any date missing from
 * that set was silently, permanently deleted.
 *
 * It is also the precondition for windowing these arrays on read — a client
 * holding six months of a ten-year history is exactly the partial writer above.
 */

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const updated: Record<string, unknown>[] = [];

/** The row as the DATABASE has it — deliberately richer than any caller's copy. */
let storedCompleted: string[] = [];
let storedSkipped: string[] = [];
let rowMissing = false;

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      // recordItemEvent's best-effort trace insert (migration 023).
      insert: () => Promise.resolve({ error: null }),
      update: (payload: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          then: (resolve: (v: { error: null }) => unknown) => {
            updated.push(payload);
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      },
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: rowMissing
                ? null
                : { completed_dates: storedCompleted, skipped_dates: storedSkipped },
              error: null,
            }),
        };
        return chain;
      },
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ error: null });
    },
  }),
}));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));

import { updateItem } from '@/lib/db';
import {
  COMPLETION_READ_WINDOW_DAYS,
  COMPLETION_RETRACTION_WINDOW_DAYS,
  windowStart,
} from '@/lib/completion-window';

const datesFor = (fn: string, flag: string, value: boolean) =>
  rpcCalls
    .filter((c) => c.fn === fn && c.args[flag] === value)
    .map((c) => c.args.date_str)
    .sort();

beforeEach(() => {
  rpcCalls.length = 0;
  updated.length = 0;
  storedCompleted = [];
  storedSkipped = [];
  rowMissing = false;
});

describe('reconciling an absolute completedDates body', () => {
  it('emits one intent per changed date, in both directions', async () => {
    storedCompleted = ['2026-08-19', '2026-08-20'];

    await updateItem('item-1', 'task', { completedDates: ['2026-08-20', '2026-08-21'] });

    expect(datesFor('set_item_completion', 'completed', true)).toEqual(['2026-08-21']);
    expect(datesFor('set_item_completion', 'completed', false)).toEqual(['2026-08-19']);
  });

  it('retracts inside the window but NEVER outside it', async () => {
    // The pairing that makes migration 031 safe. A partial writer — the plugin,
    // or any client served a windowed slice — omits ancient dates because it was
    // never sent them, not because the user retracted them. Clearing those would
    // delete history no one can get back, so the retraction half of the diff is
    // bounded while the addition half is not.
    const inside = windowStart(COMPLETION_RETRACTION_WINDOW_DAYS - 10);
    const outside = windowStart(COMPLETION_RETRACTION_WINDOW_DAYS + 10);
    storedCompleted = [outside, inside];

    await updateItem('item-1', 'task', { completedDates: [] });

    expect(datesFor('set_item_completion', 'completed', false)).toEqual([inside]);
  });

  it('bounds skip retraction the same way', async () => {
    const outside = windowStart(COMPLETION_RETRACTION_WINDOW_DAYS + 10);
    storedSkipped = [outside];

    await updateItem('item-1', 'task', { skippedDates: [] });

    expect(rpcCalls).toEqual([]);
  });

  it('still ADDS a date older than the window', async () => {
    // Only retraction is bounded. Backfilling an old completion is an explicit
    // statement about that date, so it is honoured wherever it falls.
    const ancient = windowStart(COMPLETION_RETRACTION_WINDOW_DAYS + 500);
    storedCompleted = [];

    await updateItem('item-1', 'task', { completedDates: [ancient] });

    expect(datesFor('set_item_completion', 'completed', true)).toEqual([ancient]);
  });

  it('leaves streak to the caller, exactly as the absolute write did', async () => {
    // A whole-array write never moved streak. If the reconciled intents adjusted
    // it, streak would move by the size of the diff — so an agent body dropping a
    // year of dates would zero out a streak that no user action touched.
    storedCompleted = ['2026-08-19', '2026-08-20'];

    await updateItem('item-1', 'habit', { completedDates: ['2026-08-21'] });

    const completionCalls = rpcCalls.filter((c) => c.fn === 'set_item_completion');
    expect(completionCalls).toHaveLength(3);
    expect(completionCalls.every((c) => c.args.adjust_streak === false)).toBe(true);
  });

  it('never writes the array as a column', async () => {
    storedCompleted = ['2026-08-20'];
    await updateItem('item-1', 'task', { completedDates: ['2026-08-21'], title: 'renamed' });

    expect(updated).toEqual([{ title: 'renamed' }]);
    expect(updated.every((u) => !('completed_dates' in u) && !('skipped_dates' in u))).toBe(true);
  });

  it('reconciles skippedDates through its own RPC, leaving streak alone', async () => {
    storedSkipped = ['2026-08-19'];
    await updateItem('item-1', 'task', { skippedDates: ['2026-08-19', '2026-08-21'] });

    expect(datesFor('set_item_skip', 'skipped', true)).toEqual(['2026-08-21']);
    // set_item_completion owns the streak column; the skip RPC must not appear
    // in the same breath, or two RPCs have a claim on it (migration 020).
    expect(rpcCalls.some((c) => c.fn === 'set_item_completion')).toBe(false);
  });

  it('handles both arrays in one body', async () => {
    storedCompleted = ['2026-08-20'];
    storedSkipped = ['2026-08-19'];

    await updateItem('item-1', 'habit', {
      completedDates: ['2026-08-20', '2026-08-21'],
      skippedDates: [],
    });

    expect(datesFor('set_item_completion', 'completed', true)).toEqual(['2026-08-21']);
    expect(datesFor('set_item_skip', 'skipped', false)).toEqual(['2026-08-19']);
  });

  it('is idempotent: re-sending the stored state writes nothing', async () => {
    storedCompleted = ['2026-08-20'];
    storedSkipped = ['2026-08-19'];

    await updateItem('item-1', 'task', {
      completedDates: ['2026-08-20'],
      skippedDates: ['2026-08-19'],
    });

    expect(rpcCalls).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('does not fabricate intents when the row is gone', async () => {
    // Deleted, wrong type, or another tenant's id under RLS. Nothing to
    // reconcile against, and guessing would be worse than doing nothing.
    rowMissing = true;
    await updateItem('item-1', 'task', { completedDates: ['2026-08-21'] });

    expect(rpcCalls).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('still emits the webhook for a body that carried only dates', async () => {
    // The reconciled body is empty, which used to mean "no-op, return early".
    // Going silent here would drop tasks.updated for exactly the agent writes
    // this reconciliation exists to serve.
    const { notifyPlugins } = await import('@/lib/openclaw-registry');
    storedCompleted = [];

    await updateItem('item-1', 'task', { completedDates: ['2026-08-21'] }, 'user-1');

    expect(notifyPlugins).toHaveBeenCalledWith(
      'user-1',
      'tasks.updated',
      expect.objectContaining({ action: 'update', id: 'item-1' }),
    );
  });
});

describe('the two windows', () => {
  it('reads at least as deep as the deepest history surface', () => {
    // HEATMAP_WEEKS is 26 in components/planner/item-detail-sections.tsx, and it
    // aligns to a week start before counting back, so it can reach ~189 days. A
    // read window under that would blank out the right-hand end of the heatmap
    // for every long-standing habit.
    expect(COMPLETION_READ_WINDOW_DAYS).toBeGreaterThan(26 * 7 + 7);
  });

  it('never retracts a narrower range than it serves', () => {
    // If retraction were the tighter of the two, a client would be handed dates
    // it is then not allowed to retract — its own edits would silently no-op as
    // the fetch aged. The gap is what absorbs client staleness.
    expect(COMPLETION_RETRACTION_WINDOW_DAYS).toBeGreaterThanOrEqual(COMPLETION_READ_WINDOW_DAYS);
  });

  it('counts backwards, and formats as the YYYY-MM-DD the arrays store', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(windowStart(0, now)).toBe('2026-08-21');
    expect(windowStart(1, now)).toBe('2026-08-20');
    expect(windowStart(400, now)).toBe('2025-07-17');
  });

  it('orders lexicographically the way the date compare relies on', () => {
    // Both the SQL trim and retractable() compare these strings directly rather
    // than casting to date. That is only sound while the format is zero-padded.
    expect(windowStart(400) < windowStart(0)).toBe(true);
  });
});
