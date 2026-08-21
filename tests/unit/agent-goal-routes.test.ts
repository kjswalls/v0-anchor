import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The goal agent routes, exercised end-to-end against an in-memory Postgres
 * stand-in (plan Phase 4).
 *
 * The plan's gate for this phase is live calls against a running server — the
 * standard programs was held to — and that gate is still owed: this container
 * has no Supabase credentials, so nothing here has ever spoken to a database.
 * What this file buys in the meantime is the half a live call and a type-check
 * both miss: that the handlers name the right tables and columns, that the
 * refusals fire before any write lands, and that the multi-query sequences
 * (ownership → validate → trash-keep → state → reconcile) compose.
 *
 * The fake below is filter-aware rather than a call queue. A queue makes the
 * test depend on the ORDER the handler happens to issue its reads in, which is
 * exactly the implementation detail a refactor is allowed to change.
 */

interface Row {
  [col: string]: unknown
}

/** Tables the goal handlers touch, seeded per test. */
let db: Record<string, Row[]>;

type Filter = (row: Row) => boolean;

function builder(table: string) {
  const filters: Filter[] = [];
  let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  let payload: Row[] = [];
  let conflictCols: string[] = [];

  const rows = () => (db[table] ??= []);
  const matched = () => rows().filter((r) => filters.every((f) => f(r)));

  const run = () => {
    switch (mode) {
      case 'select':
        // Copies, not references. PostgREST hands back JSON, so a handler can
        // never observe a later write through a row it already read — and a
        // fake that leaks references would hide code that depends on that.
        return { data: matched().map((r) => ({ ...r })), error: null };
      case 'insert':
        rows().push(...payload.map((r) => ({ ...r })));
        return { data: payload, error: null };
      case 'upsert': {
        for (const incoming of payload) {
          const existing = rows().find((r) => conflictCols.every((c) => r[c] === incoming[c]));
          if (existing) Object.assign(existing, incoming);
          else rows().push({ ...incoming });
        }
        return { data: payload, error: null };
      }
      case 'update': {
        for (const row of matched()) Object.assign(row, payload[0]);
        return { data: matched().map((r) => ({ ...r })), error: null };
      }
      case 'delete': {
        const doomed = new Set(matched());
        db[table] = rows().filter((r) => !doomed.has(r));
        return { data: null, error: null };
      }
    }
  };

  const self: Record<string, unknown> = {
    select: () => self,
    insert: (data: Row | Row[]) => {
      mode = 'insert';
      payload = Array.isArray(data) ? data : [data];
      return self;
    },
    upsert: (data: Row | Row[], opts?: { onConflict?: string }) => {
      mode = 'upsert';
      payload = Array.isArray(data) ? data : [data];
      conflictCols = (opts?.onConflict ?? '').split(',').filter(Boolean);
      return self;
    },
    update: (data: Row) => {
      mode = 'update';
      payload = [data];
      return self;
    },
    delete: () => {
      mode = 'delete';
      return self;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return self;
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val);
      return self;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return self;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return self;
    },
    order: () => self,
    maybeSingle: () => {
      const result = run() as { data: Row[] | null; error: unknown };
      return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
    },
    single: () => {
      const result = run() as { data: Row[] | null; error: unknown };
      const row = result.data?.[0] ?? null;
      // PostgREST's .single() is an ERROR when the filter matched nothing —
      // callers that fall back on `!data` would otherwise pass here and throw
      // in production.
      return Promise.resolve(
        row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } },
      );
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return self;
}

const serviceClient = { from: (table: string) => builder(table) };

vi.mock('@/lib/supabase-service', () => ({
  createServiceClient: () => serviceClient,
  resolveUserIdFromApiKey: vi.fn(async () => USER),
}));

