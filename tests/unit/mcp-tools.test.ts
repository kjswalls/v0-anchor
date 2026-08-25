import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, TOOL_DESCRIPTORS, toolByName } from '@/lib/mcp/tools';

/**
 * Tool planning is pure: arguments in, "which agent endpoint" out. Executing
 * the plan is the route's job, and every rule about WHAT a write may do stays
 * in lib/agent-api.ts. These tests pin the mapping and the refusals — the two
 * things that would otherwise silently drift from the agent API.
 */

const plan = (name: string, args: Record<string, unknown> = {}) => toolByName(name)!.plan(args);

describe('the tool surface', () => {
  it('exposes descriptors without leaking the plan functions', () => {
    for (const d of TOOL_DESCRIPTORS) {
      expect(Object.keys(d).sort()).toEqual(['description', 'inputSchema', 'name']);
    }
  });

  it('names every tool anchor_*, since they share a namespace with other servers', () => {
    for (const t of MCP_TOOLS) expect(t.name).toMatch(/^anchor_[a-z_]+$/);
  });

  it('gives every tool an object input schema that refuses unknown keys', () => {
    for (const t of MCP_TOOLS) {
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(t.inputSchema.additionalProperties, t.name).toBe(false);
    }
  });

  it('writes descriptions long enough to steer a model', () => {
    for (const t of MCP_TOOLS) expect(t.description.length, t.name).toBeGreaterThan(60);
  });

  it('has unique names', () => {
    expect(new Set(MCP_TOOLS.map((t) => t.name)).size).toBe(MCP_TOOLS.length);
  });
});

describe('items', () => {
  it('reads context with a GET and no body', () => {
    expect(plan('anchor_get_context')).toEqual({ method: 'GET', path: '/api/agent/context' });
  });

  it('creates a task', () => {
    expect(plan('anchor_create_task', { title: 'Book dentist', startDate: '2026-08-06' })).toEqual({
      method: 'POST',
      path: '/api/agent/tasks',
      body: { title: 'Book dentist', startDate: '2026-08-06' },
    });
  });

  it('refuses a create with no title rather than posting an empty one', () => {
    expect(plan('anchor_create_task', {})).toMatchObject({ error: expect.stringContaining('title') });
    expect(plan('anchor_create_task', { title: '   ' })).toMatchObject({ error: expect.any(String) });
  });

  it('drops keys the endpoint does not accept', () => {
    // Zod strips unknown keys server-side and returns a lying 200; not sending
    // them is how the model finds out.
    const result = plan('anchor_update_task', { id: 'x', title: 'New', bogus: 1 }) as {
      body: Record<string, unknown>;
    };
    expect(result.body).toEqual({ title: 'New' });
  });

  it('puts the id in the path, never the body', () => {
    expect(plan('anchor_update_task', { id: 'abc', priority: 'high' })).toEqual({
      method: 'PATCH',
      path: '/api/agent/tasks/abc',
      body: { priority: 'high' },
    });
    expect(plan('anchor_delete_task', { id: 'abc' })).toEqual({
      method: 'DELETE',
      path: '/api/agent/tasks/abc',
    });
  });

  it('routes habits to their own endpoints', () => {
    expect(plan('anchor_create_habit', { title: 'Stretch', group: 'Health' })).toEqual({
      method: 'POST',
      path: '/api/agent/habits',
      body: { title: 'Stretch', group: 'Health' },
    });
    expect(plan('anchor_update_habit', { id: 'h1', completedDates: ['2026-08-06'] })).toEqual({
      method: 'PATCH',
      path: '/api/agent/habits/h1',
      body: { completedDates: ['2026-08-06'] },
    });
  });

  it('tells the model, in the tool text, how to complete a recurring item', () => {
    // The single most common way to corrupt a series is status-instead-of-date.
    expect(toolByName('anchor_update_task')!.description).toMatch(/completedDates/);
    expect(toolByName('anchor_update_habit')!.description).toMatch(/completedDates/);
  });
});

