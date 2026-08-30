import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * The tappable answers on a blocked item.
 *
 * The whole surface hangs on one link that is easy to get wrong: the question
 * the user READS comes from `item.aiResult`, and the options come from an
 * `agent_question` event. Nothing structural ties them together —
 * `anchor_report_progress` can set `aiResult` and writes no event at all — so
 * "newest question event" is not the same as "the question on screen". Offering
 * the wrong buttons is worse than offering none: the text is sent back verbatim
 * as the answer, so a tap files a reply to a question that is not being asked.
 *
 * The panel is also REUSED across items (the dialog re-seeds on id change
 * without unmounting), which makes a stale render a cross-item bug rather than
 * a cosmetic one.
 */

const recordAgentReply = vi.fn();
const updateTask = vi.fn();
let events: Array<{ action: string; payload: Record<string, unknown>; createdAt: string }> = [];
let resolveFetch: ((v: typeof events) => void) | null = null;

vi.mock('@/lib/db', () => ({
  fetchItemEvents: vi.fn(
    () =>
      new Promise((resolve) => {
        // Held open when a test wants to inspect the mid-flight window.
        if (resolveFetch === null) resolve(events);
        else resolveFetch = resolve as (v: typeof events) => void;
      })
  ),
  getItemEventsAvailable: () => true,
  recordAgentReply: (...args: unknown[]) => recordAgentReply(...args),
}));

const items: Array<Record<string, unknown>> = [];
vi.mock('@/lib/planner-store', () => ({
  usePlannerStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { items, updateTask, addTask: vi.fn(), addTasksBulk: vi.fn() };
      return sel ? sel(state) : state;
    },
    { getState: () => ({ items, updateTask }) }
  ),
}));

import { AgentReplyForTest as AgentReply } from '@/components/planner/item-detail-sections';

const task = (over: Record<string, unknown> = {}) =>
  ({
    type: 'task',
    id: 'item-1',
    title: 'Book the dentist',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
    assignee: 'beacon',
    aiStatus: 'blocked',
    aiResult: 'Which Dana?',
    ...over,
  }) as never;

const question = (q: string, options: string[], at = '2026-08-26T10:00:00Z') => ({
  action: 'agent_question',
  payload: { question: q, options },
  createdAt: at,
});

beforeEach(() => {
  recordAgentReply.mockClear();
  updateTask.mockClear();
  resolveFetch = null;
  events = [];
});

const buttons = () => screen.queryByTestId('agent-options')?.querySelectorAll('button') ?? [];

describe('offering the answers', () => {
  it('shows the options the agent attached to the question being asked', async () => {
    events = [question('Which Dana?', ['Dana Reyes', 'Dana Whitfield'])];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(2));
    expect([...buttons()].map((b) => b.textContent)).toEqual(['Dana Reyes', 'Dana Whitfield']);
  });

  it('sends the option text verbatim, because that IS the answer', async () => {
    events = [question('Which Dana?', ['Dana Reyes', 'Dana Whitfield'])];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(2));

    fireEvent.click(buttons()[1]);
    expect(recordAgentReply).toHaveBeenCalledWith('item-1', 'task', 'Dana Whitfield');
    // The flip is the load-bearing half — a reply that did not re-queue would
    // look answered and never move.
    expect(updateTask).toHaveBeenCalledWith('item-1', { aiStatus: 'queued' });
  });

  it('withdraws the buttons once answered, so nobody replies twice', async () => {
    events = [question('Which Dana?', ['Dana Reyes'])];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(1));
    fireEvent.click(buttons()[0]);
    expect(buttons()).toHaveLength(0);
  });

  it('keeps the free-text box alongside — a list is rarely exhaustive', async () => {
    events = [question('Which Dana?', ['Dana Reyes'])];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(1));
    expect(screen.getByTestId('agent-reply-input')).toBeTruthy();
  });
});

describe('options that belong to a different question', () => {
  it('offers nothing when the question on screen is not the one with options', async () => {
    /**
     * The sequence that breaks a naive "newest event wins": the agent asks with
     * options, the user does not answer, and the agent asks again through
     * `anchor_report_progress` — which sets `aiResult` and writes NO event. The
     * panel would show the new question above the old question's buttons, and a
     * tap would file "Dana Reyes" as the answer to "what's the invoice number".
     */
    events = [question('Which Dana?', ['Dana Reyes', 'Dana Whitfield'])];
    render(<AgentReply item={task({ aiResult: "What's the invoice number?" })} />);
    await waitFor(() => expect(screen.getByTestId('agent-reply-input')).toBeTruthy());
    expect(buttons()).toHaveLength(0);
  });

  it('offers nothing when the question event was lost', async () => {
    // The block is durable, the event write can fail. Degrading to the text box
    // is the safe direction.
    events = [];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(screen.getByTestId('agent-reply-input')).toBeTruthy());
    expect(buttons()).toHaveLength(0);
  });

  it('offers nothing for a question already answered', async () => {
    events = [
      { action: 'agent_reply', payload: { text: 'Dana Reyes' }, createdAt: '2026-08-26T11:00:00Z' },
      question('Which Dana?', ['Dana Reyes', 'Dana Whitfield'], '2026-08-26T10:00:00Z'),
    ];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(screen.getByTestId('agent-reply-input')).toBeTruthy());
    expect(buttons()).toHaveLength(0);
  });

  it('offers again when the agent re-asks after a reply', async () => {
    events = [
      question('Which Dana?', ['Dana Reyes'], '2026-08-26T12:00:00Z'),
      { action: 'agent_reply', payload: { text: 'neither' }, createdAt: '2026-08-26T11:00:00Z' },
    ];
    render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(1));
  });
});

describe('the panel is reused across items', () => {
  it('clears the previous item options before the new fetch resolves', async () => {
    // The dialog re-seeds on id change WITHOUT unmounting, so leaving the old
    // options up during the round-trip meant item A's buttons on screen with
    // item B's id already bound — a tap filed A's answer against B and
    // re-queued B unanswered.
    events = [question('Which Dana?', ['Dana Reyes', 'Dana Whitfield'])];
    const { rerender } = render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(2));

    // Hold the next fetch open and swap the item underneath.
    resolveFetch = (() => {}) as never;
    rerender(<AgentReply item={task({ id: 'item-2', aiResult: 'Which invoice?' })} />);
    expect(buttons()).toHaveLength(0);
  });

  it('clears them when the same item is asked a new question', async () => {
    events = [question('Which Dana?', ['Dana Reyes'])];
    const { rerender } = render(<AgentReply item={task()} />);
    await waitFor(() => expect(buttons()).toHaveLength(1));

    resolveFetch = (() => {}) as never;
    rerender(<AgentReply item={task({ aiResult: 'Which invoice?' })} />);
    expect(buttons()).toHaveLength(0);
  });
});
