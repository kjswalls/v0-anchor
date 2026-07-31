import { describe, it, expect, beforeEach } from 'vitest';
import { format, subDays } from 'date-fns';
import {
  validateProposalOperations,
  validateProposal,
  describeOperation,
  buildCatchUpProposal,
  buildProposalContext,
  MAX_CATCH_UP_OPERATIONS,
  type ProposalContext,
} from '@/lib/proposal';
import { hydrateCustomTypes } from '@/lib/item-registry';
import type { Item, Proposal, ProposalOperation } from '@/lib/planner-types';

/**
 * Proposals come from a model, so nothing they contain is trusted. These tests
 * pin the registry-derived rules that stop a hallucinated field from reaching a
 * row: per-type status vocabularies (frozen external contracts), date-anchoring,
 * and which types may be created at all.
 */

const items: Item[] = [
  {
    type: 'task',
    id: 'task-1',
    title: 'Email Dana',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
  },
  {
    type: 'habit',
    id: 'habit-1',
    title: 'Stretch',
    group: 'Personal',
    streak: 3,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    dailyCounts: {},
    repeatFrequency: 'daily',
  },
  {
    type: 'custom',
    customType: 'goal',
    id: 'goal-1',
    title: 'Run a 10k',
    status: 'pending',
    isScheduled: false,
    order: 0,
    completedDates: [],
  },
];

const ctx: ProposalContext = { items, customTypeNames: ['goal'] };

beforeEach(() => {
  hydrateCustomTypes([
    { id: 'it-1', name: 'goal', label: 'Goal', labelPlural: 'Goals' },
  ]);
});

const validate = (...operations: ProposalOperation[]) =>
  validateProposalOperations(operations, ctx);

describe('validateProposalOperations — creates', () => {
  it('accepts a task create', () => {
    const { accepted, rejected } = validate({
      kind: 'create',
      itemType: 'task',
      title: 'Book dentist',
      startDate: '2026-08-06',
    });
    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
  });

  it('accepts a create for a hydrated custom type', () => {
    const { accepted } = validate({ kind: 'create', itemType: 'goal', title: 'Learn Rust' });
    expect(accepted).toHaveLength(1);
  });

  it('rejects a type that does not exist', () => {
    const { accepted, rejected } = validate({
      kind: 'create',
      itemType: 'sprocket',
      title: 'Nope',
    });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/cannot create/);
  });

  it('rejects habit creation — habits require a group the AI cannot pick', () => {
    const { accepted, rejected } = validate({
      kind: 'create',
      itemType: 'habit',
      title: 'Meditate daily',
    });
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });
});

