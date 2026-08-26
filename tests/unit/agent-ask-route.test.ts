import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/agent/items/:id/ask — the agent asks something answerable in a tap.
 *
 * Two things carry the weight here. First, the service client bypasses RLS, so
 * the ownership check is the ONLY thing between an api key and writing into
 * another account's item. Second, the block and the question are one call on
 * purpose: a question with no block renders nowhere (nothing shows a reply box
 * unless `aiStatus` is `blocked`), and a block with no question is just the old
 * text-box behaviour — so splitting them across two tool calls would make the
 * half-done state reachable every time a run died in between.
 */

const recordAgentQuestion = vi.fn();
let owner: { user_id: string; type: string } | null = { user_id: 'u1', type: 'task' };
let updateError: { message: string } | null = null;
const updates: Array<Record<string, unknown>> = [];
let resolvedUser: string | null = 'u1';

vi.mock('@/lib/db', () => ({
  MAX_QUESTION_OPTIONS: 4,
  recordAgentQuestion: (...args: unknown[]) => recordAgentQuestion(...args),
}));

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: async () => ({ data: owner }) }),
          eq: () => ({ maybeSingle: async () => ({ data: owner }) }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push({ table, ...patch });
        return { eq: () => ({ eq: async () => ({ error: updateError }) }) };
      },
    }),
  }),
  resolveUserIdFromApiKey: async () => resolvedUser,
}));

import { POST } from '@/app/api/agent/items/[id]/ask/route';

const ask = (body: unknown, auth = 'Bearer anchor_key', id = 'item-1') =>
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
  updates.length = 0;
  owner = { user_id: 'u1', type: 'task' };
  updateError = null;
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
    expect(updates).toHaveLength(0);
  });

  it('refuses another account item, and says nothing about its existence', async () => {
    owner = { user_id: 'someone-else', type: 'task' };
    const res = await ask({ question: 'Which Dana?' });
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
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

    expect(updates[0]).toMatchObject({ ai_status: 'blocked', ai_result: 'Which Dana?' });
    expect(recordAgentQuestion).toHaveBeenCalledWith(
      'item-1',
      'task',
      'Which Dana?',
      ['Reyes', 'Whitfield'],
      'u1',
      expect.anything()
    );
  });

  it('records nothing if the status flip failed', async () => {
    // A question against an item that is not blocked renders nowhere and would
    // sit in the trail unanswered forever. Failing outright is the honest one.
    updateError = { message: 'boom' };
    const res = await ask({ question: 'Which Dana?' });
    expect(res.status).toBe(500);
    expect(recordAgentQuestion).not.toHaveBeenCalled();
  });

  it('passes the userId explicitly, since the service path has no auth context', async () => {
    // item_events.user_id defaults to auth.uid(), which is null here.
    await ask({ question: 'Which Dana?' });
    expect(recordAgentQuestion.mock.calls[0][4]).toBe('u1');
  });

  it('uses the item own type, not an assumed one', async () => {
    owner = { user_id: 'u1', type: 'errand' };
    await ask({ question: 'Which one?' });
    expect(recordAgentQuestion.mock.calls[0][1]).toBe('errand');
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
    expect(updates).toHaveLength(0);
  });

  it('refuses a missing question', async () => {
    expect((await ask({ options: ['a', 'b'] })).status).toBe(400);
  });
});
