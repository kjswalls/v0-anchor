import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, TOOL_DESCRIPTORS, selectAssignedWork, toolByName } from '@/lib/mcp/tools';

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

describe('delegation — the pull loop', () => {
  it('reports progress against the item, with the pinned status vocabulary', () => {
    expect(plan('anchor_report_progress', { id: 't1', status: 'working' })).toEqual({
      method: 'PATCH',
      path: '/api/agent/tasks/t1',
      body: { aiStatus: 'working' },
    });
  });

  it('carries the result text, which is what the user actually reads', () => {
    expect(
      plan('anchor_report_progress', { id: 't1', status: 'done', result: 'Booked for Thu 10am.' })
    ).toMatchObject({ body: { aiStatus: 'done', aiResult: 'Booked for Thu 10am.' } });
  });

  it('refuses a status outside the vocabulary rather than inventing one', () => {
    // aiStatus is a frozen contract the moment a real agent writes it.
    expect(plan('anchor_report_progress', { id: 't1', status: 'in-progress' })).toMatchObject({
      error: expect.stringContaining('status must be one of'),
    });
  });

  it('requires an id and a status', () => {
    expect(plan('anchor_report_progress', { status: 'done' })).toMatchObject({ error: expect.any(String) });
    expect(plan('anchor_report_progress', { id: 't1' })).toMatchObject({ error: expect.any(String) });
  });

  it('teaches the blocked-means-ask-the-user rule in the tool text', () => {
    const description = toolByName('anchor_report_progress')!.description;
    expect(description).toMatch(/blocked/);
    expect(description).toMatch(/question/i);
  });

  it('can write the delegation fields through the ordinary update tool too', () => {
    expect(
      plan('anchor_update_task', { id: 't1', assignee: 'openclaw', aiStatus: 'queued' })
    ).toMatchObject({ body: { assignee: 'openclaw', aiStatus: 'queued' } });
  });
});

describe('selectAssignedWork', () => {
  const task = (over: Record<string, unknown>) => ({
    type: 'task',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
    ...over,
  });

  const context = {
    fetchedAt: '2026-08-25T09:00:00.000Z',
    userTimezone: 'Europe/London',
    items: [
      task({ id: 'a', title: 'Book dentist', assignee: 'openclaw', aiStatus: 'queued' }),
      task({ id: 'b', title: 'Mine' }),
      task({ id: 'c', title: 'Finished', assignee: 'openclaw', aiStatus: 'done', aiResult: 'ok' }),
      task({ id: 'd', title: 'Stuck', assignee: 'openclaw', aiStatus: 'blocked' }),
      task({ id: 'e', title: 'No status yet', assignee: 'openclaw' }),
    ],
  };

  it('returns only work that was handed to an agent', () => {
    const { assigned } = selectAssignedWork(context);
    expect(assigned.map((i) => i.id)).not.toContain('b');
  });

  it('defaults to open work — a queue, not a history', () => {
    const { assigned } = selectAssignedWork(context);
    expect(assigned.map((i) => i.id).sort()).toEqual(['a', 'd', 'e']);
  });

  it('treats a missing aiStatus as queued rather than dropping it', () => {
    // An item assigned through the UI has no status until a worker claims it.
    expect(selectAssignedWork(context).assigned.some((i) => i.id === 'e')).toBe(true);
  });

  it('includes finished work only when asked', () => {
    const { assigned } = selectAssignedWork(context, { includeFinished: true });
    expect(assigned.map((i) => i.id).sort()).toEqual(['a', 'c', 'd', 'e']);
  });

  it('keeps the timezone and fetch time, which a scheduled worker needs', () => {
    const result = selectAssignedWork(context);
    expect(result.userTimezone).toBe('Europe/London');
    expect(result.fetchedAt).toBe('2026-08-25T09:00:00.000Z');
  });

  it('carries the result text back so a worker can resume its own thread', () => {
    const { assigned } = selectAssignedWork(context, { includeFinished: true });
    expect(assigned.find((i) => i.id === 'c')?.aiResult).toBe('ok');
  });

  it('never serves a custom-type item — reporting on one would 404 forever', () => {
    // /api/agent/tasks/:id filters on .eq('type','task'), and the agent write
    // API does not expose custom types at all, so serving one here would be a
    // dead loop: visible work that can never be reported on.
    const { assigned } = selectAssignedWork({
      fetchedAt: '2026-08-25T09:00:00.000Z',
      items: [
        { id: 'g', title: 'Goal work', type: 'custom', customType: 'goal', assignee: 'openclaw', status: 'pending' },
      ],
    });
    expect(assigned).toHaveLength(0);
  });

  it('never serves a habit either', () => {
    const { assigned } = selectAssignedWork({
      fetchedAt: '2026-08-25T09:00:00.000Z',
      items: [{ id: 'h', title: 'Stretch', type: 'habit', assignee: 'openclaw', status: 'pending' }],
    });
    expect(assigned).toHaveLength(0);
  });

  it('drops work the user has since completed or cancelled', () => {
    // aiStatus alone would still say "queued" — the app has ONE definition of
    // "does this want doing" and this is not allowed to invent a second.
    const { assigned } = selectAssignedWork({
      fetchedAt: '2026-08-25T09:00:00.000Z',
      items: [
        task({ id: 'done', title: 'Already done', assignee: 'openclaw', aiStatus: 'queued', status: 'completed' }),
        task({ id: 'gone', title: 'Cancelled', assignee: 'openclaw', aiStatus: 'queued', status: 'cancelled' }),
        task({ id: 'live', title: 'Still open', assignee: 'openclaw', aiStatus: 'queued' }),
      ],
    });
    expect(assigned.map((i) => i.id)).toEqual(['live']);
  });

  it('drops work a paused routine has switched off today', () => {
    const { assigned } = selectAssignedWork({
      fetchedAt: '2026-08-25T09:00:00.000Z',
      userTimezone: 'UTC',
      routines: [
        { id: 'r1', name: 'Term time', itemIds: ['paused'], pausedAt: '2026-08-01T00:00:00.000Z', pausedUntil: '2026-12-01' },
      ],
      items: [
        task({ id: 'paused', title: 'Out of season', assignee: 'openclaw', aiStatus: 'queued' }),
        task({ id: 'live', title: 'Still open', assignee: 'openclaw', aiStatus: 'queued' }),
      ],
    });
    expect(assigned.map((i) => i.id)).toEqual(['live']);
  });

  it('survives a response that is missing, empty or the wrong shape', () => {
    expect(selectAssignedWork(undefined).assigned).toEqual([]);
    expect(selectAssignedWork({}).assigned).toEqual([]);
    expect(selectAssignedWork({ items: 'nope' }).assigned).toEqual([]);
    expect(selectAssignedWork({ items: [null, 3, 'x'] }).assigned).toEqual([]);
  });
});