describe('pause', () => {
  it('pauses with an exclusive return date', () => {
    expect(plan('anchor_pause', { kind: 'habit', id: 'h1', paused: true, until: '2026-08-10' })).toEqual({
      method: 'PATCH',
      path: '/api/agent/habits/h1',
      body: { paused: true, pausedUntil: '2026-08-10' },
    });
  });

  it('resumes without a date', () => {
    expect(plan('anchor_pause', { kind: 'task', id: 't1', paused: false })).toEqual({
      method: 'PATCH',
      path: '/api/agent/tasks/t1',
      body: { paused: false },
    });
  });

  it('refuses a resume that carries a date, rather than silently dropping it', () => {
    expect(
      plan('anchor_pause', { kind: 'task', id: 't1', paused: false, until: '2026-08-10' })
    ).toMatchObject({ error: expect.stringContaining('only valid when pausing') });
  });

  it('refuses a kind that has no pause verb', () => {
    // Programs use `state`, not pause.
    expect(plan('anchor_pause', { kind: 'program', id: 'p1', paused: true })).toMatchObject({
      error: expect.stringContaining('kind must be one of'),
    });
  });

  it('requires paused to be a boolean', () => {
    expect(plan('anchor_pause', { kind: 'task', id: 't1', paused: 'yes' })).toMatchObject({
      error: expect.any(String),
    });
  });
});

describe('collections', () => {
  it('creates each kind at its own endpoint', () => {
    expect(plan('anchor_create_collection', { kind: 'routine', name: 'Morning' })).toMatchObject({
      method: 'POST',
      path: '/api/agent/routines',
    });
    expect(plan('anchor_create_collection', { kind: 'program', name: 'Marathon block' })).toMatchObject({
      path: '/api/agent/programs',
    });
    expect(plan('anchor_create_collection', { kind: 'goal', name: 'Run a 10k' })).toMatchObject({
      path: '/api/agent/goals',
    });
  });

  it('REFUSES keys a kind does not take instead of stripping them', () => {
    // Silently dropping milestoneIds off a routine is how a model concludes it
    // created milestones it did not.
    const result = plan('anchor_create_collection', {
      kind: 'routine',
      name: 'Morning',
      milestoneIds: ['a'],
    });
    expect(result).toMatchObject({ error: expect.stringContaining('does not take') });
    expect((result as { error: string }).error).toMatch(/milestoneIds/);
  });

  it('names what the kind DOES accept in the refusal', () => {
    const result = plan('anchor_create_collection', { kind: 'goal', name: 'x', routineIds: ['a'] });
    expect((result as { error: string }).error).toMatch(/memberIds/);
  });

  it('allows each kind its own keys', () => {
    expect(
      plan('anchor_create_collection', {
        kind: 'goal',
        name: 'Run a 10k',
        why: 'because',
        milestoneIds: ['m1'],
        targetOn: '2026-12-01',
      })
    ).toMatchObject({ method: 'POST', path: '/api/agent/goals' });
    expect(
      plan('anchor_update_collection', { kind: 'program', id: 'p1', routineIds: ['r1'], state: 'active' })
    ).toMatchObject({ method: 'PATCH', path: '/api/agent/programs/p1' });
  });

  it('warns in the tool text that membership replaces rather than appends', () => {
    expect(toolByName('anchor_update_collection')!.description).toMatch(/REPLACE|replace/);
  });

  it('refuses an unknown kind', () => {
    expect(plan('anchor_create_collection', { kind: 'sprocket', name: 'x' })).toMatchObject({
      error: expect.stringContaining('kind must be one of'),
    });
    expect(plan('anchor_delete_collection', { kind: 'sprocket', id: 'x' })).toMatchObject({
      error: expect.any(String),
    });
  });

  it('requires an id to update or delete', () => {
    expect(plan('anchor_update_collection', { kind: 'goal' })).toMatchObject({ error: expect.any(String) });
    expect(plan('anchor_delete_collection', { kind: 'goal' })).toMatchObject({ error: expect.any(String) });
  });
});
