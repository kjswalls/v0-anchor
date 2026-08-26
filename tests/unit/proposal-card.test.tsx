import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Proposal } from '@/lib/planner-types';

/**
 * The card is the one place the AI's suggestion becomes a change to the user's
 * planner, so the things worth pinning are the ones that decide WHAT gets
 * written: which lines are in, and that the button never promises more than
 * the ticked ones.
 *
 * "Not now" used to be the only exit that was not all-or-nothing, and it left
 * the user exactly where they started. The two escapes added here — drop a
 * line, ask for something else — are the difference between a card you can
 * negotiate with and one you can only obey or close.
 */

const accept = vi.fn();
const retry = vi.fn();
const dismiss = vi.fn();

let proposal: Proposal | null = null;
let status = 'ready';
let intent: string | null = 'ask';
let surface = 'chat';

const storeState = () => ({
  proposal,
  status,
  error: null,
  emptyMessage: null,
  accept,
  retry,
  dismiss,
  lastRequest: intent ? { intent, surface } : null,
});

vi.mock('@/lib/proposal-store', () => {
  // Also callable as `useProposalStore.getState()` — the card reads the store
  // imperatively in its unmount cleanup, so the cleanup sees the state at
  // UNMOUNT rather than whatever was captured when the effect ran.
  const hook = (sel: (s: unknown) => unknown) => sel(storeState());
  hook.getState = () => storeState();
  return { useProposalStore: hook };
});

vi.mock('@/lib/planner-store', () => ({
  usePlannerStore: (sel: (s: unknown) => unknown) => sel({ items: [], itemTypes: [] }),
}));

// The card's job here is selection, not phrasing — one stable line per op keeps
// the assertions about which operations survive rather than how they read.
vi.mock('@/lib/proposal', () => ({
  describeOperation: (op: { title?: string }) => op.title ?? 'a change',
}));

import { ProposalCard } from '@/components/ai/proposal-card';

const op = (title: string) => ({ kind: 'create' as const, itemType: 'task', title });

const makeProposal = (...titles: string[]): Proposal =>
  ({
    id: 'p1',
    createdAt: '2026-08-26T00:00:00.000Z',
    summary: 'A plan',
    rationale: 'because',
    operations: titles.map(op),
  }) as unknown as Proposal;

beforeEach(() => {
  accept.mockClear();
  retry.mockClear();
  dismiss.mockClear();
  status = 'ready';
  intent = 'ask';
  surface = 'chat';
  proposal = makeProposal('one', 'two', 'three');
});

const acceptButton = () => screen.getByTestId('proposal-accept') as HTMLButtonElement;
const lines = () => screen.getAllByTestId('proposal-line');

