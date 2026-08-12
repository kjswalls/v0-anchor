import { beforeEach, describe, expect, it } from 'vitest';
import { useViewStore } from '@/lib/view-store';
import {
  EMPTY_VIEW_FILTERS,
  containerRef,
  isEmptyFilters,
  normalizeFilters,
  projectNamesFrom,
  groupNamesFrom,
  containerName,
  containerKindOf,
} from '@/lib/filters';

/**
 * The rehydration gap the e2e suite structurally cannot cover.
 *
 * zustand's persist `merge` defaults to a SHALLOW `{...current, ...persisted}`,
 * so a nested object is replaced wholesale rather than merged. A stored
 * `anchor-view` blob predates `containers`, so without a custom merge every
 * existing install reads `filters.containers` as `undefined` and `.length`
 * throws on the first render — a white screen, not a degraded filter.
 *
 * tests/e2e/helpers/session.ts seeds a blob that OMITS both filter objects, so
 * every spec rehydrates fresh defaults and stays green while a real browser
 * breaks. That is why these are unit tests against `normalizeFilters` — the
 * function the store's `merge` runs both filter objects through — rather than
 * an e2e assertion. Do not delete them on the grounds that "e2e covers this".
 */

/**
 * The store's own `merge`, exercised through a real rehydrate.
 *
 * The tests below this block cover `normalizeFilters` in isolation, which is
 * necessary but NOT sufficient: delete the whole `merge:` block from
 * view-store's persist config and every one of them still passes, because none
 * of them touches the store. So does the e2e suite — its seeded blob omits both
 * filter objects and takes the trivial branch.
 *
 * These seed the blob a real pre-Phase-0 browser holds and drive
 * `persist.rehydrate()`. Both filter objects are asserted deliberately: a
 * half-wired merge that normalizes `canvasFilters` and passes
 * `braindumpFilters` through raw type-checks fine (the payload is cast to
 * Record<string, unknown>), leaves the suite green, and still white-screens the
 * sidebar.
 */
describe('the persist merge, through a real rehydrate', () => {
  const LEGACY = {
    projects: ['Work', 'Client: Acme'],
    priorities: ['high'],
    hideCompleted: true,
  };

  const seed = (state: Record<string, unknown>) =>
    localStorage.setItem('anchor-view', JSON.stringify({ version: 1, state }));

  beforeEach(() => {
    localStorage.clear();
  });

  it('fills containers on BOTH filter objects from a legacy payload', async () => {
    seed({ canvasFilters: { ...LEGACY }, braindumpFilters: { ...LEGACY } });

    await useViewStore.persist.rehydrate();
    const s = useViewStore.getState();

    for (const filters of [s.canvasFilters, s.braindumpFilters]) {
      expect(filters.containers).toEqual(['project:Work', 'project:Client: Acme']);
      expect(filters.priorities).toEqual(['high']);
      expect(filters.hideFinished).toBe(true);
    }
  });

  it('survives a payload that carries neither filter object', async () => {
    // This is what tests/e2e/helpers/session.ts seeds — which is exactly why
    // the e2e suite cannot catch a missing merge.
    seed({ scope: 'week', layout: 'list' });

    await useViewStore.persist.rehydrate();
    const s = useViewStore.getState();

    expect(s.canvasFilters.containers).toEqual([]);
    expect(s.braindumpFilters.containers).toEqual([]);
    expect(s.scope).toBe('week');
  });

  it('keeps the other top-level keys the shallow merge was already protecting', async () => {
    seed({ canvasFilters: { ...LEGACY }, collapsedBuckets: ['morning'], weekDaysVisible: 5 });

    await useViewStore.persist.rehydrate();
    const s = useViewStore.getState();

    expect(s.collapsedBuckets).toEqual(['morning']);
    expect(s.weekDaysVisible).toBe(5);
  });

  it('does not throw on a filter object stored as the wrong type', async () => {
    seed({ canvasFilters: 'nonsense', braindumpFilters: ['also', 'nonsense'] });

    await expect(useViewStore.persist.rehydrate()).resolves.not.toThrow();
    const s = useViewStore.getState();

    expect(s.canvasFilters.containers).toEqual([]);
    expect(s.braindumpFilters.containers).toEqual([]);
  });
});

