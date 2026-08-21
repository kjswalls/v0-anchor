import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChannelSecretsStore } from '@/lib/channel-secrets-store';

/**
 * The store that holds which credentials are SET and never what they are.
 *
 * Two properties are worth pinning: it can never come to hold a value (that is
 * the whole reason user_secrets is service-role only), and its writes are
 * serialised (the route merges each PUT into one jsonb with a read-modify-write,
 * so two in flight together silently lose one).
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useChannelSecretsStore.getState().reset();
  vi.unstubAllGlobals();
});

describe('hydrate', () => {
  it('records which keys are set, and nothing else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ secrets: { 'phone-call': ['authToken'] } }))),
    );
    await useChannelSecretsStore.getState().hydrate('u1');

    const state = useChannelSecretsStore.getState();
    expect(state.isSet('phone-call', 'authToken')).toBe(true);
    expect(state.isSet('phone-call', 'accountSid')).toBe(false);
    // There is nowhere for a value to live, by construction: the shape is
    // slug -> key NAMES, and the route never sends more than that.
    expect(state.setKeys).toEqual({ 'phone-call': ['authToken'] });
  });

  it('latches unavailable when migration 030 has not landed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unavailable: true }))));
    await useChannelSecretsStore.getState().hydrate('u1');
    expect(useChannelSecretsStore.getState().available).toBe(false);
  });

  // A blip must not read as a missing migration, and must stay retryable.
  it('leaves availability alone on a transient failure and re-arms', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await useChannelSecretsStore.getState().hydrate('u1');

    const state = useChannelSecretsStore.getState();
    expect(state.available).toBe(true);
    expect(state.hydratedUserId).toBeNull();
  });
});

describe('setSecret', () => {
  it('marks a key set immediately, then reconciles with the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, set: ['authToken'] }))),
    );
    useChannelSecretsStore.getState().setSecret('phone-call', 'authToken', 'tok_123');
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'authToken')).toBe(true);

    await flush();
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'authToken')).toBe(true);
  });

  it('rolls back when the server rejects the write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })));
    useChannelSecretsStore.getState().setSecret('phone-call', 'authToken', 'tok_123');
    await flush();
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'authToken')).toBe(false);
  });

  it('clears a key when handed an empty value', async () => {
    useChannelSecretsStore.setState({ setKeys: { 'phone-call': ['authToken'] } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, set: [] }))));

    useChannelSecretsStore.getState().setSecret('phone-call', 'authToken', '');
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'authToken')).toBe(false);

    // Writes are queued, so the request is made a microtask later.
    await flush();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(call.body as string).values).toEqual({ authToken: null });
  });

  // Tabbing from Account SID straight to Auth token fires two blurs back to
  // back, and the route merges each PUT into the whole jsonb with a
  // read-modify-write — so overlapping requests silently lose one.
  it('never has two writes in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return new Response(JSON.stringify({ ok: true, set: ['accountSid', 'authToken'] }));
      }),
    );

    const store = useChannelSecretsStore.getState();
    store.setSecret('phone-call', 'accountSid', 'AC1');
    store.setSecret('phone-call', 'authToken', 'tok');

    await new Promise((r) => setTimeout(r, 40));
    expect(maxInFlight).toBe(1);
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'accountSid')).toBe(true);
    expect(useChannelSecretsStore.getState().isSet('phone-call', 'authToken')).toBe(true);
  });
});
