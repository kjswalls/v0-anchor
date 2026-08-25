import { describe, it, expect, vi } from 'vitest';

/** Real agent-api, fake DB. Proves the in-process dispatch actually runs. */
const created: unknown[] = [];
const updated: unknown[] = [];

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { timezone: 'UTC' } }), maybeSingle: async () => ({ data: { timezone: 'UTC' } }) }) }),
    }),
  }),
  resolveUserIdFromApiKey: async (key: string) => (key === 'good' ? 'user-1' : null),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    createTask: async (userId: string, entity: unknown) => { created.push({ userId, entity }); },
    updateTask: async (id: string, updates: unknown, userId: string) => { updated.push({ id, updates, userId }); },
    deleteTask: async () => {},
    verifyItemOwnership: async () => true,
    validateParentItemId: async () => null,
  };
});

vi.mock('@/app/api/agent/context/route', () => ({
  GET: async (req: Request) => Response.json({ seen: req.url, auth: req.headers.get('authorization') }),
}));

import { POST } from '@/app/api/mcp/route';
import { NextRequest } from 'next/server';

const rpc = (body: unknown, auth = 'Bearer good') =>
  new NextRequest('https://x.test/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify(body),
  });

const call = (name: string, args: Record<string, unknown> = {}, auth = 'Bearer good') =>
  rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, auth);

describe('mcp in-process dispatch (real agent-api)', () => {
  it('create_task reaches the real create handler with a parsed body', async () => {
    const res = await POST(call('anchor_create_task', { title: 'Buy milk' }));
    const json = await res.json();
    console.log('CREATE ->', JSON.stringify(json));
    console.log('created:', JSON.stringify(created));
  });

  it('update_task reaches PATCH with the id param', async () => {
    const res = await POST(call('anchor_update_task', { id: '11111111-1111-4111-8111-111111111111', title: 'x' }));
    console.log('PATCH ->', JSON.stringify(await res.json()));
    console.log('updated:', JSON.stringify(updated));
  });

  it('bad key 401s through the tool result', async () => {
    const res = await POST(call('anchor_create_task', { title: 'x' }, 'Bearer bad'));
    console.log('BADKEY ->', JSON.stringify(await res.json()));
  });

  it('traversal id', async () => {
    const res = await POST(call('anchor_update_task', { id: '../context', title: 'x' }));
    console.log('TRAVERSAL ->', JSON.stringify(await res.json()));
  });

  it('encoded traversal id', async () => {
    const res = await POST(call('anchor_delete_task', { id: '..%2Fcontext' }));
    console.log('ENC ->', JSON.stringify(await res.json()));
  });

  it('notification-only batch → 202 no body', async () => {
    const res = await POST(rpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }]));
    console.log('NOTIF status', res.status, 'body:', await res.text());
  });

  it('empty array batch', async () => {
    const res = await POST(rpc([]));
    console.log('EMPTY BATCH status', res.status, 'body:', await res.text());
  });

  it('tools/list shape', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const j = await res.json();
    console.log('TOOLS n=', j.result.tools.length, 'keys=', Object.keys(j.result));
  });

  it('initialize with no auth at all still lists?', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, 'Bearer totally-invalid'));
    const j = await res.json();
    console.log('UNAUTH TOOLS n=', j.result?.tools?.length);
  });
});
