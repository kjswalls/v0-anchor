import { describe, it, expect } from 'vitest';
import { Sun } from 'lucide-react';
import { capNotices, NOTICE_RANK, rankNotices, type DockNotice } from '@/lib/dock-notices';

/**
 * The two policies the dock's notice stack runs on: what order the app speaks
 * in, and what it does when it has more to say than it has room for.
 *
 * Both are pure and neither is about React, which is the reason they live in
 * lib/ rather than inside the component — the height ladder is a rule about how
 * much of the sidebar this surface is allowed to take, and a rule worth stating
 * is worth pinning.
 */

const notice = (id: string, rank: number): DockNotice => ({
  id,
  rank,
  icon: Sun,
  label: id,
});

describe('rankNotices', () => {
  it('puts what blocks you above what merely waits on you', () => {
    const ranked = rankNotices([
      notice('waiting', NOTICE_RANK.decision),
      notice('swept', NOTICE_RANK.receipt),
      notice('offline', NOTICE_RANK.blocked),
    ]);
    expect(ranked.map((n) => n.id)).toEqual(['offline', 'waiting', 'swept']);
  });

  it('breaks ties by id, so equal-rank notices cannot swap places between renders', () => {
    const a = rankNotices([notice('b', 50), notice('a', 50)]);
    const b = rankNotices([notice('a', 50), notice('b', 50)]);
    expect(a.map((n) => n.id)).toEqual(['a', 'b']);
    expect(b.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [notice('z', 10), notice('a', 90)];
    rankNotices(input);
    expect(input.map((n) => n.id)).toEqual(['z', 'a']);
  });
});

describe('capNotices', () => {
  const three = [notice('a', 90), notice('b', 50), notice('c', 30)];

  it('draws everything while the stack fits', () => {
    expect(capNotices(three.slice(0, 2), 2)).toEqual({ visible: three.slice(0, 2), overflow: 0 });
  });

  it('spends the LAST slot on the fold, not on a notice', () => {
    // Three notices into two rows is one notice + one summary. Showing two
    // notices AND a summary would be three rows, which is the thing the cap is
    // for; showing two notices and no summary would drop the third silently.
    const { visible, overflow } = capNotices(three, 2);
    expect(visible.map((n) => n.id)).toEqual(['a']);
    expect(overflow).toBe(2);
  });

  it('folds the only notice away too when the cap is one row', () => {
    // Mobile. With max 1 there is no slot that can hold both a notice and the
    // summary, so the summary wins and speaks for the pile — the row reads
    // "2 to answer" rather than standing in for one of them.
    const { visible, overflow } = capNotices(three.slice(0, 2), 1);
    expect(visible).toEqual([]);
    expect(overflow).toBe(2);
  });

  it('still shows a lone notice at a one-row cap', () => {
    expect(capNotices(three.slice(0, 1), 1)).toEqual({ visible: three.slice(0, 1), overflow: 0 });
  });

  it('lifts the cap completely once expanded — nothing is ever left folded', () => {
    const { visible, overflow } = capNotices(three, 2, true);
    expect(visible).toHaveLength(3);
    expect(overflow).toBe(0);
  });

  it('reports nothing to fold for an empty stack', () => {
    expect(capNotices([], 2)).toEqual({ visible: [], overflow: 0 });
  });
});
