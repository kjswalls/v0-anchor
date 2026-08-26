import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CloudOff, Sun } from 'lucide-react';

/**
 * Direction E: every notice goes back to the thing it is about, and the dock
 * keeps at most one line.
 *
 * The claims here are the ones the plan says a future change must not break
 * (memory/plans/notices-in-place.md). Three of them are about placement and are
 * pure; three are about what the user can actually see and do, and need a tree.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED: pixels. "The omnibar does not move" is a
 * layout fact and jsdom lays nothing out, so asserting it directly would be
 * asserting a lie. Its STRUCTURAL cause is assertable and is what is pinned
 * instead — the strip is outside the dock capsule, so nothing in it can be
 * inside the box the omnibar's position is measured from.
 */

vi.mock('@/lib/db', () => ({
  fetchItems: vi.fn(async () => []),
  fetchProjects: vi.fn(async () => []),
  fetchHabitGroups: vi.fn(async () => []),
  fetchItemTypes: vi.fn(async () => []),
  fetchRoutines: vi.fn(async () => []),
  fetchPrograms: vi.fn(async () => []),
  fetchGoals: vi.fn(async () => []),
}));
vi.mock('@/lib/settings-service', () => ({ saveSettings: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({
  toast: Object.assign(() => 'id', { error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  })),
}));
// The omnibar's command context reaches for the router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { NOTICE_RANK, placeNotices, type DockNotice } from '@/lib/dock-notices';
import {
  liveNoticeAnchors,
  registerNoticeAnchor,
  resetNoticeAnchors,
} from '@/lib/notice-anchors';
import { useUndoStripStore } from '@/lib/undo-strip-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { toDateStr } from '@/lib/recurrence';
import { DockNotices } from '@/components/sidebar/dock-notices';
import { SidebarDock } from '@/components/sidebar/sidebar-dock';
import { DayFootNotice } from '@/components/notices/notice-slot';
import { useEODStore } from '@/lib/eod-store';
import { NoticeSlot } from '@/components/notices/notice-slot';
import { UndoStrip } from '@/components/notices/undo-strip';
import { TypewriterText } from '@/components/primitives/typewriter-text';

// The dock measures itself for the toast anchor, and jsdom ships no observer.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const notice = (over: Partial<DockNotice> & { id: string }): DockNotice => ({
  rank: NOTICE_RANK.receipt,
  icon: Sun,
  label: over.id,
  ...over,
});

/* ── placement ───────────────────────────────────────────────────────── */

