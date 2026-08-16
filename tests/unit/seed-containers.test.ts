import { describe, it, expect, vi } from 'vitest';
import { planSeed, runFirstRunSeed, type SeedDeps } from '@/lib/seed-containers';
import { DEFAULT_HABIT_GROUPS, DEFAULT_PROJECTS } from '@/lib/planner-types';
import type { Item } from '@/lib/planner-types';

/**
 * WHAT AN ACCOUNT GETS WRITTEN INTO IT WITHOUT ASKING.
 *
 * This is the highest-consequence automatic write in the app: it fires on load,
 * with no user gesture, against whatever the fetch happened to return. Every
 * branch is pinned here rather than through the store, because the failure worth
 * preventing — deciding a populated account is empty — is a decision this
 * function makes alone.
 *
 * The live data is the reason the rule is not "sections are empty, so seed": one
 * account carries 763 items, zero container rows, and 119 habits whose `group`
 * text reads "Personal" with nothing behind it.
 */

const task = (over: Partial<Item> = {}): Item =>
  ({ id: 't1', type: 'task', title: 'T', status: 'pending', isScheduled: false, order: 0, ...over }) as Item;

const habit = (over: Partial<Item> = {}): Item =>
  ({
    id: 'h1', type: 'habit', title: 'H', status: 'pending', repeatFrequency: 'daily',
    completedDates: [], skippedDates: [], streak: 0, group: 'Personal', order: 0, isScheduled: false,
    ...over,
  }) as Item;

const empty = { items: [], projects: [], habitGroups: [] };

describe('an account that already has containers', () => {
  it('is left alone entirely, even with only one of the two kinds', () => {
    // Deliberately NOT "no projects → seed projects". An account with habit
    // groups and no projects has made a choice, and first-run seeding is not
    // the place to second-guess it.
    expect(planSeed({ ...empty, projects: [{ name: 'Work' }] }).reason).toBe('none');
    expect(planSeed({ ...empty, habitGroups: [{ name: 'Morning' }] }).reason).toBe('none');
  });

  it('keeps its dangling names dangling', () => {
    /**
     * A live account references a project "Housework" that has no row, while
     * owning four other projects — so its owner is managing them by hand, and a
     * name they have not created in all that time is a name they do not want.
     * 027's backfill made the same call.
     */
    const plan = planSeed({
      items: [task({ project: 'Housework' })],
      projects: [{ name: 'Work' }],
      habitGroups: [],
    });
    expect(plan).toEqual({ reason: 'none', projects: [], groups: [] });
  });
});

describe('a brand-new account', () => {
  it('gets the whole starter set', () => {
    const plan = planSeed(empty);
    expect(plan.reason).toBe('new-account');
    expect(plan.projects).toEqual(DEFAULT_PROJECTS);
    expect(plan.groups).toEqual(DEFAULT_HABIT_GROUPS);
  });

  it('ships no name in both lists, so no filter chip is ambiguous', () => {
    // lib/filters.ts documents the cost: a saved filter stores a bare name and
    // the two namespaces are separate, so "Work" in both lists cannot be
    // resolved. The old constants collided on all three.
    const plan = planSeed(empty);
    const projects = new Set(plan.projects.map((p) => p.name));
    expect(plan.groups.some((g) => projects.has(g.name))).toBe(false);
  });

  it('ships icon TOKENS, not the bare emoji the constants had for a year', () => {
    for (const seed of [...planSeed(empty).projects, ...planSeed(empty).groups]) {
      expect(seed.emoji).toMatch(/^icon:[A-Z]/);
    }
  });

  it('skips a starter name the BIN is still holding', () => {
    // The unique indexes have no `WHERE deleted_at IS NULL`, so a soft-deleted
    // container reserves its name for thirty days while being invisible to
    // every fetch the store makes. Creating it anyway is 23505 and a phantom.
    const plan = planSeed({ ...empty, trashedProjectNames: ['Work'], trashedGroupNames: ['Morning'] });
    expect(plan.projects.map((p) => p.name)).not.toContain('Work');
    expect(plan.groups.map((g) => g.name)).not.toContain('Morning');
    expect(plan.projects.length).toBe(DEFAULT_PROJECTS.length - 1);
  });
});

