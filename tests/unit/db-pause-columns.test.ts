import { describe, it, expect, beforeEach, vi } from 'vitest';

// Captures every row handed to .insert(), per table.
const inserts: { table: string; payload: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));

import { createItem } from '@/lib/db';
import type { Item } from '@anchor-app/types';

const itemsRow = () => inserts.find((i) => i.table === 'items')!.payload;

const task: Item = {
  type: 'task', id: 't1', title: 'x', status: 'pending', isScheduled: false, order: 0,
};
const habit: Item = {
  type: 'habit', id: 'h1', title: 'y', group: 'G', streak: 0, status: 'pending',
  completedDates: [], skippedDates: [], dailyCounts: {}, repeatFrequency: 'daily',
};

// Migration 024 adds items.paused_at / paused_until, but Vercel builds on push
// while `pnpm db:push` is a separate manual step — so a build can reach
// production before the column exists. PostgREST rejects an INSERT naming a
// column absent from its schema cache (PGRST204), which would take out EVERY
// item create, not just paused ones. itemToRow therefore omits the pair unless
// it has something to say. Nothing writes pause state before Phase 1, so today
// the emitted row must be byte-identical to a pre-024 one.
describe('itemToRow omits pause columns until they are set', () => {
  beforeEach(() => { inserts.length = 0; });

  it('task create sends no pause columns when unpaused', async () => {
    await createItem('u1', task);
    expect(itemsRow()).not.toHaveProperty('paused_at');
    expect(itemsRow()).not.toHaveProperty('paused_until');
  });

  it('habit create sends no pause columns when unpaused', async () => {
    await createItem('u1', habit);
    expect(itemsRow()).not.toHaveProperty('paused_at');
    expect(itemsRow()).not.toHaveProperty('paused_until');
  });

  it('sends each column once it carries a value', async () => {
    await createItem('u1', { ...task, pausedAt: '2026-08-08T12:00:00Z', pausedUntil: '2026-09-01' });
    expect(itemsRow()).toMatchObject({
      paused_at: '2026-08-08T12:00:00Z',
      paused_until: '2026-09-01',
    });
  });

  it('sends only the field that is set, not its partner', async () => {
    await createItem('u1', { ...habit, pausedAt: '2026-08-08T12:00:00Z' });
    expect(itemsRow()).toHaveProperty('paused_at');
    expect(itemsRow()).not.toHaveProperty('paused_until');
  });
});
