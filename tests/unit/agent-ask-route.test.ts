import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/agent/items/:id/ask — the agent asks something answerable in a tap.
 *
 * Three things carry the weight here.
 *
 * The service client bypasses RLS, so the ownership check is the ONLY thing
 * between an api key and writing into another account's item.
 *
 * This route looks items up by id ALONE — every other agent write goes through
 * `verifyItemOwnership`, which filters on type — so it has to ask the registry
 * whether the item can be delegated at all. Without that a worker could block
 * a habit, which no surface can draw a reply box for, stranding a question
 * nobody can answer and an agent waiting on a reply that never comes.
 *
 * And the ordering. The question is written FIRST and awaited, because
 * `recordItemEvent` is fire-and-forget by design: an earlier version flipped
 * the status first and dropped the insert's promise, so the block could stick
 * while the question was lost — the user seeing a question with no buttons, and
 * the agent told it had offered them.
 */

const recordAgentQuestion = vi.fn(async () => true);
const updateItem = vi.fn(async () => {});
type Owner = { user_id: string; type: string; assignee: string | null };
let owner: Owner | null = { user_id: 'u1', type: 'task', assignee: 'beacon' };
let resolvedUser: string | null = 'u1';

vi.mock('@/lib/db', () => ({
  MAX_QUESTION_OPTIONS: 4,
  recordAgentQuestion: (...args: unknown[]) => recordAgentQuestion(...args),
  updateItem: (...args: unknown[]) => updateItem(...args),
}));

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: async () => ({ data: owner }) }),
          eq: () => ({ maybeSingle: async () => ({ data: owner }) }),
        }),
      }),
    }),
  }),
  resolveUserIdFromApiKey: async () => resolvedUser,
}));

import { POST } from '@/app/api/agent/items/[id]/ask/route';

