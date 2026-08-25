import { describe, it, expect, vi } from 'vitest';

// The module reaches user_secrets through the service client, which throws
// without server env vars. Only the pure wire-format helpers are under test
// here, so the client is stubbed rather than configured.
vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: vi.fn(() => {
    throw new Error('not used in these tests');
  }),
}));

import {
  assertAllowedGatewayUrl,
  chatSessionKey,
  deltaFromChunk,
  gatewayTurnMessages,
  itemSessionKey,
  translateGatewayStream,
} from '@/lib/openclaw-gateway';
import { parseSseFrames } from '@/lib/sse';

/**
 * This is the one place that knows the gateway's OpenAI-compatible wire shape,
 * and it is also the one piece of the transport that cannot be verified against
 * a real gateway from CI — so the translation is pinned here instead.
 */

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

/** Runs the translator and reads the result back through Anchor's own parser. */
async function translated(...chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const frame of parseSseFrames(translateGatewayStream(streamOf(...chunks)))) {
    if (frame.content !== undefined) out.push(frame.content);
  }
  return out;
}

const chunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe('deltaFromChunk', () => {
  it('pulls the incremental text out of an OpenAI-shaped chunk', () => {
    expect(deltaFromChunk({ choices: [{ delta: { content: 'hi' } }] })).toBe('hi');
  });

  it('returns empty for the shapes a stream legitimately contains', () => {
    // Role-only openers, finish chunks, usage chunks and keepalives all arrive
    // with no content and must not become empty frames downstream.
    expect(deltaFromChunk({ choices: [{ delta: { role: 'assistant' } }] })).toBe('');
    expect(deltaFromChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] })).toBe('');
    expect(deltaFromChunk({ choices: [] })).toBe('');
    expect(deltaFromChunk({ usage: { total_tokens: 12 } })).toBe('');
  });

  it('survives malformed payloads instead of throwing mid-stream', () => {
    expect(deltaFromChunk(null)).toBe('');
    expect(deltaFromChunk('nope')).toBe('');
    expect(deltaFromChunk({ choices: [{ delta: { content: 42 } }] })).toBe('');
    expect(deltaFromChunk({ choices: 'not-an-array' })).toBe('');
  });
});