describe('validateProposalOperations — updates', () => {
  it('accepts a reschedule of an existing task', () => {
    const { accepted } = validate({
      kind: 'update',
      itemId: 'task-1',
      startDate: '2026-08-06',
      timeBucket: 'morning',
    });
    expect(accepted).toEqual([
      { kind: 'update', itemId: 'task-1', startDate: '2026-08-06', timeBucket: 'morning' },
    ]);
  });

  it('drops an update whose item is gone', () => {
    const { accepted, rejected } = validate({ kind: 'update', itemId: 'ghost', title: 'x' });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/no longer exists/);
  });

  it("rejects a task status from the habit vocabulary", () => {
    // 'done' is a habit word. The vocabularies are frozen and untranslatable.
    const { accepted, rejected } = validate({ kind: 'update', itemId: 'task-1', status: 'done' });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/not a valid status/);
  });

  it("rejects a habit status from the task vocabulary", () => {
    const { accepted, rejected } = validate({
      kind: 'update',
      itemId: 'habit-1',
      status: 'completed',
    });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/not a valid status/);
  });

  it('refuses to write scalar status to a recurring item', () => {
    // CLAUDE.md: recurring items track completion per-DATE in completedDates,
    // never via scalar status. A daily chore is `pending` forever by design, so
    // writing 'completed' here would mark the whole series done with no way for
    // the store's patch path to turn it back into one date's toggle.
    const recurring: Item[] = [
      {
        type: 'task',
        id: 'chore',
        title: 'Water plants',
        status: 'pending',
        isScheduled: false,
        order: 0,
        repeatFrequency: 'daily',
        completedDates: [],
      },
    ];
    const { accepted, rejected } = validateProposalOperations(
      [{ kind: 'update', itemId: 'chore', status: 'completed' }],
      { items: recurring, customTypeNames: [] },
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/per-date/);
  });

  it('still lets a recurring item be rescheduled', () => {
    const recurring: Item[] = [
      {
        type: 'task',
        id: 'chore',
        title: 'Water plants',
        status: 'pending',
        isScheduled: false,
        order: 0,
        repeatFrequency: 'daily',
        completedDates: [],
      },
    ];
    const { accepted } = validateProposalOperations(
      [{ kind: 'update', itemId: 'chore', timeBucket: 'evening' }],
      { items: recurring, customTypeNames: [] },
    );
    expect(accepted).toHaveLength(1);
  });

  it('accepts each vocabulary against its own one-shot type', () => {
    expect(validate({ kind: 'update', itemId: 'task-1', status: 'completed' }).accepted).toHaveLength(1);
    expect(validate({ kind: 'update', itemId: 'goal-1', status: 'completed' }).accepted).toHaveLength(1);
  });

  it('never lets a proposal set a habit\'s status at all', () => {
    // A habit is recurring by definition (the registry forbids 'none'), so it
    // is always caught by the per-date rule — 'done' is a valid habit word and
    // still cannot be written as scalar status.
    const { accepted, rejected } = validate({ kind: 'update', itemId: 'habit-1', status: 'done' });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/per-date/);
  });

  it('strips startDate from a date-blind type instead of rejecting the operation', () => {
    // Habits render on every matching day; a startDate would be silently ignored.
    const { accepted, rejected } = validate({
      kind: 'update',
      itemId: 'habit-1',
      startDate: '2026-08-06',
      timeBucket: 'evening',
    });
    expect(rejected).toHaveLength(0);
    expect(accepted[0]).not.toHaveProperty('startDate');
    expect(accepted[0]).toMatchObject({ timeBucket: 'evening' });
  });

  it('drops null field-clears — v1 proposals never clear a field', () => {
    const { accepted } = validate({
      kind: 'update',
      itemId: 'task-1',
      startDate: null,
      priority: null,
      title: 'Email Dana back',
    });
    expect(accepted[0]).toEqual({ kind: 'update', itemId: 'task-1', title: 'Email Dana back' });
  });

  it('keeps the good operations when one is bad', () => {
    const { accepted, rejected } = validate(
      { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
      { kind: 'update', itemId: 'ghost', title: 'x' },
      { kind: 'create', itemType: 'task', title: 'Fine' },
    );
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(1);
  });
});

describe('validateProposal', () => {
  it('returns the proposal carrying only viable operations', () => {
    const proposal: Proposal = {
      id: 'p1',
      summary: 'A lighter Tuesday',
      createdAt: '2026-07-31T09:00:00.000Z',
      operations: [
        { kind: 'update', itemId: 'task-1', startDate: '2026-08-06' },
        { kind: 'update', itemId: 'ghost', title: 'x' },
      ],
    };
    const { proposal: cleaned, rejected } = validateProposal(proposal, ctx);
    expect(cleaned.operations).toHaveLength(1);
    expect(cleaned.summary).toBe('A lighter Tuesday');
    expect(rejected).toHaveLength(1);
  });
});

describe('buildCatchUpProposal', () => {
  const TODAY = '2026-07-31';

  /** A pending task anchored `days` before TODAY. */
  const overdueTask = (id: string, days: number): Item => ({
    type: 'task',
    id,
    title: `Task ${id}`,
    status: 'pending',
    isScheduled: false,
    order: 0,
    startDate: format(subDays(new Date(`${TODAY}T00:00:00`), days), 'yyyy-MM-dd'),
    completedDates: [],
  });

  const build = (items: Item[]) =>
    buildCatchUpProposal({ items, customTypeNames: [], todayStr: TODAY });

  it('returns null when nothing is waiting', () => {
    expect(build([items[1]])).toBeNull();
  });

  it('moves recent overdue items to today', () => {
    const draft = build([overdueTask('a', 2), overdueTask('b', 4)]);
    expect(draft?.operations).toEqual([
      { kind: 'update', itemId: 'a', startDate: TODAY },
      { kind: 'update', itemId: 'b', startDate: TODAY },
    ]);
  });

  it('leaves the long-overdue cohort alone — that pile is not today\'s problem', () => {
    // >7 days is the "long" cohort per lib/overdue.ts.
    const draft = build([overdueTask('recent', 3), overdueTask('ancient', 40)]);
    expect(draft?.operations).toHaveLength(1);
    expect(draft?.operations[0]).toMatchObject({ itemId: 'recent' });
  });

  it('caps the card so it never becomes a wall of shame', () => {
    const many = Array.from({ length: 12 }, (_, i) => overdueTask(`t${i}`, 2));
    const draft = build(many);
    expect(draft?.operations).toHaveLength(MAX_CATCH_UP_OPERATIONS);
  });

  it('acknowledges the remainder without scolding', () => {
    const many = Array.from({ length: 8 }, (_, i) => overdueTask(`t${i}`, 2));
    const draft = build(many);
    expect(draft?.rationale).toContain('can keep waiting');
    expect(draft?.rationale).not.toMatch(/overdue|late|behind|should/i);
  });

  it('says so plainly when nothing else is outstanding', () => {
    const draft = build([overdueTask('only', 1)]);
    expect(draft?.summary).toBe('Pick one thing back up');
    expect(draft?.rationale).toContain('Nothing else is waiting');
  });

  it('produces operations that survive validation', () => {
    const list = [overdueTask('a', 2)];
    const draft = build(list)!;
    const { accepted, rejected } = validateProposalOperations(draft.operations, {
      items: list,
      customTypeNames: [],
    });
    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
  });
});

