import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Server-side container-id resolution (migration 027).
 *
 * THE AGENT PATH HAS NO STORE. planner-store's projectIdFor/groupIdFor resolve
 * every client write against containers already in memory, but
 * /api/agent/tasks and /api/agent/habits never touch Zustand — and both create
 * schemas deliberately `.omit()` the id, because an agent holds no id↔name map.
 * So lib/db.ts has to do the lookup, or an agent-named container yields a row
 * with the name and a NULL id: invisible to the id-keyed rename fan-out, which
 * is the exact orphaning Phase 0 exists to remove.
 *
 * The UPDATE half matters more than the create half, and is the reason this is
 * a bug rather than an omission: leaving a stale id behind is WORSE than the
 * pre-027 behaviour, because the fan-out treats the id as truth and would drag
 * the item back into the container it was moved out of.
 */

const inserts: { table: string; payload: Record<string, unknown> }[] = [];
const updated: { table: string; payload: Record<string, unknown> }[] = [];

let rows: Record<string, { id: string; name: string; user_id: string }[]> = {};
/** Simulates a pre-027 database, where the lookup itself cannot be answered. */
let selectErrors = false;

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          then: (resolve: (v: { error: null }) => unknown) => {
            updated.push({ table, payload });
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      },
      select: () => {
        const filters: [string, unknown][] = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          limit: () =>
            selectErrors
              ? Promise.resolve({ data: null, error: { message: 'relation does not exist' } })
              : Promise.resolve({
                  data: (rows[table] ?? []).filter((r) =>
                    filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v)
                  ),
                  error: null,
                }),
        };
        return chain;
      },
    }),
  }),
}));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));

import { createItem, updateItem } from '@/lib/db';
import type { Item } from '@anchor-app/types';

const itemsInsert = () => inserts.find((i) => i.table === 'items')!.payload;
const itemsUpdate = () => updated.find((u) => u.table === 'items')!.payload;

const task: Item = {
  type: 'task', id: 't1', title: 'x', status: 'pending', isScheduled: false, order: 0,
};
const habit: Item = {
  type: 'habit', id: 'h1', title: 'y', group: 'Wellness', streak: 0, status: 'pending',
  completedDates: [], skippedDates: [], dailyCounts: {}, repeatFrequency: 'daily',
};

beforeEach(() => {
  inserts.length = 0;
  updated.length = 0;
  selectErrors = false;
  rows = {
    projects: [{ id: 'pr-work', name: 'Work', user_id: 'u1' }],
    habit_groups: [{ id: 'gr-well', name: 'Wellness', user_id: 'u1' }],
  };
});

describe('create resolves the container name to an id', () => {
  it('links a task the agent filed by name', async () => {
    await createItem('u1', { ...task, project: 'Work' });
    expect(itemsInsert()).toMatchObject({ project: 'Work', project_id: 'pr-work' });
  });

  it('links a habit the agent filed by name', async () => {
    await createItem('u1', habit);
    expect(itemsInsert()).toMatchObject({ group: 'Wellness', group_id: 'gr-well' });
  });

  it('writes no id column when there is no name to resolve', async () => {
    await createItem('u1', task);
    expect(itemsInsert()).not.toHaveProperty('project_id');
  });

  it('leaves an already-resolved id alone instead of re-querying', async () => {
    // The store resolves its own before it ever reaches here.
    await createItem('u1', { ...task, project: 'Work', projectId: 'pr-explicit' });
    expect(itemsInsert()).toMatchObject({ project_id: 'pr-explicit' });
  });

  it('omits the column entirely when the lookup cannot be answered', async () => {
    // Pre-027 database: PostgREST rejects an INSERT naming a column absent from
    // its schema cache, so a guessed NULL here would break every item create,
    // not only container-bearing ones.
    selectErrors = true;
    await createItem('u1', { ...task, project: 'Work' });
    expect(itemsInsert()).not.toHaveProperty('project_id');
  });
});

describe('an agent re-file moves the id with the name', () => {
  it('resolves the new container', async () => {
    await updateItem('t1', 'task', { project: 'Work' });
    expect(itemsUpdate()).toMatchObject({ project: 'Work', project_id: 'pr-work' });
  });

  it('CLEARS the id when the new name matches no container', async () => {
    // The stale-id trap. Left pointing at the old project, the rename fan-out
    // would rewrite this item's name and pull it back into a container the
    // agent had explicitly moved it out of.
    await updateItem('t1', 'task', { project: 'Housework' });
    expect(itemsUpdate()).toMatchObject({ project: 'Housework', project_id: null });
  });

  it('clears the id when the item is unfiled', async () => {
    await updateItem('t1', 'task', { project: undefined });
    expect(itemsUpdate()).toMatchObject({ project: null, project_id: null });
  });

  it('does the same on the habit side', async () => {
    await updateItem('h1', 'habit', { group: 'Wellness' });
    expect(itemsUpdate()).toMatchObject({ group: 'Wellness', group_id: 'gr-well' });
  });

  it('does not re-query when the caller already sent both halves', async () => {
    // Every store write sends both, and a lookup per keystroke-committed patch
    // would be a wasted round trip on the hot path.
    await updateItem('t1', 'task', { project: 'Work', projectId: 'pr-explicit' });
    expect(itemsUpdate()).toMatchObject({ project_id: 'pr-explicit' });
  });

  it('touches neither column when the patch names no container', async () => {
    await updateItem('t1', 'task', { title: 'renamed' });
    expect(itemsUpdate()).not.toHaveProperty('project_id');
  });
});
