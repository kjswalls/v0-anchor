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
const EXEMPT = new Set(['id']);

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

/**
 * Fields whose write deliberately touches a COMPANION column too.
 *
 * The one-column-per-field rule below is the drift detector, so an exception
 * has to be declared rather than absorbed by loosening the assertion — a bare
 * "row is non-empty" check would stop catching the bug this suite exists for
 * (a field that diffs but silently never persists).
 */
const COMPANION_COLUMNS: Record<string, string[]> = {
  // Currently none. Kept because the mechanism is the interesting part: an
  // exception has to be DECLARED rather than absorbed by loosening the
  // assertion, or this suite stops catching the bug it exists for.
};

function expectPersisted(row: Record<string, unknown>, field: string, which: string) {
  const companions = COMPANION_COLUMNS[field] ?? [];
  expect(
    Object.keys(row),
    `${which} includes '${field}' but its allowlist drops it`,
  ).toHaveLength(1 + companions.length);
  for (const column of companions) {
    expect(Object.keys(row), `'${field}' should also write ${column}`).toContain(column);
  }
}

describe('db updatesToRow allowlists cover every schema field', () => {
  for (const field of TASK_FIELDS) {
    if (EXEMPT.has(field)) continue;
    it(`task allowlist persists '${field}'`, () => {
      const row = updatesToRow('task', { [field]: probeFor(field) });
      expectPersisted(row, field, 'TASK_FIELDS');
    });
  }

  for (const field of HABIT_FIELDS) {
    if (EXEMPT.has(field)) continue;
    it(`habit allowlist persists '${field}'`, () => {
      const row = updatesToRow('habit', { [field]: probeFor(field) });
      expectPersisted(row, field, 'HABIT_FIELDS');
    });
  }
});
