import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST/DELETE /api/agent/register — where the user says "send my item data
 * here".
 *
 * That framing is the whole review of this route. Anchor POSTs the contents of
 * every mutated item to `webhookUrl`, from registration until revocation, from
 * every instance. So the URL is exactly as dangerous as the gateway URL —
 * `assertAllowedGatewayUrl` exists in this repo for that class and is applied
 * on the way IN, with a comment saying a URL the server makes outbound requests
 * to never gets stored unchecked. This path stored it unchecked.
 *
 * And revocation is the one operation whose failure must be visible: a
 * swallowed delete leaves every other instance reading the row and delivering
 * to a webhook the user took away, having been told it worked.
 */

const registerPlugin = vi.fn(async () => ({ ok: true, durable: true }));
const deregisterPlugin = vi.fn(async () => ({ ok: true, durable: true }));
let resolvedUser: string | null = 'u1';

vi.mock('@/lib/openclaw-registry', () => ({
  registerPlugin: (...a: unknown[]) => registerPlugin(...(a as [])),
  deregisterPlugin: (...a: unknown[]) => deregisterPlugin(...(a as [])),
}));

vi.mock('@/lib/supabase-service', () => ({
  resolveUserIdFromApiKey: async () => resolvedUser,
  createServiceClient: () => ({
    from: () => ({ upsert: async () => ({ error: null }) }),
  }),
}));

import { POST, DELETE } from '@/app/api/agent/register/route';

const post = (body: unknown, auth = 'Bearer anchor_key') =>
  POST(
    new Request('http://localhost/api/agent/register', {
      method: 'POST',
      headers: auth ? { authorization: auth, 'content-type': 'application/json' } : {},
      body: JSON.stringify(body),
    }) as never
  );

const del = (body: unknown) =>
  DELETE(
    new Request('http://localhost/api/agent/register', {
      method: 'DELETE',
      headers: { authorization: 'Bearer anchor_key', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );

const hook = (over: Record<string, unknown> = {}) => ({
  pluginId: 'anchor-context',
  webhookUrl: 'https://gateway.example/hook',
  events: ['tasks.updated'],
  ...over,
});

beforeEach(() => {
  registerPlugin.mockClear();
  registerPlugin.mockResolvedValue({ ok: true, durable: true });
  deregisterPlugin.mockClear();
  deregisterPlugin.mockResolvedValue({ ok: true, durable: true });
  resolvedUser = 'u1';
});

describe('where item data may be sent', () => {
  it('accepts an ordinary https listener', async () => {
    expect((await post(hook())).status).toBe(200);
    expect(registerPlugin).toHaveBeenCalledTimes(1);
  });

  it('accepts plain http on a tailnet, which is the ordinary deployment', async () => {
    // The gateway URL demands TLS because it carries an operator token. A
    // plugin listener is reached over a tunnel that already encrypts it, so
    // requiring TLS here would reject the normal setup.
    expect((await post(hook({ webhookUrl: 'http://100.64.1.5:8080/hook' }))).status).toBe(200);
  });

  it('refuses the cloud metadata address', async () => {
    // Durable SSRF: persisted, and replayed by every instance on every
    // mutation, with the user's item data in the body.
    const res = await post(hook({ webhookUrl: 'http://169.254.169.254/' }));
    expect(res.status).toBe(400);
    expect(registerPlugin).not.toHaveBeenCalled();
  });

  it('refuses the spellings that hide it', async () => {
    for (const webhookUrl of [
      'http://[::ffff:169.254.169.254]/',
      'http://[64:ff9b::a9fe:a9fe]/',
      'http://metadata.google.internal/',
    ]) {
      expect((await post(hook({ webhookUrl }))).status, webhookUrl).toBe(400);
    }
    expect(registerPlugin).not.toHaveBeenCalled();
  });

  it('refuses a non-http scheme', async () => {
    expect((await post(hook({ webhookUrl: 'file:///etc/passwd' }))).status).toBe(400);
  });

  it('refuses credentials smuggled into the URL', async () => {
    expect((await post(hook({ webhookUrl: 'https://user:pw@example.com/h' }))).status).toBe(400);
  });
});

describe('what counts as a webhook registration', () => {
  it('refuses events sent as a bare string', async () => {
    /**
     * `events?.length` is truthy for a STRING, so this passed the old check,
     * reached a `text[]` column and failed the insert — while appearing to work
     * locally, because "tasks.updated".includes("tasks.updated") is true
     * against the in-memory copy. It delivered until the next cold start and
     * then silently stopped.
     */
    const res = await post(hook({ events: 'tasks.updated' }));
    expect(res.status).toBe(400);
    expect(registerPlugin).not.toHaveBeenCalled();
  });

  it('refuses an array with a non-string in it', async () => {
    expect((await post(hook({ events: ['tasks.updated', 42] }))).status).toBe(400);
  });

  it('refuses an empty event list, which would subscribe to nothing', async () => {
    expect((await post(hook({ events: [] }))).status).toBe(400);
  });

  it('refuses without a pluginId', async () => {
    expect((await post(hook({ pluginId: undefined }))).status).toBe(400);
  });

  it('refuses without a bearer token', async () => {
    expect((await post(hook(), '')).status).toBe(401);
  });
});

describe('telling the truth about the write', () => {
  it('reports a failed persist rather than returning ok', async () => {
    // Returning ok leaves the plugin registered only in one instance's
    // memory — the exact bug the table exists to fix, now silent.
    registerPlugin.mockResolvedValue({ ok: false, reason: 'insert failed' } as never);
    const res = await post(hook());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('says when a registration is memory-only, instead of just "ok"', async () => {
    registerPlugin.mockResolvedValue({ ok: true, durable: false } as never);
    const body = await (await post(hook())).json();
    expect(body.ok).toBe(true);
    expect(body.durable).toBe(false);
  });

  it('marks a persisted registration durable', async () => {
    expect((await (await post(hook())).json()).durable).toBe(true);
  });
});

describe('revoking', () => {
  it('removes the registration', async () => {
    expect((await del({ pluginId: 'anchor-context' })).status).toBe(200);
    expect(deregisterPlugin).toHaveBeenCalledWith('u1', 'anchor-context');
  });

  it('reports a failed revocation rather than claiming success', async () => {
    // The user is taking away where their data goes. Every other instance
    // keeps reading the row until it is actually gone.
    deregisterPlugin.mockResolvedValue({ ok: false, reason: 'could not reach the store' } as never);
    const res = await del({ pluginId: 'anchor-context' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/could not reach/i);
  });

  it('refuses without a pluginId rather than deleting nothing quietly', async () => {
    expect((await del({})).status).toBe(400);
    expect(deregisterPlugin).not.toHaveBeenCalled();
  });
});