describe('buildProposalContext', () => {
  it('lists open items with copyable ids', () => {
    const text = buildProposalContext({ ...ctx, todayStr: '2026-07-31' });
    expect(text).toContain('[task-1] Email Dana');
    expect(text).toContain('[habit-1] Stretch');
    expect(text).toContain('[goal-1] Run a 10k');
  });

  it("omits items that are finished in their own type's vocabulary", () => {
    const done: Item[] = [
      { ...(items[0] as Extract<Item, { type: 'task' }>), status: 'completed' },
      { ...(items[1] as Extract<Item, { type: 'habit' }>), status: 'done' },
    ];
    const text = buildProposalContext({ items: done, customTypeNames: [], todayStr: '2026-07-31' });
    expect(text).not.toContain('task-1');
    expect(text).not.toContain('habit-1');
    expect(text).toContain('nothing open');
  });

  it('bounds the list so the prompt cannot grow without limit', () => {
    const many: Item[] = Array.from({ length: 200 }, (_, i) => ({
      type: 'task',
      id: `t${i}`,
      title: `Task ${i}`,
      status: 'pending',
      isScheduled: false,
      order: i,
      completedDates: [],
    }));
    const text = buildProposalContext(
      { items: many, customTypeNames: [], todayStr: '2026-07-31' },
      10,
    );
    expect(text.split('\n')).toHaveLength(11); // heading + 10
  });
});

describe('describeOperation', () => {
  it('describes a create with its friendly date', () => {
    expect(
      describeOperation(
        { kind: 'create', itemType: 'task', title: 'Book dentist', startDate: '2026-08-06' },
        ctx,
      ),
    ).toBe('New task: Book dentist for Thu Aug 6');
  });

  it('names the custom type from the registry', () => {
    expect(
      describeOperation({ kind: 'create', itemType: 'goal', title: 'Learn Rust' }, ctx),
    ).toBe('New goal: Learn Rust');
  });

  it('describes a reschedule in terms of where it lands', () => {
    expect(
      describeOperation({ kind: 'update', itemId: 'task-1', startDate: '2026-08-06' }, ctx),
    ).toBe('Email Dana — move to Thu Aug 6');
  });

  it("uses each type's own done-word", () => {
    expect(describeOperation({ kind: 'update', itemId: 'task-1', status: 'completed' }, ctx)).toBe(
      'Email Dana — mark done',
    );
    expect(describeOperation({ kind: 'update', itemId: 'habit-1', status: 'done' }, ctx)).toBe(
      'Stretch — mark done',
    );
    // Not the done-status: named explicitly rather than mislabelled "done".
    expect(describeOperation({ kind: 'update', itemId: 'task-1', status: 'cancelled' }, ctx)).toBe(
      'Email Dana — mark cancelled',
    );
  });

  it('falls back to the title when an update changes nothing describable', () => {
    expect(describeOperation({ kind: 'update', itemId: 'task-1' }, ctx)).toBe('Email Dana');
  });

  it('leaves an unparseable date alone rather than rendering Invalid Date', () => {
    expect(
      describeOperation({ kind: 'update', itemId: 'task-1', startDate: 'someday' }, ctx),
    ).toBe('Email Dana — move to someday');
  });
});