describe('an account with items but no containers — the adopt case', () => {
  it('creates only the containers its items already name', () => {
    // The 119-habit case. It must NOT also invent Work, Home and Health into an
    // account that has visibly never used projects.
    const plan = planSeed({
      ...empty,
      items: [habit({ group: 'Personal' }), habit({ id: 'h2', group: 'Personal' })],
    });
    expect(plan.reason).toBe('adopt');
    expect(plan.groups.map((g) => g.name)).toEqual(['Personal']);
    expect(plan.projects).toEqual([]);
  });

  it('adopts project names too, from task-like items', () => {
    const plan = planSeed({ ...empty, items: [task({ project: 'Housework' })] });
    expect(plan.projects.map((p) => p.name)).toEqual(['Housework']);
  });

  it('leaves adopted glyphs unset, so nothing on screen changes', () => {
    // CategoryIcon's name hash is the glyph the app has drawn for that name all
    // along. Picking one here would restyle 119 rows as a side effect of a repair.
    const plan = planSeed({ ...empty, items: [habit({ group: 'Personal' })] });
    expect(plan.groups[0].emoji).toBe('');
  });

  it('does not case-fold, because the unique index does not', () => {
    // "personal" and "Personal" are two legal rows. Folding would adopt one and
    // leave the other half of the items dangling with no sign of why.
    const plan = planSeed({
      ...empty,
      items: [habit({ group: 'Personal' }), habit({ id: 'h2', group: 'personal' })],
    });
    expect(plan.groups.map((g) => g.name).sort()).toEqual(['Personal', 'personal']);
  });

  it('de-dupes, so 119 items naming one group make one container', () => {
    const items = Array.from({ length: 119 }, (_, i) => habit({ id: `h${i}`, group: 'Personal' }));
    expect(planSeed({ ...empty, items }).groups).toHaveLength(1);
  });

  it('drops blank and whitespace-only names', () => {
    // A cleared container used to write '' rather than NULL. A container named
    // "" is not something any surface can render or the user can delete.
    const plan = planSeed({
      ...empty,
      items: [habit({ group: '' }), habit({ id: 'h2', group: '   ' }), task({ project: '' })],
    });
    expect(plan.groups).toEqual([]);
    expect(plan.projects).toEqual([]);
  });

  it('trims, so " Personal" and "Personal" are one container', () => {
    const plan = planSeed({
      ...empty,
      items: [habit({ group: ' Personal' }), habit({ id: 'h2', group: 'Personal' })],
    });
    expect(plan.groups.map((g) => g.name)).toEqual(['Personal']);
  });

  it('skips a name the bin is holding, and adopts the rest', () => {
    const plan = planSeed({
      ...empty,
      items: [habit({ group: 'Personal' }), habit({ id: 'h2', group: 'Work' })],
      trashedGroupNames: ['Personal'],
    });
    expect(plan.groups.map((g) => g.name)).toEqual(['Work']);
  });

  it('NEVER falls through to the starter set', () => {
    // The whole point of the branch: an account with items is not new, however
    // few items it has, and giving it six containers it never asked for is the
    // outcome this design exists to prevent.
    const plan = planSeed({ ...empty, items: [task({ project: undefined })] });
    expect(plan.reason).toBe('adopt');
    expect(plan.projects).toEqual([]);
    expect(plan.groups).toEqual([]);
  });
});

/* ── the orchestration, where the ORDER is the design ─────────────────── */

describe('runFirstRunSeed', () => {
  const harness = (over: Partial<SeedDeps> = {}, state: Record<string, unknown> = {}) => {
    const calls: string[] = [];
    const deps: SeedDeps = {
      hasSeeded: vi.fn(async () => {
        calls.push('read-latch');
        return false;
      }),
      markSeeded: vi.fn(async () => {
        calls.push('set-latch');
      }),
      trashedNames: vi.fn(async () => {
        calls.push('read-bin');
        return { projects: [], groups: [] };
      }),
      snapshot: () => ({
        userId: 'u1',
        isLoading: false,
        items: [] as Item[],
        projects: [] as { name: string }[],
        habitGroups: [] as { name: string }[],
        ...state,
      }),
      commit: vi.fn(() => {
        calls.push('commit');
      }),
      ...over,
    };
    return { deps, calls };
  };

  it('LATCHES BEFORE COMMITTING, so a failed write cannot become a re-seed', async () => {
    // Latch afterwards and a failure in between leaves a load that seeds again.
    // The store's de-dupe would catch most of that, and "most" is not the
    // standard for a write the user never asked for.
    const { deps, calls } = harness();
    await runFirstRunSeed('u1', deps);
    expect(calls).toEqual(['read-latch', 'read-bin', 'set-latch', 'commit']);
  });

  it('reads the latch FIRST, so every later load is one SELECT and out', async () => {
    const { deps, calls } = harness({ hasSeeded: vi.fn(async () => true) });
    expect(await runFirstRunSeed('u1', deps)).toBe('none');
    expect(calls).toEqual([]);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.markSeeded).not.toHaveBeenCalled();
  });

  it('latches an account that needs nothing, so it stops being asked', async () => {
    const { deps } = harness({}, { projects: [{ name: 'Work' }] });
    expect(await runFirstRunSeed('u1', deps)).toBe('none');
    expect(deps.markSeeded).toHaveBeenCalledOnce();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('does nothing mid-load, and does NOT latch — the next load retries', async () => {
    // Seeding inside the load window is the documented trap: initializeStore
    // replaces the arrays wholesale, so the rows would vanish on the next
    // reload. Latching there would make that permanent.
    const { deps } = harness({}, { isLoading: true });
    expect(await runFirstRunSeed('u1', deps)).toBe('none');
    expect(deps.markSeeded).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('drops out if the account switched under the awaits', async () => {
    const { deps } = harness({}, { userId: 'someone-else' });
    expect(await runFirstRunSeed('u1', deps)).toBe('none');
    expect(deps.markSeeded).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('feeds the bin into the plan, so a held name is never created', async () => {
    const { deps } = harness({
      trashedNames: vi.fn(async () => ({ projects: [{ name: 'Work' }], groups: [] })),
    });
    await runFirstRunSeed('u1', deps);
    const plan = vi.mocked(deps.commit).mock.calls[0][0];
    expect(plan.projects.map((p) => p.name)).not.toContain('Work');
  });

  it('propagates a latch-write failure instead of committing anyway', async () => {
    const { deps } = harness({
      markSeeded: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await expect(runFirstRunSeed('u1', deps)).rejects.toThrow('offline');
    // The latch is what makes this one-shot. Committing without it would seed
    // again on the next load, and again after that.
    expect(deps.commit).not.toHaveBeenCalled();
  });
});
