import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Full-item reads go through the items_windowed view (migration 031).
 *
 * The view trims completed_dates/skipped_dates to COMPLETION_READ_WINDOW_DAYS
 * and passes every other column through, so the app keeps its select('*') and
 * simply stops paying for history no surface renders. Two things have to hold:
 * every read that hydrates whole items uses it (a read left on the base table
 * silently reintroduces the payload), and a database that has not had 031
 * applied yet still works, because Vercel builds on push while db:push is
 * manual.
 */

const queried: string[] = [];
let viewMissing = false;

const result = (relation: string) =>
  viewMissing && relation === 'items_windowed'
    ? { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    : { data: [], error: null };

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (relation: string) => {
      const chain = {
        select: () => {
          queried.push(relation);
          return chain;
        },
        eq: () => chain,
        is: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result(relation)).then(resolve),
      };
      return chain;
    },
  }),
}));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));

import { fetchItems, getItemsWindowAvailable } from '@/lib/db';

beforeEach(() => {
  queried.length = 0;
  viewMissing = false;
});

describe('fetchItems relation', () => {
  it('reads the windowed view, not the base table', async () => {
    await fetchItems('user-1');
    expect(queried).toEqual(['items_windowed']);
  });

  it('falls back to items when the view is not deployed, and latches', async () => {
    viewMissing = true;
    await fetchItems('user-1');

    // One failed attempt, then the base table — untrimmed arrays are bigger,
    // never wrong, which is the right way to lose this race.
    expect(queried).toEqual(['items_windowed', 'items']);
    expect(getItemsWindowAvailable()).toBe(false);

    // Latched: no further probing of a relation already known to be absent.
    queried.length = 0;
    await fetchItems('user-1');
    expect(queried).toEqual(['items']);
  });
});