describe('normalizeFilters — rehydrating a stored payload', () => {
  it('fills in containers for a blob that predates the field', () => {
    // The exact shape a pre-Phase-0 install has in localStorage.
    const stored = { projects: ['Work', 'Home'], priorities: ['high'], hideCompleted: true };

    const merged = normalizeFilters(stored);

    expect(merged.containers).toEqual(['project:Work', 'project:Home']);
    expect(merged.priorities).toEqual(['high']);
    expect(merged.hideFinished).toBe(true);
  });

  it('yields empty arrays — never undefined — for a blob with no filter data', () => {
    // This is the case that throws without a merge: `.length` on undefined.
    for (const stored of [undefined, null, {}, 'nonsense', 42]) {
      const merged = normalizeFilters(stored);
      expect(merged.containers).toEqual([]);
      expect(merged.priorities).toEqual([]);
      expect(merged.hideFinished).toBe(false);
      expect(() => merged.containers.length).not.toThrow();
    }
  });

  it('is idempotent — an already-normalized value passes through unchanged', () => {
    // The merge runs on every rehydrate, so a second pass must not re-prefix.
    const once = normalizeFilters({ projects: ['Work'] });
    const twice = normalizeFilters(once);
    expect(twice).toEqual(once);
    expect(twice.containers).toEqual(['project:Work']);
  });

  it('prefixes a legacy name that CONTAINS a colon, rather than assuming it is a ref', () => {
    // Project names are unvalidated free text — manage-categories only trims,
    // and no migration adds a CHECK. A contains-a-colon test would leave this
    // bare, `projectNamesFrom` would drop it, and the project filter would
    // silently stop narrowing while the trigger still counted one active
    // clause. This asserts the whole round trip, not just the prefixing.
    const merged = normalizeFilters({ projects: ['Client: Acme', 'Work'] });

    expect(merged.containers).toEqual(['project:Client: Acme', 'project:Work']);
    expect(projectNamesFrom(merged.containers)).toEqual(['Client: Acme', 'Work']);
  });

  it('prefixes a legacy name that looks like a ref for the other namespace', () => {
    // A project literally named "group:health" is a legal project name. Treated
    // as an already-formed ref it would resolve to a habit GROUP — the wrong
    // container entirely. The legacy array only ever held project names.
    const merged = normalizeFilters({ projects: ['group:health'] });

    expect(merged.containers).toEqual(['project:group:health']);
    expect(projectNamesFrom(merged.containers)).toEqual(['group:health']);
    expect(groupNamesFrom(merged.containers)).toEqual([]);
  });

  it('prefers the new field when a blob carries both', () => {
    const merged = normalizeFilters({
      projects: ['Stale'],
      containers: ['project:Fresh'],
      hideCompleted: false,
      hideFinished: true,
    });
    expect(merged.containers).toEqual(['project:Fresh']);
    expect(merged.hideFinished).toBe(true);
  });

  it('drops a non-array containers value rather than passing it through', () => {
    expect(normalizeFilters({ containers: 'project:Work' }).containers).toEqual([]);
  });
});

describe('the container vocabulary', () => {
  it('separates the two namespaces so a shared name cannot collide', () => {
    // Not hypothetical: DEFAULT_PROJECTS and DEFAULT_HABIT_GROUPS both seed
    // Work / Wellness / Personal.
    const containers = [containerRef('project', 'Work'), containerRef('group', 'Work')];

    expect(projectNamesFrom(containers)).toEqual(['Work']);
    expect(groupNamesFrom(containers)).toEqual(['Work']);
    expect(containers[0]).not.toBe(containers[1]);
  });

  it('round-trips a name through a ref', () => {
    expect(containerName(containerRef('project', 'Side project'))).toBe('Side project');
    expect(containerKindOf(containerRef('group', 'health'))).toBe('group');
  });

  it('survives a name containing a colon', () => {
    const ref = containerRef('project', 'Q3: launch');
    expect(containerName(ref)).toBe('Q3: launch');
    expect(containerKindOf(ref)).toBe('project');
    expect(projectNamesFrom([ref])).toEqual(['Q3: launch']);
  });

  it('reports no kind for an unprefixed legacy value', () => {
    expect(containerKindOf('Work')).toBeNull();
    expect(containerName('Work')).toBe('Work');
  });
});

describe('isEmptyFilters', () => {
  it('is true for the shared empty and false once any clause is set', () => {
    expect(isEmptyFilters(EMPTY_VIEW_FILTERS)).toBe(true);
    expect(isEmptyFilters({ ...EMPTY_VIEW_FILTERS, containers: ['project:Work'] })).toBe(false);
    expect(isEmptyFilters({ ...EMPTY_VIEW_FILTERS, priorities: ['high'] })).toBe(false);
    expect(isEmptyFilters({ ...EMPTY_VIEW_FILTERS, hideFinished: true })).toBe(false);
  });
});
