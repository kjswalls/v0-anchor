import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/openclaw-registry', () => ({ notifyPlugins: vi.fn() }));

import { updatesToRow } from '@/lib/db';
import { TASK_FIELDS, HABIT_FIELDS } from '@anchor-app/types';

// The updatesToRow allowlists are the ONLY field filter between the app (and
// the unvalidated agent PATCH bodies) and the items table. They are
// hand-maintained, while diffing (undo/redo) iterates the schema-derived
// TASK_FIELDS/HABIT_FIELDS — so a field added to the schema but not the
// allowlist would diff but silently never persist. This suite makes that
// drift a test failure instead.

// `id` is immutable by design and deliberately absent from the allowlists.
//
// completedDates/skippedDates are absent for a different reason: they have no
// column mapping at all any more. updateItem intercepts them and applies them
// through the set_item_completion / set_item_skip intent RPCs (migrations 020
// and 029), because writing either array whole lets a writer holding a partial
// copy delete every date it never knew about. They must stay OUT of the
// allowlists — the assertion below is the inverse of the one this suite makes
// for every other field.
const INTENT_ROUTED = ['completedDates', 'skippedDates'];
const EXEMPT = new Set(['id', ...INTENT_ROUTED]);

// A value that survives every allowlist guard (non-null, non-undefined).
const PROBE: Record<string, unknown> = {
  repeatDays: [1],
  completedDates: ['2026-01-01'],
  skippedDates: ['2026-01-01'],
  dailyCounts: { '2026-01-01': 1 },
  isScheduled: true,
  inProjectBlock: true,
};
const probeFor = (field: string) => PROBE[field] ?? 'probe';

describe('db updatesToRow allowlists cover every schema field', () => {
  for (const field of TASK_FIELDS) {
    if (EXEMPT.has(field)) continue;
    it(`task allowlist persists '${field}'`, () => {
      const row = updatesToRow('task', { [field]: probeFor(field) });
      expect(Object.keys(row), `TASK_FIELDS includes '${field}' but taskUpdatesToRow drops it`).toHaveLength(1);
    });
  }

  for (const field of HABIT_FIELDS) {
    if (EXEMPT.has(field)) continue;
    it(`habit allowlist persists '${field}'`, () => {
      const row = updatesToRow('habit', { [field]: probeFor(field) });
      expect(Object.keys(row), `HABIT_FIELDS includes '${field}' but habitUpdatesToRow drops it`).toHaveLength(1);
    });
  }
});

describe('per-date arrays never reach the allowlists as absolute values', () => {
  for (const type of ['task', 'habit']) {
    for (const field of INTENT_ROUTED) {
      it(`${type} allowlist refuses '${field}'`, () => {
        const row = updatesToRow(type, { [field]: probeFor(field) });
        expect(
          Object.keys(row),
          `${type}UpdatesToRow maps '${field}' to a column — an absolute write here ` +
            `deletes every date the writer did not know about. Route it through the ` +
            `intent RPC in updateItem instead.`,
        ).toHaveLength(0);
      });
    }
  }
});
