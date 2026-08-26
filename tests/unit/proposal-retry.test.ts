import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Retry and partial accept — the two ways out of a card that is nearly right.
 *
 * The subtle one is what retry SENDS. Decorating the stored prompt would make
 * each retry decorate the last, so by the third the model is reading a nest of
 * "not this, not that" wrappers instead of the question. The original ask is
 * kept verbatim and the rejections are re-composed onto it every time.
 */

const applyProposal = vi.fn(() => 1);

vi.mock('@/lib/planner-store', () => ({
  usePlannerStore: {
    getState: () => ({
      items: [],
      itemTypes: [],
      routines: [],
      programs: [],
      userTimezone: 'UTC',
      applyProposal,
    }),
  },
}));

vi.mock('@/lib/ai-settings-store', () => ({
  useAISettingsStore: {
    getState: () => ({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' }),
  },
}));

import { useProposalStore } from '@/lib/proposal-store';

const draft = (summary: string, count = 2) => ({
  summary,
  rationale: 'because',
  operations: Array.from({ length: count }, (_, i) => ({
    kind: 'create',
    itemType: 'task',
    title: `${summary} ${i}`,
  })),
});

/** Captures every /api/ai/propose body the store sends. */
function mockPropose(...responses: Array<ReturnType<typeof draft>>) {
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      const proposal = responses[Math.min(call++, responses.length - 1)];
      return { ok: true, status: 200, json: async () => ({ proposal }) };
    })
  );
  return bodies;
}

const reset = () =>
  useProposalStore.setState({
    proposal: null,
    status: 'idle',
    error: null,
    emptyMessage: null,
    lastRequest: null,
    rejected: [],
  });

beforeEach(() => {
  applyProposal.mockClear();
  reset();
});

afterEach(() => vi.unstubAllGlobals());

describe('retry', () => {
  it('sends the original ask again, plus what was turned down', async () => {
    const bodies = mockPropose(draft('Plan A'), draft('Plan B'));

    await useProposalStore.getState().request('ask', 'sort out my week');
    await useProposalStore.getState().retry();

    expect(bodies).toHaveLength(2);
    expect(bodies[0].prompt).toBe('sort out my week');
    expect(bodies[1].prompt).toContain('sort out my week');
    expect(bodies[1].prompt).toContain('Plan A');
  });

  it('re-composes onto the original rather than compounding decoration', async () => {
    const bodies = mockPropose(draft('Plan A'), draft('Plan B'), draft('Plan C'));

    await useProposalStore.getState().request('ask', 'sort out my week');
    await useProposalStore.getState().retry();
    await useProposalStore.getState().retry();

    const third = bodies[2].prompt as string;
    expect(third).toContain('Plan A');
    expect(third).toContain('Plan B');
    // One rejection block, not a block wrapped in a block wrapped in a block.
    expect(third.match(/Already suggested and turned down/g)).toHaveLength(1);
  });

  it('caps how many rejections travel, so the ask is never crowded out', async () => {
    const rounds = ['A', 'B', 'C', 'D', 'E'].map((n) => draft(`Plan ${n}`));
    const bodies = mockPropose(...rounds);

    await useProposalStore.getState().request('ask', 'the ask');
    for (let i = 0; i < 4; i++) await useProposalStore.getState().retry();

    const last = bodies.at(-1) as { prompt: string };
    expect(last.prompt).toContain('the ask');
    expect(last.prompt.match(/^- Plan/gm)?.length).toBeLessThanOrEqual(3);
    // The oldest rejection is the one dropped.
    expect(last.prompt).not.toContain('Plan A');
    expect(last.prompt).toContain('Plan D');
  });

  it('refuses on catch-up, which is a pure function of the planner', async () => {
    const bodies = mockPropose(draft('Plan A'));
    await useProposalStore.getState().request('catch-up');
    await useProposalStore.getState().retry();
    expect(bodies).toHaveLength(0);
  });

  it('refuses when nothing has been asked yet', async () => {
    const bodies = mockPropose(draft('Plan A'));
    await useProposalStore.getState().retry();
    expect(bodies).toHaveLength(0);
    expect(useProposalStore.getState().status).toBe('idle');
  });

  it('forgets the rejections once a fresh question is asked', async () => {
    const bodies = mockPropose(draft('Plan A'), draft('Plan B'), draft('Plan C'));

    await useProposalStore.getState().request('ask', 'first question');
    await useProposalStore.getState().retry();
    await useProposalStore.getState().request('ask', 'a different question');

    expect(bodies[2].prompt).toBe('a different question');
    expect(useProposalStore.getState().rejected).toEqual([]);
  });
});

describe('accepting part of a plan', () => {
  it('applies only the operations handed to it', async () => {
    mockPropose(draft('Plan A', 3));
    await useProposalStore.getState().request('ask', 'x');

    const all = useProposalStore.getState().proposal!.operations;
    useProposalStore.getState().accept([all[0], all[2]]);

    expect(applyProposal).toHaveBeenCalledTimes(1);
    expect(applyProposal.mock.calls[0][0].operations).toHaveLength(2);
    // Still ONE call, so still one set(), so still one Cmd+Z.
    expect(applyProposal.mock.calls[0][0].summary).toBe('Plan A');
  });

  it('applies everything when given nothing to narrow to', async () => {
    mockPropose(draft('Plan A', 3));
    await useProposalStore.getState().request('ask', 'x');
    useProposalStore.getState().accept();
    expect(applyProposal.mock.calls[0][0].operations).toHaveLength(3);
  });

  it('writes nothing for an empty selection', async () => {
    mockPropose(draft('Plan A', 3));
    await useProposalStore.getState().request('ask', 'x');
    expect(useProposalStore.getState().accept([])).toBe(0);
    expect(applyProposal).not.toHaveBeenCalled();
  });

  it('clears the retry history on accept, so the next card starts clean', async () => {
    mockPropose(draft('Plan A'), draft('Plan B'));
    await useProposalStore.getState().request('ask', 'x');
    await useProposalStore.getState().retry();
    expect(useProposalStore.getState().rejected).not.toEqual([]);

    useProposalStore.getState().accept();
    expect(useProposalStore.getState().rejected).toEqual([]);
    expect(useProposalStore.getState().lastRequest).toBeNull();
  });

  it('clears it on dismiss too', async () => {
    mockPropose(draft('Plan A'));
    await useProposalStore.getState().request('ask', 'x');
    useProposalStore.getState().dismiss();
    expect(useProposalStore.getState().lastRequest).toBeNull();
    expect(useProposalStore.getState().rejected).toEqual([]);
  });
});
