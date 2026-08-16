import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The three database calls first-run seeding depends on, and the two decisions
 * inside them that are not obvious from their signatures.
 *
 *  - `fetchContainersSeeded` fails CLOSED, opposite to `fetchTrashedNames`
 *    beside it. There, a failed lookup costs a refusal the user can work
 *    around; here it would cost an automatic INSERT of containers into an
 *    account whose state could not be read.
 *  - `markContainersSeeded` UPSERTS, because a brand-new account has no
 *    `user_settings` row at all — and an UPDATE matching zero rows reports
 *    success, so the latch would silently never set and the seed would run
 *    again on every load.
 */

const upserts: { table: string; payload: Record<string, unknown>; opts?: unknown }[] = [];
const updates: { table: string; payload: Record<string, unknown>; filters: string[] }[] = [];

let settingsRow: Record<string, unknown> | null = null;
let selectFails = false;
let updateReturns: { id: string }[] = [];

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            selectFails
              ? { data: null, error: { message: 'boom' } }
              : { data: settingsRow, error: null },
        }),
      }),
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        upserts.push({ table, payload, opts });
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        const filters: string[] = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push(`eq:${col}=${String(val)}`);
            return chain;
          },
          is: (col: string, val: unknown) => {
            filters.push(`is:${col}=${String(val)}`);
            return chain;
          },
          select: async () => {
            updates.push({ table, payload, filters });
            return { data: updateReturns, error: null };
          },
        };
        return chain;
      },
    }),
  }),
}));

import {
  adoptContainerMembers,
  fetchContainersSeeded,
  markContainersSeeded,
} from '@/lib/db';

beforeEach(() => {
  upserts.length = 0;
  updates.length = 0;
  settingsRow = null;
  selectFails = false;
  updateReturns = [];
});

describe('fetchContainersSeeded', () => {
  it('is false for an account with no settings row at all', async () => {
    // The brand-new account this whole feature exists for. `single()` would
    // error with PGRST116 here and make it permanently unseedable.
    expect(await fetchContainersSeeded('u1')).toBe(false);
  });

  it('reads the column when the row exists', async () => {
    settingsRow = { containers_seeded: true };
    expect(await fetchContainersSeeded('u1')).toBe(true);
    settingsRow = { containers_seeded: false };
    expect(await fetchContainersSeeded('u1')).toBe(false);
  });

  it('FAILS CLOSED — a broken read answers "already seeded"', async () => {
    // Fail open and a transient failure during a token refresh duplicates
    // someone's starter set, and the second copy is indistinguishable from rows
    // they made themselves.
    selectFails = true;
    expect(await fetchContainersSeeded('u1')).toBe(true);
  });
});

describe('markContainersSeeded', () => {
  it('upserts, so the latch lands on an account with no settings row', async () => {
    await markContainersSeeded('u1');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('user_settings');
    expect(upserts[0].payload).toEqual({ user_id: 'u1', containers_seeded: true });
    expect(upserts[0].opts).toEqual({ onConflict: 'user_id' });
  });

  it('writes only its own two columns, so it cannot clobber settings', async () => {
    await markContainersSeeded('u1');
    expect(Object.keys(upserts[0].payload).sort()).toEqual(['containers_seeded', 'user_id']);
  });
});

describe('adoptContainerMembers — 027 backfill, re-run for one container', () => {
  it('fills only BLANK ids, and only for that user and that name', async () => {
    // `is null` is what makes this safe to call on any container, including one
    // the user creates by hand with a name that happens to match: it fills a
    // blank, never re-points a member that already resolves.
    updateReturns = [{ id: 'i1' }, { id: 'i2' }];
    const n = await adoptContainerMembers('u1', 'group_id', 'g1', 'Personal');

    expect(n).toBe(2);
    expect(updates[0].payload).toEqual({ group_id: 'g1' });
    expect(updates[0].filters).toEqual([
      'eq:user_id=u1',
      'is:group_id=null',
      'eq:group=Personal',
    ]);
  });

  it('matches the right text column for a project', async () => {
    await adoptContainerMembers('u1', 'project_id', 'p1', 'Housework');
    expect(updates[0].payload).toEqual({ project_id: 'p1' });
    expect(updates[0].filters).toContain('eq:project=Housework');
  });

  it('reports zero rather than throwing when nothing matched', async () => {
    expect(await adoptContainerMembers('u1', 'group_id', 'g1', 'Nobody')).toBe(0);
  });
});