const ask = (body: unknown, auth = 'Bearer dsul_key', id = 'item-1') =>
  POST(
    new Request(`http://localhost/api/agent/items/${id}/ask`, {
      method: 'POST',
      headers: auth ? { authorization: auth, 'content-type': 'application/json' } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  recordAgentQuestion.mockClear();
  recordAgentQuestion.mockResolvedValue(true);
  updateItem.mockClear();
  updateItem.mockResolvedValue(undefined);
  owner = { user_id: 'u1', type: 'task', assignee: 'beacon' };
  resolvedUser = 'u1';
});

describe('authorisation', () => {
  it('refuses without a bearer token', async () => {
    const res = await ask({ question: 'Which Dana?' }, '');
    expect(res.status).toBe(401);
    expect(recordAgentQuestion).not.toHaveBeenCalled();
  });

  it('refuses a key that resolves to nobody', async () => {
    resolvedUser = null;
    expect((await ask({ question: 'Which Dana?' })).status).toBe(401);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('refuses another account item, and says nothing about its existence', async () => {
    owner = { user_id: 'someone-else', type: 'task', assignee: 'beacon' };
    const res = await ask({ question: 'Which Dana?' });
    expect(res.status).toBe(404);
    expect(updateItem).not.toHaveBeenCalled();
    expect(recordAgentQuestion).not.toHaveBeenCalled();
  });

  it('answers 404 for an item that does not exist', async () => {
    owner = null;
    expect((await ask({ question: 'Which Dana?' })).status).toBe(404);
  });
});

describe('the ask itself', () => {
  it('blocks the item and records the question in one call', async () => {
    const res = await ask({ question: 'Which Dana?', options: ['Reyes', 'Whitfield'] });
    expect(res.status).toBe(200);

    expect(recordAgentQuestion).toHaveBeenCalledWith(
      'item-1',
      'task',
      'Which Dana?',
      ['Reyes', 'Whitfield'],
      'u1',
      expect.anything()
    );
    expect(updateItem).toHaveBeenCalledWith(
      'item-1',
      'task',
      { aiStatus: 'blocked', aiResult: 'Which Dana?' },
      'u1',
      expect.anything()
    );
  });

  it('flips the status through updateItem, so the webhook still fires', async () => {
    // A raw table write would make this the one status change in the app that
    // happens silently — no tasks.updated (a permanent contract the OpenClaw
    // plugin subscribes to) and no "Agent: blocked" line in the feed.
    await ask({ question: 'Which Dana?' });
    expect(updateItem).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the question could not be recorded', async () => {
    // The claim this route used to make and did not honour: recordItemEvent is
    // fire-and-forget, so the insert could be lost while the block stuck — the
    // user seeing a question with no buttons, and the agent told it offered
    // them. The question is now written first and awaited.
    recordAgentQuestion.mockResolvedValue(false);
    const res = await ask({ question: 'Which Dana?', options: ['a', 'b'] });
    expect(res.status).toBe(500);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('reports a failed status flip rather than claiming success', async () => {
    updateItem.mockRejectedValue(new Error('boom'));
    expect((await ask({ question: 'Which Dana?' })).status).toBe(500);
  });

  it('passes the userId explicitly, since the service path has no auth context', async () => {
    // item_events.user_id defaults to auth.uid(), which is null here.
    await ask({ question: 'Which Dana?' });
    expect(recordAgentQuestion.mock.calls[0][4]).toBe('u1');
  });

});

describe('what may be asked about', () => {
  /**
   * The guard every other agent write gets for free. `verifyItemOwnership`
   * filters on `.eq('type', …)`, so /api/agent/tasks/:id 404s on a habit; this
   * route looks items up by id alone, so it has to ask the registry itself.
   */
  it('refuses a habit, which can render no reply box at all', async () => {
    // Without this the item sits `blocked` forever: AgentSection is gated on
    // agentAssignable so nothing draws the answer box, selectAssignedWork
    // filters it out of the queue, and the agent waits on a reply that can
    // never come.
    owner = { user_id: 'u1', type: 'habit', assignee: 'beacon' };
    const res = await ask({ question: 'Which one?' });
    expect(res.status).toBe(400);
    expect(recordAgentQuestion).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('refuses a custom type, for the same reason', async () => {
    // An unhydrated slug falls back to the custom template, which sets
    // agentAssignable: false — so the registry answers correctly server-side
    // with no hydration.
    owner = { user_id: 'u1', type: 'errand', assignee: 'beacon' };
    expect((await ask({ question: 'Which one?' })).status).toBe(400);
  });

  it('refuses an item assigned to nobody', async () => {
    // AgentSection shows the assign button instead of the reply box, so the
    // question would render nowhere — the same failure in a different shape.
    owner = { user_id: 'u1', type: 'task', assignee: null };
    expect((await ask({ question: 'Which one?' })).status).toBe(409);
    expect(recordAgentQuestion).not.toHaveBeenCalled();
  });
});

describe('what counts as an option', () => {
  it('works with no options at all — the text box is the fallback', async () => {
    const res = await ask({ question: 'What should I do next?' });
    expect(res.status).toBe(200);
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual([]);
  });

  it('drops rubbish rather than the whole question', async () => {
    // The question is the useful part. A malformed options array should cost
    // the buttons, not put the user back where they were before this existed.
    await ask({ question: 'Which?', options: ['Real', '', '   ', 7, null, { a: 1 }] });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual(['Real']);
  });

  it('caps how many buttons a question may offer', async () => {
    await ask({ question: 'Which?', options: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(recordAgentQuestion.mock.calls[0][3]).toHaveLength(4);
  });

  it('dedupes, since two identical buttons say nothing', async () => {
    // They are also indistinguishable to the user and collide as React keys.
    await ask({ question: 'Which?', options: ['Yes', 'Yes', 'No'] });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual(['Yes', 'No']);
  });

  it('dedupes before capping, so duplicates cannot crowd out real answers', async () => {
    await ask({ question: 'Which?', options: ['a', 'a', 'a', 'a', 'b', 'c'] });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual(['a', 'b', 'c']);
  });

  it('drops an option too long to fit on a button', async () => {
    await ask({ question: 'Which?', options: ['ok', 'x'.repeat(500)] });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual(['ok']);
  });

  it('ignores options that are not an array', async () => {
    await ask({ question: 'Which?', options: 'Dana' });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual([]);
  });

  it('trims, so a button label is not padded', async () => {
    await ask({ question: 'Which?', options: ['  Dana Reyes  '] });
    expect(recordAgentQuestion.mock.calls[0][3]).toEqual(['Dana Reyes']);
  });
});

describe('a malformed request', () => {
  it('refuses a body that is not JSON', async () => {
    expect((await ask('not json at all')).status).toBe(400);
  });

  it('refuses an empty question, which is all the user would see', async () => {
    expect((await ask({ question: '   ' })).status).toBe(400);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('refuses a missing question', async () => {
    expect((await ask({ options: ['a', 'b'] })).status).toBe(400);
  });
});
