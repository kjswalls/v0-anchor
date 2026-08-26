import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CloudOff, Sun } from 'lucide-react';

/**
 * The two placement rules, pinned at the place that DRAWS the row.
 *
 * `placeNotices` is pure and thoroughly tested — and that turned out to be a
 * test one layer away from where breaking it hurts. Replace the slot's
 * `anchored.get(anchor)` with a plain `notices.filter(n => n.anchor === anchor)`
 * and every one of those tests stays green while both rules are bypassed at the
 * only place an in-place notice is ever rendered.
 *
 * So this file does not test the function. It hands the slot two notices that
 * name a live anchor and must not be drawn there anyway — a `blocked` one, which
 * must never be anywhere you have to go to, and a tray-bearing one, whose body
 * an in-place row has nowhere to put — and asserts the slot draws nothing.
 *
 * It lives in its own file because the mock replaces the notice sources for the
 * whole module graph, which is exactly what makes the assertion sharp: the slot
 * gets what it is given and has to refuse it on its own.
 */

vi.mock('@/components/notices/notice-sources', () => ({
  useAnchorableNotices: () => [
    {
      id: 'sync-error',
      rank: 90, // NOTICE_RANK.blocked
      anchor: 'braindump',
      icon: CloudOff,
      label: 'Couldn’t load your data',
      actionLabel: 'Retry',
    },
    {
      id: 'waiting',
      rank: 50, // NOTICE_RANK.decision
      anchor: 'braindump',
      icon: Sun,
      label: '3 items waiting',
      actionLabel: 'Review',
      tray: () => <div data-testid="a-tray">the triage list</div>,
    },
  ],
}));

import { NoticeSlot } from '@/components/notices/notice-slot';

afterEach(cleanup);

describe('the slot that draws an in-place notice', () => {
  it('refuses a blocked notice and a tray-bearing one, even when they name its anchor', () => {
    render(<NoticeSlot anchor="braindump" />);

    // Not "renders them without their tray", not "renders one of them" — the
    // slot renders NOTHING, because neither notice belongs anywhere but the dock
    // and the dock is where placement has already sent them.
    expect(screen.queryByTestId('notice-slot')).toBeNull();
    expect(screen.queryByTestId('in-place-notice')).toBeNull();
    expect(screen.queryByText('Couldn’t load your data')).toBeNull();
    expect(screen.queryByText('3 items waiting')).toBeNull();
    expect(screen.queryByTestId('a-tray')).toBeNull();
  });
});