describe('dropping individual lines', () => {
  it('starts with every line in — the card is an offer, not a form', () => {
    render(<ProposalCard />);
    expect(lines()).toHaveLength(3);
    for (const line of lines()) expect(line.getAttribute('aria-pressed')).toBe('true');
    expect(acceptButton().textContent).toContain('Do all of it');
  });

  it('accepts only the lines still ticked', () => {
    render(<ProposalCard />);
    fireEvent.click(lines()[1]);
    fireEvent.click(acceptButton());

    expect(accept).toHaveBeenCalledTimes(1);
    const passed = accept.mock.calls[0][0] as Array<{ title: string }>;
    expect(passed.map((o) => o.title)).toEqual(['one', 'three']);
  });

  it('is a toggle — a line put back comes back', () => {
    render(<ProposalCard />);
    fireEvent.click(lines()[0]);
    expect(lines()[0].getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(lines()[0]);
    expect(lines()[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(acceptButton());
    expect((accept.mock.calls[0][0] as unknown[]).length).toBe(3);
  });

  it('never promises more than what is ticked', () => {
    render(<ProposalCard />);
    fireEvent.click(lines()[0]);
    expect(acceptButton().textContent).toContain('Do these 2');
    fireEvent.click(lines()[1]);
    expect(acceptButton().textContent).toContain('Do just that one');
  });

  it('will not accept an empty selection', () => {
    render(<ProposalCard />);
    for (const line of lines()) fireEvent.click(line);
    expect(acceptButton().disabled).toBe(true);
    fireEvent.click(acceptButton());
    expect(accept).not.toHaveBeenCalled();
  });

  it('reads "Do it" for a single-line plan', () => {
    proposal = makeProposal('only one');
    render(<ProposalCard />);
    expect(acceptButton().textContent).toContain('Do it');
  });

  it('clears the selection when a new proposal arrives', () => {
    // Indices are positional. Carrying them across cards would silently drop
    // whichever line happened to land where a dropped one used to be.
    const { rerender } = render(<ProposalCard />);
    fireEvent.click(lines()[0]);
    expect(acceptButton().textContent).toContain('Do these 2');

    proposal = { ...makeProposal('a', 'b', 'c'), id: 'p2' } as Proposal;
    rerender(<ProposalCard />);
    expect(acceptButton().textContent).toContain('Do all of it');
  });
});

describe('asking for something else', () => {
  it('offers a retry on a model-backed ask', () => {
    render(<ProposalCard />);
    fireEvent.click(screen.getByTestId('proposal-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('hides it on catch-up, which would return the same answer', () => {
    // buildCatchUpProposal is a pure function of the planner. A retry that
    // cannot differ is a button that lies.
    intent = 'catch-up';
    render(<ProposalCard />);
    expect(screen.queryByTestId('proposal-retry')).toBeNull();
  });

  it('hides it when nothing produced this card', () => {
    intent = null;
    render(<ProposalCard />);
    expect(screen.queryByTestId('proposal-retry')).toBeNull();
  });

  it('leaves "Not now" as a real exit alongside it', () => {
    render(<ProposalCard />);
    fireEvent.click(screen.getByText('Not now'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('which mount answers', () => {
  /**
   * One store, several mounts. A breakdown asked for inside an item's dialog
   * must not answer into the sidebar behind it — the user would be looking at
   * the button they just pressed with nothing visibly happening.
   */
  it('renders the card on the surface that asked for it', () => {
    surface = 'item:abc';
    render(<ProposalCard surface="item:abc" />);
    expect(screen.getByTestId('proposal-card')).toBeTruthy();
  });

  it('stays silent on every other surface', () => {
    surface = 'item:abc';
    render(<ProposalCard surface="chat" />);
    expect(screen.queryByTestId('proposal-card')).toBeNull();
  });

  it('defaults to the chat surface, so existing mounts are unchanged', () => {
    surface = 'chat';
    render(<ProposalCard />);
    expect(screen.getByTestId('proposal-card')).toBeTruthy();
  });

  it('hides the loading state on the wrong surface too', () => {
    // Otherwise a spinner appears in the sidebar for work asked for elsewhere.
    surface = 'item:abc';
    status = 'loading';
    render(<ProposalCard surface="chat" />);
    expect(screen.queryByTestId('proposal-card')).toBeNull();
  });

  it('offers a retry on a breakdown, which can genuinely differ', () => {
    intent = 'breakdown';
    surface = 'item:abc';
    render(<ProposalCard surface="item:abc" />);
    expect(screen.getByTestId('proposal-retry')).toBeTruthy();
  });
});

describe('a card whose surface goes away', () => {
  /**
   * "Break it down" lives inside a panel the user can close. If the reply lands
   * on a surface nothing mounts there is no card, no toast, and no trace the
   * button did anything — recoverable only by reopening that exact item, which
   * nothing tells them. Closing the panel drops the request instead.
   */
  it('dismisses the request it owns when it unmounts', () => {
    surface = 'item:abc';
    const { unmount } = render(<ProposalCard surface="item:abc" />);
    unmount();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves a request belonging to another surface alone', () => {
    surface = 'chat';
    const { unmount } = render(<ProposalCard surface="item:abc" />);
    unmount();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('never dismisses on behalf of the chat mount, which is always there', () => {
    // The sidebar card unmounts every time the panel collapses; cancelling the
    // user's request for that would be its own bug.
    surface = 'chat';
    const { unmount } = render(<ProposalCard />);
    unmount();
    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe('states with a way out', () => {
  it('lets the user cancel while it is thinking', () => {
    // Every other state had an exit; this one did not, and it is the state that
    // lasts longest and greys out the AI buttons on its own surface.
    status = 'loading';
    render(<ProposalCard />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('offers a retry from the error state, where trying again is the obvious move', () => {
    status = 'error';
    render(<ProposalCard />);
    fireEvent.click(screen.getByTestId('proposal-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('announces itself, since the card can appear without the user looking', () => {
    render(<ProposalCard />);
    expect(screen.getByTestId('proposal-card').getAttribute('role')).toBe('status');
  });
});
