// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

/**
 * The stranded-slot guard.
 *
 * lib/console-door.ts stops a DOOR arming a slot it cannot open. This is the
 * other direction: a console left OPEN when you leave `/` — browser Back, the
 * Android button, the iOS edge swipe — keeps its slot armed at a surface that
 * unmounted with the route, and the next trip home springs it open unasked.
 *
 * The arrival cases are the ones that matter most: this must NOT fire on a first
 * render, and must NOT fire on the arm-then-push landing, or it would cancel the
 * very request that navigated the user home.
 */

const { pathname } = vi.hoisted(() => ({ pathname: { current: '/' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

import { ConsoleSlotGuard } from '@/components/providers/console-slot-guard';
import { useUIStore } from '@/lib/ui-store';

const arm = () => useUIStore.setState({ activeDialog: { type: 'organize', section: 'goals' } });
const slot = () => useUIStore.getState().activeDialog;

beforeEach(() => {
  pathname.current = '/';
  useUIStore.setState({ activeDialog: null });
});

afterEach(cleanup);

/** Renders at `from`, then navigates to `to` — the same mount, a new pathname. */
const navigate = (from: string, to: string) => {
  pathname.current = from;
  const view = render(<ConsoleSlotGuard />);
  pathname.current = to;
  view.rerender(<ConsoleSlotGuard />);
};

describe('ConsoleSlotGuard', () => {
  it('drops an organize slot stranded by leaving the planner', () => {
    pathname.current = '/';
    const view = render(<ConsoleSlotGuard />);
    arm(); // the console is open on /
    pathname.current = '/item/t1'; // …and you press Back
    view.rerender(<ConsoleSlotGuard />);

    expect(slot()).toBeNull();
  });

  it('leaves the arm-then-push landing alone', () => {
    // A door on /item/t1 arms the slot and pushes home. Clearing here would
    // cancel the request that did the navigating.
    pathname.current = '/item/t1';
    const view = render(<ConsoleSlotGuard />);
    arm();
    pathname.current = '/';
    view.rerender(<ConsoleSlotGuard />);

    expect(slot()).toMatchObject({ type: 'organize', section: 'goals' });
  });

  it('does not fire on a first render, which is an arrival and not a departure', () => {
    arm();
    pathname.current = '/settings/goals';
    render(<ConsoleSlotGuard />);

    expect(slot()).toMatchObject({ type: 'organize' });
  });

  it('touches no other dialog', () => {
    useUIStore.setState({ activeDialog: { type: 'bug-report' } });
    navigate('/', '/ledger');

    expect(slot()).toMatchObject({ type: 'bug-report' });
  });

  it('is inert when nothing is open', () => {
    navigate('/', '/ledger');
    expect(slot()).toBeNull();
  });
});