describe('placeNotices', () => {
  it('sends a notice to its object when that object is on screen', () => {
    const sweep = notice({ id: 'auto-age-receipt', anchor: 'braindump' });
    const { dock, anchored } = placeNotices([sweep], new Set(['braindump']));

    expect(dock).toEqual([]);
    expect(anchored.get('braindump')?.map((n) => n.id)).toEqual(['auto-age-receipt']);
  });

  it('keeps it on the dock line when its object is NOT on screen', () => {
    // The phone's Today tab: the braindump is a tab away, so a receipt placed
    // there would be a receipt nobody ever sees. This is the half of E's
    // tradeoff that a rule CAN cover.
    const sweep = notice({ id: 'auto-age-receipt', anchor: 'braindump' });
    const { dock, anchored } = placeNotices([sweep], new Set());

    expect(dock.map((n) => n.id)).toEqual(['auto-age-receipt']);
    expect(anchored.size).toBe(0);
  });

  it('pins a blocked notice to the dock even when it names a live anchor', () => {
    // "Couldn't load your data" must never be somewhere you have to scroll to.
    // The anchor here is deliberately absurd — the point is that the rank wins
    // over whatever a future notice claims for itself.
    const broken = notice({
      id: 'sync-error',
      rank: NOTICE_RANK.blocked,
      icon: CloudOff,
      anchor: 'braindump',
    });
    const { dock, anchored } = placeNotices([broken], new Set(['braindump']));

    expect(dock.map((n) => n.id)).toEqual(['sync-error']);
    expect(anchored.size).toBe(0);
  });

  it('pins a notice carrying a tray to the dock, so placement cannot lose a body', () => {
    // An in-place row draws no tray. Anchoring one would silently drop the
    // triage list, which is the whole content of the notice.
    const waiting = notice({
      id: 'waiting',
      rank: NOTICE_RANK.decision,
      anchor: 'day-foot',
      tray: () => null,
    });
    const { dock, anchored } = placeNotices([waiting], new Set(['day-foot']));

    expect(dock.map((n) => n.id)).toEqual(['waiting']);
    expect(anchored.size).toBe(0);
  });

  it('ranks both buckets, so nothing can be placed in one order and drawn in another', () => {
    const { dock, anchored } = placeNotices(
      [
        notice({ id: 'c', rank: NOTICE_RANK.receipt }),
        notice({ id: 'a', rank: NOTICE_RANK.blocked }),
        notice({ id: 'b', rank: NOTICE_RANK.decision }),
        notice({ id: 'y', rank: NOTICE_RANK.receipt, anchor: 'braindump' }),
        notice({ id: 'x', rank: NOTICE_RANK.decision, anchor: 'braindump' }),
      ],
      new Set(['braindump'])
    );

    expect(dock.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(anchored.get('braindump')?.map((n) => n.id)).toEqual(['x', 'y']);
  });
});

/* ── the anchor registry ─────────────────────────────────────────────── */

describe('the anchor registry', () => {
  beforeEach(() => resetNoticeAnchors());

  it('keeps an anchor live while ANY slot for it is mounted', () => {
    // A shell swap mounts the incoming slot before unmounting the outgoing one.
    // Without the refcount the anchor blinks dark in between and the notice
    // jumps to the dock and back for one commit — the exact flicker this change
    // exists to remove.
    const first = registerNoticeAnchor('day-foot');
    const second = registerNoticeAnchor('day-foot');
    first();

    const { anchored } = placeNotices(
      [notice({ id: 'eod-review', anchor: 'day-foot' })],
      liveNoticeAnchors()
    );
    expect(anchored.get('day-foot')).toHaveLength(1);

    second();
    expect(placeNotices([notice({ id: 'eod-review', anchor: 'day-foot' })], liveNoticeAnchors()).dock)
      .toHaveLength(1);
  });

  it('ignores a double release, so one slot cannot unregister another', () => {
    const release = registerNoticeAnchor('braindump');
    registerNoticeAnchor('braindump');
    release();
    release();

    const { anchored } = placeNotices(
      [notice({ id: 'auto-age-receipt', anchor: 'braindump' })],
      liveNoticeAnchors()
    );
    expect(anchored.get('braindump')).toHaveLength(1);
  });
});

/* ── the sweep receipt, in place ─────────────────────────────────────── */

const TODAY = toDateStr(new Date(), 'UTC');

function seedSweepReceipt() {
  usePlannerStore.setState({ userId: 'u1', userTimezone: 'UTC', error: null });
  useMorningStore.setState({
    morningAutoAgeReceiptByUser: {
      u1: {
        date: TODAY,
        items: [{ id: 'i1', title: 'Swim', isScheduled: true, startDate: '2026-08-20' }],
      },
    },
  });
}

describe('the sweep receipt', () => {
  beforeEach(() => {
    resetNoticeAnchors();
    useSidebarStore.setState({ leftSidebarOpen: true });
    seedSweepReceipt();
  });
  afterEach(() => {
    cleanup();
    useMorningStore.setState({ morningAutoAgeReceiptByUser: {} });
  });

  it('stands on the braindump, and the dock says nothing', () => {
    render(
      <>
        <NoticeSlot anchor="braindump" />
        <DockNotices />
      </>
    );

    const placed = screen.getByTestId('in-place-notice');
    expect(placed).toHaveAttribute('data-notice-id', 'auto-age-receipt');
    expect(placed).toHaveAttribute('data-notice-anchor', 'braindump');
    expect(screen.getByText('1 item')).toBeInTheDocument();
    // The dock renders NOTHING — not an empty stack, not a spacer row.
    expect(screen.queryByTestId('dock-notices')).toBeNull();
  });

  it('falls back to the dock when the braindump is not mounted', () => {
    render(<DockNotices />);

    expect(screen.getByTestId('dock-notices')).toBeInTheDocument();
    expect(screen.getByTestId('dock-notice')).toHaveAttribute(
      'data-notice-id',
      'auto-age-receipt'
    );
  });

  it('is dismissible in place, with the ✕ drawn on every platform', () => {
    render(<NoticeSlot anchor="braindump" />);

    // Amendment 2. The dock suppresses its ✕ on touch because it collides with
    // a full-width tap target; in place there is nothing for it to collide with,
    // so the row always draws its own way out.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this receipt' }));
    expect(useMorningStore.getState().morningAutoAgeReceiptByUser.u1).toBeUndefined();
  });
});

/* ── the typewriter ──────────────────────────────────────────────────── */

describe('the typewriter reveal', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-reduce-motion');
  });

  const matchReducedMotion = (reduced: boolean) => {
    window.matchMedia = ((query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  };

  it('has the whole sentence in the DOM while it types', () => {
    matchReducedMotion(false);
    render(<TypewriterText revealKey="a">Today’s review is waiting</TypewriterText>);

    // The reveal is a clip over text that is already there. If this ever becomes
    // "append a character at a time", the notice is unreadable while it types
    // and this assertion is what says so.
    expect(screen.getByText('Today’s review is waiting')).toBeInTheDocument();
    expect(document.querySelector('.notice-type')).not.toBeNull();
  });

  it('simply appears under the OS reduced-motion preference', () => {
    matchReducedMotion(true);
    render(<TypewriterText revealKey="a">Today’s review is waiting</TypewriterText>);

    expect(screen.getByText('Today’s review is waiting')).toBeInTheDocument();
    expect(document.querySelector('.notice-type')).toBeNull();
    expect(screen.queryByTestId('notice-shimmer')).toBeNull();
  });

  it('simply appears under Anchor’s own animations toggle', () => {
    matchReducedMotion(false);
    document.documentElement.setAttribute('data-reduce-motion', 'true');
    render(<TypewriterText revealKey="a">Today’s review is waiting</TypewriterText>);

    // Two vetoes, not one. `[data-reduce-motion]` is a setting the user turned
    // off animations with inside the app, and it does not touch matchMedia.
    expect(screen.getByText('Today’s review is waiting')).toBeInTheDocument();
    expect(document.querySelector('.notice-type')).toBeNull();
  });
});

