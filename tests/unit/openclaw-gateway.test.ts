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
  deltaFromChunk,
  sessionKeyFor,
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

describe('sessionKeyFor', () => {
  it('uses the anchor: namespace — subagent:, cron: and acp: are reserved', () => {
    expect(sessionKeyFor('chat')).toBe('anchor:chat');
    expect(sessionKeyFor('item', 'abc-123')).toBe('anchor:item:abc-123');
  });

  it('is stable across calls, which is what makes a thread durable', () => {
    expect(sessionKeyFor('item', 'x')).toBe(sessionKeyFor('item', 'x'));
  });
});