const USER = 'user-1';
const OTHER = 'user-2';

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/agent/goals/route');
  return POST(
    new NextRequest('http://localhost/api/agent/goals', {
      method: 'POST',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};

const patch = async (id: string, body: unknown) => {
  const { PATCH } = await import('@/app/api/agent/goals/[id]/route');
  return PATCH(
    new NextRequest(`http://localhost/api/agent/goals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

const del = async (id: string) => {
  const { DELETE } = await import('@/app/api/agent/goals/[id]/route');
  return DELETE(
    new NextRequest(`http://localhost/api/agent/goals/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer k' },
    }),
    { params: Promise.resolve({ id }) },
  );
};

const uuid = (n: number) => `${'0'.repeat(8 - String(n).length)}${n}-1111-4111-8111-111111111111`;
const M1 = uuid(1); // one-shot task — milestone material
const C1 = uuid(2); // recurring task — check-in material
const W1 = uuid(3); // plain work
const GONE = uuid(9); // trashed

beforeEach(() => {
  db = {
    goals: [],
    goal_items: [],
    items: [
      { id: M1, user_id: USER, type: 'task', parent_item_id: null, repeat_frequency: null, deleted_at: null },
      { id: C1, user_id: USER, type: 'task', parent_item_id: null, repeat_frequency: 'weekdays', deleted_at: null },
      { id: W1, user_id: USER, type: 'task', parent_item_id: null, repeat_frequency: null, deleted_at: null },
      { id: GONE, user_id: USER, type: 'task', parent_item_id: null, repeat_frequency: null, deleted_at: '2026-08-01T00:00:00Z' },
    ],
  };
});

const rolesOf = (goalId: string) =>
  Object.fromEntries(
    db.goal_items.filter((r) => r.goal_id === goalId).map((r) => [r.item_id, r.role]),
  );

describe('POST /api/agent/goals', () => {
  it('creates a goal and writes each membership with its role', async () => {
    const res = await post({
      name: 'Learn Chinese',
      why: 'so I can talk to my in-laws',
      startsOn: '2026-01-01',
      targetOn: '2027-01-01',
      milestoneIds: [M1],
      checkinIds: [C1],
      memberIds: [W1],
    });
    expect(res.status).toBe(201);
    const { goal } = (await res.json()) as { goal: { id: string } };

    const stored = db.goals[0];
    expect(stored.name).toBe('Learn Chinese');
    expect(stored.user_id).toBe(USER);
    expect(stored.state).toBe('active');
    expect(stored.target_on).toBe('2027-01-01');
    expect(rolesOf(goal.id)).toEqual({ [M1]: 'milestone', [C1]: 'checkin', [W1]: 'member' });
  });

  it('refuses a recurring item as a milestone, before anything is written', async () => {
    const res = await post({ name: 'X', milestoneIds: [C1] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cannot be a milestone');
    // The refusal is worth nothing if the goal row landed anyway.
    expect(db.goals).toHaveLength(0);
  });

  it('refuses a one-shot item as a check-in', async () => {
    const res = await post({ name: 'X', checkinIds: [M1] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cannot be a check-in');
    expect(db.goals).toHaveLength(0);
  });

  it('refuses an id that is not this user’s item', async () => {
    db.items.push({ id: uuid(7), user_id: OTHER, type: 'task', parent_item_id: null, repeat_frequency: null });
    const res = await post({ name: 'X', memberIds: [uuid(7)] });
    expect(res.status).toBe(400);
    // "Do not exist" is the truthful answer to give a caller who cannot see
    // another tenant's rows — confirming the id exists elsewhere would leak it.
    expect((await res.json()).error).toContain('do not exist');
  });

  it('stamps achievedAt for a goal created already achieved', async () => {
    const res = await post({ name: 'Ran a marathon', state: 'achieved' });
    expect(res.status).toBe(201);
    expect(db.goals[0].achieved_at).toEqual(expect.any(String));
  });

  it('leaves achieved_at null for an ordinary new goal', async () => {
    await post({ name: 'X' });
    expect(db.goals[0].achieved_at).toBeNull();
  });
});

describe('PATCH /api/agent/goals/:id', () => {
  const G = 'goal-1';
  beforeEach(() => {
    db.goals.push({
      id: G,
      user_id: USER,
      name: 'Learn Chinese',
      state: 'active',
      achieved_at: null,
      deleted_at: null,
    });
  });

  it('404s on another user’s goal without reading its body', async () => {
    db.goals[0].user_id = OTHER;
    const res = await patch(G, { name: 'Renamed' });
    expect(res.status).toBe(404);
    expect(db.goals[0].name).toBe('Learn Chinese');
  });

  it('404s on a trashed goal', async () => {
    db.goals[0].deleted_at = '2026-08-01T00:00:00Z';
    expect((await patch(G, { name: 'Renamed' })).status).toBe(404);
  });

  it('stamps achieved_at on achieve and does not restamp on a retry', async () => {
    expect((await patch(G, { state: 'achieved' })).status).toBe(200);
    const first = db.goals[0].achieved_at as string;
    expect(first).toEqual(expect.any(String));

    // Whole-set replacement is designed to be idempotent, so a repeat is
    // expected traffic — and must not drag the achievement date forward.
    expect((await patch(G, { state: 'achieved' })).status).toBe(200);
    expect(db.goals[0].achieved_at).toBe(first);
  });

  it('clears achieved_at when the goal reopens', async () => {
    await patch(G, { state: 'achieved' });
    await patch(G, { state: 'active' });
    expect(db.goals[0].achieved_at).toBeNull();
  });

  it('replaces one role array without disturbing the others', async () => {
    await patch(G, { milestoneIds: [M1], checkinIds: [C1], memberIds: [W1] });
    expect(rolesOf(G)).toEqual({ [M1]: 'milestone', [C1]: 'checkin', [W1]: 'member' });

    await patch(G, { memberIds: [] });
    expect(rolesOf(G)).toEqual({ [M1]: 'milestone', [C1]: 'checkin' });
  });

  it('demotes rather than duplicates when an id moves between roles', async () => {
    await patch(G, { milestoneIds: [M1] });
    await patch(G, { milestoneIds: [], memberIds: [M1] });
    expect(db.goal_items.filter((r) => r.item_id === M1)).toHaveLength(1);
    expect(rolesOf(G)).toEqual({ [M1]: 'member' });
  });

  it('keeps a trashed member the caller could not see', async () => {
    db.goal_items.push({ goal_id: G, item_id: GONE, user_id: USER, role: 'member', sort_order: 0 });
    // items[] on the wire is deleted_at-filtered, so a model rebuilding the
    // list omits the trashed id. Pruning it here would make a restore return
    // the item as a non-member, silently.
    await patch(G, { memberIds: [W1] });
    expect(rolesOf(G)).toEqual({ [W1]: 'member', [GONE]: 'member' });
  });

  it('scopes the trash-keeping to the role being replaced', async () => {
    db.goal_items.push({ goal_id: G, item_id: GONE, user_id: USER, role: 'member', sort_order: 0 });
    // A milestoneIds patch must not resurrect a trashed MEMBER as a milestone.
    await patch(G, { milestoneIds: [M1] });
    expect(rolesOf(G)).toEqual({ [M1]: 'milestone', [GONE]: 'member' });
  });

  it('refuses the pause verb with a pointer at the alternatives', async () => {
    const res = await patch(G, { paused: true });
    expect(res.status).toBe(400);
    const error = JSON.stringify(await res.json());
    expect(error).toContain('program');
    expect(db.goals[0].state).toBe('active');
  });

  it('refuses a caller-chosen achievedAt', async () => {
    const res = await patch(G, { achievedAt: '2020-01-01T00:00:00Z' });
    expect(res.status).toBe(400);
    expect(db.goals[0].achieved_at).toBeNull();
  });

  it('refuses a body that gives one id two roles', async () => {
    const res = await patch(G, { milestoneIds: [M1], memberIds: [M1] });
    expect(res.status).toBe(400);
    expect(db.goal_items).toHaveLength(0);
  });
});

describe('DELETE /api/agent/goals/:id', () => {
  const G = 'goal-1';
  beforeEach(() => {
    db.goals.push({ id: G, user_id: USER, name: 'X', state: 'active', deleted_at: null });
    db.goal_items.push({ goal_id: G, item_id: M1, user_id: USER, role: 'milestone', sort_order: 0 });
  });

  it('soft-deletes and leaves the membership rows — with their roles — intact', async () => {
    expect((await del(G)).status).toBe(200);
    expect(db.goals[0].deleted_at).toEqual(expect.any(String));
    // Restoring a goal whose members came back as plain 'member' would zero
    // its progress denominator without saying so.
    expect(rolesOf(G)).toEqual({ [M1]: 'milestone' });
  });

  it('404s on another user’s goal and deletes nothing', async () => {
    db.goals[0].user_id = OTHER;
    expect((await del(G)).status).toBe(404);
    expect(db.goals[0].deleted_at).toBeNull();
  });
});

/**
 * Decision 3's SECOND enforcement point.
 *
 * The store demotes an invalidated role on the UI path with a receipt toast.
 * An agent PATCH is the other way `repeatFrequency` flips, and until this
 * existed an OpenClaw write could make a milestone recurring with nothing
 * taking the role back — a row whose scalar status migration 016 has frozen, so
 * the goal reads permanently behind with nothing to click.
 */
describe('the agent item PATCH demotes a role its own edit invalidated', () => {
  const G = 'goal-1';
  beforeEach(() => {
    db.goals.push({ id: G, user_id: USER, name: 'Learn Chinese', state: 'active', deleted_at: null });
  });

  const patchTask = async (id: string, body: unknown) => {
    const { PATCH } = await import('@/app/api/agent/tasks/[id]/route');
    return PATCH(
      new NextRequest(`http://localhost/api/agent/tasks/${id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  };

  it('demotes a milestone that has just been made recurring', async () => {
    db.goal_items.push({ goal_id: G, item_id: M1, user_id: USER, role: 'milestone', sort_order: 0 });
    const res = await patchTask(M1, { repeatFrequency: 'weekdays' });
    expect(res.status).toBe(200);
    // The edit itself is never blocked — a goal must not constrain its members.
    expect(db.items.find((i) => i.id === M1)!.repeat_frequency).toBe('weekdays');
    expect(rolesOf(G)).toEqual({ [M1]: 'member' });
    expect(await res.json()).toEqual({ success: true, demoted: [{ goalId: G, from: 'milestone' }] });
  });

  it('demotes a check-in that has just stopped recurring — the mirror case', async () => {
    db.goal_items.push({ goal_id: G, item_id: C1, user_id: USER, role: 'checkin', sort_order: 0 });
    // Clearing the field, not setting it to a value: `in` rather than
    // truthiness is what makes this reach the scan at all.
    await patchTask(C1, { repeatFrequency: 'none' });
    expect(rolesOf(G)).toEqual({ [C1]: 'member' });
  });

  it('leaves a still-valid role alone', async () => {
    db.goal_items.push({ goal_id: G, item_id: C1, user_id: USER, role: 'checkin', sort_order: 0 });
    await patchTask(C1, { repeatFrequency: 'daily' });
    expect(rolesOf(G)).toEqual({ [C1]: 'checkin' });
  });

  it('does not scan when the patch cannot invalidate anything', async () => {
    db.goal_items.push({ goal_id: G, item_id: M1, user_id: USER, role: 'milestone', sort_order: 0 });
    const res = await patchTask(M1, { title: 'HSK 3 exam, rescheduled' });
    expect(await res.json()).toEqual({ success: true });
    expect(rolesOf(G)).toEqual({ [M1]: 'milestone' });
  });
});