describe('translateGatewayStream', () => {
  it('turns gateway chunks into Anchor frames', async () => {
    expect(await translated(chunk('Hel'), chunk('lo'), 'data: [DONE]\n\n')).toEqual(['Hel', 'lo']);
  });

  it('reassembles chunks split across network boundaries', async () => {
    const whole = chunk('split');
    const cut = Math.floor(whole.length / 2);
    expect(await translated(whole.slice(0, cut), whole.slice(cut))).toEqual(['split']);
  });

  it('drops content-free chunks rather than emitting empty frames', async () => {
    const opener = `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`;
    const closer = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`;
    expect(await translated(opener, chunk('real'), closer, 'data: [DONE]\n\n')).toEqual(['real']);
  });

  it('skips unparseable lines and keeps going', async () => {
    expect(await translated('data: {oops\n\n', chunk('fine'), 'data: [DONE]\n\n')).toEqual(['fine']);
  });

  it('always terminates with [DONE], even when the gateway does not send one', async () => {
    // Anchor's client parser stops on [DONE]; without one it would read to EOF.
    const decoder = new TextDecoder();
    const stream = translateGatewayStream(streamOf(chunk('a')));
    const reader = stream.getReader();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    expect(text.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('emits a trailing chunk that arrived without its newline', async () => {
    expect(await translated(chunk('a').trimEnd())).toEqual(['a']);
  });

  it('passes content through verbatim, including markdown and newlines', async () => {
    const messy = '## Heading\n\n- item "quoted"\n\n```js\nconst a = 1;\n```';
    expect(await translated(chunk(messy), 'data: [DONE]\n\n')).toEqual([messy]);
  });
});

describe('session keys', () => {
  it('namespaces every key under anchor: — subagent:, cron: and acp: are reserved', () => {
    expect(chatSessionKey('u1')).toBe('anchor:u:u1:chat');
    expect(itemSessionKey('u1', 'abc-123')).toBe('anchor:u:u1:item:abc-123');
  });

  it('is stable across calls, which is what makes a thread durable', () => {
    expect(itemSessionKey('u1', 'x')).toBe(itemSessionKey('u1', 'x'));
  });

  it('separates users, so one browser can never address another thread', () => {
    expect(chatSessionKey('u1')).not.toBe(chatSessionKey('u2'));
  });

  it('cannot be pushed into a reserved namespace by hostile input', () => {
    // Keys are built from a fixed literal, so even an id that looks like a
    // reserved prefix stays under anchor:. This is why nothing accepts a
    // caller-supplied session key.
    for (const hostile of ['subagent:evil', 'cron:evil', 'acp:evil', '../../cron:evil']) {
      expect(chatSessionKey(hostile).startsWith('anchor:')).toBe(true);
      expect(itemSessionKey('u1', hostile).startsWith('anchor:')).toBe(true);
    }
  });
});

describe('assertAllowedGatewayUrl', () => {
  it('accepts an https gateway', () => {
    expect(assertAllowedGatewayUrl('https://gw.example.ts.net')).toEqual({
      ok: true,
      url: 'https://gw.example.ts.net',
    });
  });

  it('strips a trailing slash so path concatenation stays correct', () => {
    const result = assertAllowedGatewayUrl('https://gw.example.ts.net/');
    expect(result).toMatchObject({ ok: true, url: 'https://gw.example.ts.net' });
  });

  it('blocks the cloud metadata range', () => {
    // A server-side fetch of 169.254.169.254 would hand over instance credentials.
    expect(assertAllowedGatewayUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
    expect(assertAllowedGatewayUrl('https://169.254.169.254').ok).toBe(false);
  });

  it('blocks the IPv4-mapped IPv6 form of the metadata address', () => {
    // The WHATWG parser normalises decimal/octal/hex/trailing-dot IPv4 back to
    // dotted quad, but NOT this form — and it reaches the same address.
    expect(assertAllowedGatewayUrl('https://[::ffff:169.254.169.254]').ok).toBe(false);
    expect(assertAllowedGatewayUrl('https://[::ffff:a9fe:a9fe]').ok).toBe(false);
  });

  it('blocks the trailing-dot spelling of a metadata host', () => {
    expect(assertAllowedGatewayUrl('https://169.254.169.254.').ok).toBe(false);
  });

  it('catches the octal spelling, which the URL parser folds to a dotted quad', () => {
    expect(assertAllowedGatewayUrl('https://0251.0376.0251.0376').ok).toBe(false);
  });

  it('blocks the whole link-local /16, not just the famous address', () => {
    expect(assertAllowedGatewayUrl('https://169.254.1.1').ok).toBe(false);
    expect(assertAllowedGatewayUrl('https://[::ffff:169.254.1.1]').ok).toBe(false);
  });

  it('refuses credentials embedded in the URL', () => {
    // user_settings is browser-readable; a token in the URL would land there.
    const result = assertAllowedGatewayUrl('https://anchor:sekrit@gw.example.ts.net:8787');
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/token field/);
  });

  it('allows private and Tailscale ranges — that is the intended deployment', () => {
    expect(assertAllowedGatewayUrl('https://100.101.102.103:8787').ok).toBe(true);
    expect(assertAllowedGatewayUrl('https://192.168.1.50:8787').ok).toBe(true);
  });

  it('requires https except on loopback in development', () => {
    expect(assertAllowedGatewayUrl('http://gw.example.com').ok).toBe(false);
    expect(assertAllowedGatewayUrl('http://localhost:8787').ok).toBe(true);
    expect(assertAllowedGatewayUrl('http://127.0.0.1:8787').ok).toBe(true);
  });

  it('rejects non-http schemes and junk', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://x.com', 'javascript:alert(1)', 'not a url', '']) {
      expect(assertAllowedGatewayUrl(bad).ok).toBe(false);
    }
  });
});

describe('gatewayTurnMessages', () => {
  const messages = [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'first' },
    { role: 'assistant' as const, content: 'reply' },
    { role: 'user' as const, content: 'newest' },
  ];

  it('sends the system prompt plus only the newest turn', () => {
    // The gateway session already holds the history; resending it would make
    // the model see every message twice. See SEND_FULL_TRANSCRIPT_TO_GATEWAY.
    expect(gatewayTurnMessages(messages)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'newest' },
    ]);
  });

  it('handles a first turn with no history', () => {
    expect(gatewayTurnMessages([messages[0], messages[1]])).toEqual([messages[0], messages[1]]);
  });
});