/* ── the undo strip ──────────────────────────────────────────────────── */

describe('the undo strip', () => {
  beforeEach(() => {
    useUndoStripStore.setState({ entry: null });
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  });
  afterEach(cleanup);

  it('is a row with an expiry, not a card', () => {
    useUndoStripStore.getState().show({ id: 'a1', label: 'Delete task: Swim', durationMs: 5000 });
    render(<UndoStrip />);

    expect(screen.getByTestId('undo-strip')).toBeInTheDocument();
    expect(screen.getByText('Delete task: Swim')).toBeInTheDocument();

    // The hairline is the only thing on the strip that says "this one leaves on
    // its own", and it drains by WIDTH: lime never takes alpha in this palette,
    // and it is its own element so no parent can fade it.
    const expiry = screen.getByTestId('undo-expiry');
    expect(expiry.className).toContain('notice-expiry');
    expect(expiry.className).toContain('bg-success-text');
    expect(expiry.style.animationDuration).toBe('5000ms');
    expect(expiry.className).not.toMatch(/opacity-/);
  });

  it('carries no title attribute, so it cannot shadow the history control', () => {
    useUndoStripStore.getState().show({ id: 'a1', label: 'Delete task: Swim', durationMs: 5000 });
    render(<UndoStrip />);

    // tests/e2e/undo-redo.spec.ts addresses the history button as
    // getByTitle('Undo'), and Playwright matches a title by SUBSTRING — a
    // tooltip here would put a transient second match in front of it.
    for (const el of document.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/undo/i);
    }
  });

  it('goes away when waved off, without undoing anything', () => {
    const undo = vi.fn();
    usePlannerStore.setState({ canUndo: true, undo });
    useUndoStripStore.getState().show({ id: 'a1', label: 'Delete task: Swim', durationMs: 5000 });
    render(<UndoStrip />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(undo).not.toHaveBeenCalled();
    expect(useUndoStripStore.getState().entry).toBeNull();
  });

  it('undoes and clears when taken up', () => {
    const undo = vi.fn();
    usePlannerStore.setState({ canUndo: true, undo });
    useUndoStripStore.getState().show({ id: 'a1', label: 'Delete task: Swim', durationMs: 5000 });
    render(<UndoStrip />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledTimes(1);
    expect(useUndoStripStore.getState().entry).toBeNull();
  });

  it('will not let a stale timer clear the row that replaced it', () => {
    const store = useUndoStripStore.getState();
    store.show({ id: 'a1', label: 'Delete task: Swim', durationMs: 5000 });
    store.show({ id: 'a2', label: 'Delete task: Run', durationMs: 5000 });

    // a1's timer fires late. Unconditional dismissal here takes down a row the
    // user has had for a fraction of its life.
    useUndoStripStore.getState().dismiss('a1');
    expect(useUndoStripStore.getState().entry?.id).toBe('a2');
  });
});


/* ── the day's foot ──────────────────────────────────────────────────── */

describe('the end-of-day line', () => {
  beforeEach(() => {
    resetNoticeAnchors();
    usePlannerStore.setState({ userId: 'u1', userTimezone: 'UTC', error: null });
    useSidebarStore.setState({ leftSidebarOpen: true });
    useEODStore.setState({
      _hasHydrated: true,
      eodReviewEnabled: true,
      eodReviewTime: '00:00',
      lastEodReviewDate: null,
      eodDeferredDate: null,
    });
  });
  afterEach(() => {
    cleanup();
    useEODStore.setState({ eodReviewEnabled: false, _hasHydrated: false });
  });

  it('stands at the foot of TODAY’s column', () => {
    render(<DayFootNotice dateStr={TODAY} />);

    const placed = screen.getByTestId('in-place-notice');
    expect(placed).toHaveAttribute('data-notice-id', 'eod-review');
    expect(placed).toHaveAttribute('data-notice-anchor', 'day-foot');
  });

  it('goes back to the dock when you arrow to another day', () => {
    // The anchor is "the foot of the day this is about". Under a Thursday it
    // would be a line about a day that is not on screen, which is the failure
    // ProgramNotice refuses for the same reason.
    render(
      <>
        <DayFootNotice dateStr="2026-09-17" />
        <DockNotices />
      </>
    );

    expect(screen.queryByTestId('in-place-notice')).toBeNull();
    expect(screen.getByTestId('dock-notice')).toHaveAttribute('data-notice-id', 'eod-review');
  });
});

/* ── the dock's one line, and where the strip hangs ──────────────────── */

describe('the dock', () => {
  beforeEach(() => {
    resetNoticeAnchors();
    useSidebarStore.setState({ leftSidebarOpen: true, chatExpanded: false });
    seedSweepReceipt();
    usePlannerStore.setState({ error: 'network' });
  });
  afterEach(() => {
    cleanup();
    usePlannerStore.setState({ error: null });
    useMorningStore.setState({ morningAutoAgeReceiptByUser: {} });
  });

  it('draws ONE row: past that, the fold speaks for the pile', () => {
    // Two homeless notices — a blocked one, which is pinned here whatever it
    // claims, and a receipt whose braindump is not mounted. MAX_ROWS is 1 on
    // both platforms now, so neither gets to stand in for the other: the single
    // row is the summary.
    render(<DockNotices />);

    expect(screen.queryAllByTestId('dock-notice')).toHaveLength(0);
    const fold = screen.getByTestId('dock-notice-overflow');
    expect(fold).toHaveAttribute('data-overflow-count', '2');
    expect(fold).toHaveTextContent('2 to answer');
  });

  it('hangs the strip OUTSIDE the capsule, which is the whole geometry fix', () => {
    render(<SidebarDock />);

    const capsule = document.querySelector('[data-dock-surface]');
    const strip = screen.getByTestId('dock-notices');
    expect(capsule).not.toBeNull();
    // A notice inside the capsule changes the capsule's height, and the omnibar
    // sits at the capsule's foot. jsdom cannot measure that; it CAN say the row
    // is not in the box, which is the structural cause.
    expect(capsule!.contains(strip)).toBe(false);
    // ...and it is above it, so the capsule's bottom edge is still the column's.
    expect(strip.compareDocumentPosition(capsule!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hangs the undo row outside the capsule too', () => {
    useUndoStripStore.getState().show({ id: 'u1', label: 'Delete task: Swim', durationMs: 5000 });
    render(<SidebarDock />);

    const capsule = document.querySelector('[data-dock-surface]');
    expect(capsule!.contains(screen.getByTestId('undo-strip'))).toBe(false);
    useUndoStripStore.setState({ entry: null });
  });
});
