import { describe, it, expect, vi } from 'vitest';
import {
  dispatch,
  isNotification,
  MCP_PROTOCOL_VERSION,
  RpcError,
  type DispatchDeps,
} from '@/lib/mcp/protocol';

/**
 * Protocol conformance, pinned offline. This server is hand-rolled rather than
 * built on the MCP SDK, so the spec's sharp edges have to be tested rather than
 * inherited — above all that a NOTIFICATION gets no response, which strict
 * clients disconnect over.
 */

const deps = (overrides: Partial<DispatchDeps> = {}): DispatchDeps => ({
  tools: [{ name: 'anchor_ping', description: 'd', inputSchema: { type: 'object' } }],
  serverInfo: { name: 'anchor', version: '1' },
  callTool: vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] })),
  ...overrides,
});

const req = (method: string, params?: Record<string, unknown>, id: unknown = 1) => ({
  jsonrpc: '2.0',
  ...(id === undefined ? {} : { id }),
  method,
  ...(params ? { params } : {}),
});

describe('initialize', () => {
  it('answers with capabilities and server info', async () => {
    const res = await dispatch(req('initialize', { protocolVersion: MCP_PROTOCOL_VERSION }), deps());
    expect(res).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'anchor' },
      },
    });
  });

  it('echoes an older protocol version the client asked for', async () => {
    // Refusing a client pinned one revision back would break it for no reason.
    const res = await dispatch(req('initialize', { protocolVersion: '2024-11-05' }), deps());
    expect((res as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2024-11-05');
  });

  it('falls back to our own version for anything unrecognised', async () => {
    const res = await dispatch(req('initialize', { protocolVersion: 'moon-cheese' }), deps());
    expect((res as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      MCP_PROTOCOL_VERSION
    );
  });

  it('declares only tools — never a capability it cannot serve', async () => {
    const res = await dispatch(req('initialize'), deps());
    const caps = (res as { result: { capabilities: Record<string, unknown> } }).result.capabilities;
    expect(Object.keys(caps)).toEqual(['tools']);
  });
});

describe('notifications', () => {
  it('returns NOTHING for notifications/initialized', async () => {
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps())).toBeNull();
  });

  it('returns nothing for an unknown notification rather than method-not-found', async () => {
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/whatever' }, deps())).toBeNull();
  });

  it('identifies notifications by the absence of id', () => {
    expect(isNotification({ jsonrpc: '2.0', method: 'x' })).toBe(true);
    expect(isNotification({ jsonrpc: '2.0', id: 1, method: 'x' })).toBe(false);
    // id: null is a RESPONSE target, not a notification.
    expect(isNotification({ jsonrpc: '2.0', id: null, method: 'x' })).toBe(false);
  });
});

describe('tools/list', () => {
  it('returns the descriptors', async () => {
    const res = await dispatch(req('tools/list'), deps());
    expect((res as { result: { tools: unknown[] } }).result.tools).toHaveLength(1);
  });
});

describe('tools/call', () => {
  it('calls through and returns the content', async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'done' }] }));
    const res = await dispatch(
      req('tools/call', { name: 'anchor_ping', arguments: { a: 1 } }),
      deps({ callTool })
    );
    expect(callTool).toHaveBeenCalledWith('anchor_ping', { a: 1 });
    expect(res).toMatchObject({ result: { content: [{ type: 'text', text: 'done' }] } });
  });

  it('defaults missing arguments to an empty object', async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text' as const, text: '' }] }));
    await dispatch(req('tools/call', { name: 'anchor_ping' }), deps({ callTool }));
    expect(callTool).toHaveBeenCalledWith('anchor_ping', {});
  });

  it('rejects an unknown tool as invalid params', async () => {
    const res = await dispatch(req('tools/call', { name: 'nope' }), deps());
    expect((res as { error: { code: number } }).error.code).toBe(RpcError.INVALID_PARAMS);
  });

  it('rejects non-object arguments', async () => {
    const res = await dispatch(
      req('tools/call', { name: 'anchor_ping', arguments: [1, 2] }),
      deps()
    );
    expect((res as { error: { code: number } }).error.code).toBe(RpcError.INVALID_PARAMS);
  });

  it('reports a THROWN tool as a tool error, not a protocol error', async () => {
    // The model should see the failure and get to react; a JSON-RPC error
    // deprives it of that.
    const callTool = vi.fn(async () => {
      throw new Error('database on fire');
    });
    const res = await dispatch(
      req('tools/call', { name: 'anchor_ping' }),
      deps({ callTool })
    );
    expect(res).toMatchObject({
      result: { isError: true, content: [{ type: 'text', text: 'database on fire' }] },
    });
    expect((res as { error?: unknown }).error).toBeUndefined();
  });
});

describe('protocol errors', () => {
  it('rejects a non-object message', async () => {
    expect((await dispatch('hello', deps()))!.error!.code).toBe(RpcError.INVALID_REQUEST);
  });

  it('rejects the wrong jsonrpc version', async () => {
    const res = await dispatch({ jsonrpc: '1.0', id: 1, method: 'ping' }, deps());
    expect(res!.error!.code).toBe(RpcError.INVALID_REQUEST);
  });

  it('returns method-not-found for an unknown request', async () => {
    const res = await dispatch(req('resources/list'), deps());
    expect(res!.error!.code).toBe(RpcError.METHOD_NOT_FOUND);
  });

  it('answers ping with an empty result', async () => {
    expect(await dispatch(req('ping'), deps())).toMatchObject({ result: {} });
  });

  it('preserves a string id, which some clients use', async () => {
    const res = await dispatch(req('ping', undefined, 'abc'), deps());
    expect(res!.id).toBe('abc');
  });
});