describe('anchor_item_activity — the reply channel', () => {
  it('reads one item\'s trail', () => {
    expect(plan('anchor_item_activity', { id: 't1' })).toEqual({
      method: 'GET',
      path: '/api/agent/items/t1/events',
    });
  });

  it('requires an id', () => {
    expect(plan('anchor_item_activity', {})).toMatchObject({ error: expect.any(String) });
  });

  it('tells the agent where a blocked answer shows up', () => {
    // Without this steer the agent marks something blocked and never looks back.
    const description = toolByName('anchor_item_activity')!.description;
    expect(description).toMatch(/agent_reply/);
    expect(toolByName('anchor_my_work')!.description).toMatch(/anchor_item_activity/);
  });
});

describe('what the worker is given', () => {
  it('carries the fields it needs to act without a second round-trip', () => {
    const { assigned } = selectAssignedWork({
      fetchedAt: '2026-08-25T09:00:00.000Z',
      items: [
        {
          id: 'a', title: 'Book dentist', type: 'task', status: 'pending',
          isScheduled: false, order: 0, completedDates: [],
          assignee: 'openclaw', aiStatus: 'queued',
          startDate: '2026-08-26', startTime: '09:00', timeBucket: 'morning',
          priority: 'high', notes: 'the one on King St',
        },
      ],
    });
    expect(assigned[0]).toMatchObject({
      status: 'pending', startDate: '2026-08-26', startTime: '09:00',
      timeBucket: 'morning', priority: 'high', notes: 'the one on King St',
    });
  });
});

