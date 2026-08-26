import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updatesToRow } from '@/lib/db';

/**
 * The agent clock's write rules.
 *
 * Three invariants, each of which was broken at some point in this feature's
 * short life and each of which produces a CONFIDENT WRONG NUMBER on the row —
 * the one failure mode the column was added to avoid, and worse than showing
 * nothing at all.
 */

const NOW = '2026-08-26T12:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe('the stamp travels with the status', () => {
  it('is written whenever the status is', () => {
    expect(updatesToRow('task', { aiStatus: 'working' })).toEqual({
      ai_status: 'working',
      ai_status_at: NOW,
    });
  });

  it('is written when the status is CLEARED, so unassigning dates itself', () => {
    expect(updatesToRow('task', { aiStatus: undefined })).toEqual({
      ai_status: null,
      ai_status_at: NOW,
    });
  });

  it('is never written alone', () => {
    // A clock set independently of the state it describes is free to drift
    // from it, which is the whole reason this is a companion write.
    expect(updatesToRow('task', { aiStatusAt: '2020-01-01T00:00:00.000Z' } as never)).toEqual({});
  });

  it('does not restart on a result-only progress report', () => {
    // An agent posting an update every few minutes would otherwise keep the row
    // reading "Working just now" indefinitely — which is exactly the stuck-run
    // signal this exists to surface.
    expect(updatesToRow('task', { aiResult: 'still going' })).toEqual({
      ai_result: 'still going',
    });
  });

  it('never reaches the habit allowlist', () => {
    expect(updatesToRow('habit', { aiStatus: 'working' } as never)).toEqual({});
  });
});

describe('an explicit stamp wins over now', () => {
  /**
   * This is what makes undo honest. `diffItem` captures `aiStatus` and
   * `aiStatusAt` together, so ⌘Z on an agent status change carries the ORIGINAL
   * time back. Overwriting it with `now` would date the restored state to the
   * moment of the undo — a question asked six hours ago reading "Needs you just
   * now", with the real time gone for good.
   */
  const ORIGINAL = '2026-08-26T06:00:00.000Z';

  it('preserves a stamp travelling with its status', () => {
    expect(
      updatesToRow('task', { aiStatus: 'blocked', aiStatusAt: ORIGINAL } as never)
    ).toEqual({ ai_status: 'blocked', ai_status_at: ORIGINAL });
  });

  it('still defaults to now when none is offered', () => {
    expect(updatesToRow('task', { aiStatus: 'blocked' })).toMatchObject({
      ai_status_at: NOW,
    });
  });
});