describe('anchor_ask_user — a question with answers', () => {
  /**
   * Most of what actually stops delegated work is a CHOICE — which Dana, which
   * of the two invoices, is Thursday still fine. `report_progress('blocked')`
   * could ask; it could not offer. Making someone retype a name into a box is
   * the difference between a loop that closes in a second and one that waits
   * until they have the energy to compose a sentence.
   */
  it('blocks the item and posts the question in one call', () => {
    // Two calls would make the half-done state reachable whenever a run dies
    // in between: a question with no block renders nowhere, and a block with no
    // question is the old text-box behaviour.
    expect(plan('anchor_ask_user', { id: 'i1', question: 'Which Dana?' })).toEqual({
      method: 'POST',
      path: '/api/agent/items/i1/ask',
      body: { question: 'Which Dana?' },
    });
  });

  it('carries the options through verbatim', () => {
    const result = plan('anchor_ask_user', {
      id: 'i1',
      question: 'Which Dana?',
      options: ['Dana Reyes', 'Dana Whitfield'],
    });
    expect(result).toMatchObject({
      body: { options: ['Dana Reyes', 'Dana Whitfield'] },
    });
  });

  it('omits options entirely rather than sending an empty list', () => {
    // An empty array reads to the route as "offer no buttons", which is right,
    // but sending the key at all invites a UI that renders an empty chip row.
    const result = plan('anchor_ask_user', { id: 'i1', question: 'What next?', options: [] });
    expect(result).not.toHaveProperty('body.options');
  });

  it('drops rubbish in the options rather than the whole question', () => {
    const result = plan('anchor_ask_user', {
      id: 'i1',
      question: 'Which one?',
      options: ['Real answer', '', '   ', 42, null],
    });
    expect(result).toMatchObject({ body: { options: ['Real answer'] } });
  });

  it('refuses without a question, which is all the user ever sees', () => {
    expect(plan('anchor_ask_user', { id: 'i1' })).toHaveProperty('error');
  });

  it('refuses without an id', () => {
    expect(plan('anchor_ask_user', { question: 'Which Dana?' })).toHaveProperty('error');
  });

  it('tells the agent to write options as answers, not as labels', () => {
    // "the first one" is useless as a reply: the text is sent back verbatim.
    const schema = toolByName('anchor_ask_user')!.inputSchema as {
      properties: { options: { description: string } };
    };
    expect(schema.properties.options.description).toMatch(/verbatim/i);
  });

  it('warns against options that are not exhaustive', () => {
    // A question whose real answer is not on the list is worse than no options
    // — it reads as a closed set and the user has to notice it is not.
    expect(toolByName('anchor_ask_user')!.description).toMatch(/exhaustive/i);
  });
});

describe('resuming a run that died', () => {
  /**
   * `working` is already in the open set, so the queue re-offers a stuck item —
   * what was missing is the evidence to tell a live run from a dead one. A
   * worker that treats every `working` item as somebody else's leaves the user
   * work they handed over and never got back; one that treats every `working`
   * item as abandoned double-runs whatever is genuinely in flight.
   */
  const working = (id: string, title: string, aiStatusAt?: string) => ({
    type: 'task',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
    id,
    title,
    assignee: 'openclaw',
    aiStatus: 'working',
    ...(aiStatusAt ? { aiStatusAt } : {}),
  });

  const root = {
    fetchedAt: '2026-08-26T12:00:00.000Z',
    userTimezone: 'UTC',
    items: [
      working('live-1', 'Still going', '2026-08-26T11:56:00.000Z'),
      working('dead-1', 'Died hours ago', '2026-08-26T06:00:00.000Z'),
    ],
  };

  it('carries the stamp, so elapsed is computable against fetchedAt', () => {
    const { assigned, fetchedAt } = selectAssignedWork(root, {});
    expect(fetchedAt).toBe('2026-08-26T12:00:00.000Z');
    expect(assigned.map((a) => a.aiStatusAt)).toEqual([
      '2026-08-26T11:56:00.000Z',
      '2026-08-26T06:00:00.000Z',
    ]);
  });

  it('still returns a stuck working item — the queue never dropped it', () => {
    const { assigned } = selectAssignedWork(root, {});
    expect(assigned.map((a) => a.id)).toContain('dead-1');
  });

  it('omits the stamp cleanly when there is none', () => {
    const { assigned } = selectAssignedWork(
      { ...root, items: [working('nostamp-1', 'No stamp')] },
      {}
    );
    expect(assigned[0]).not.toHaveProperty('aiStatusAt');
  });

  it('tells the worker what a working item means and what to do about it', () => {
    // A rule the model cannot see is a rule it cannot follow — the mistake
    // already made once with "not available for repeating items".
    const description = toolByName('anchor_my_work')!.description;
    expect(description).toContain('aiStatusAt');
    expect(description).toContain('fetchedAt');
    expect(description).toMatch(/died without/i);
  });
});
