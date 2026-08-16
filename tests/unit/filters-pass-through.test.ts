import { describe, it, expect } from 'vitest';
import { deriveDayItems, type DayItemsInput } from '@/lib/day-items';
import {
  EMPTY_VIEW_FILTERS,
  NO_CONTAINER,
  NO_PRIORITY,
  containerRef,
  containerRefOf,
  passesContainerFilter,
  passesPriorityFilter,
  typeNameOf,
  type ViewFilters,
} from '@/lib/filters';
import type { Habit, Item, Project, Task } from '@/lib/planner-types';

/**
 * The pass-through rule: a predicate on field F may only exclude items of a
 * type that CARRIES F.
 *
 * What it replaced was three copies of `if (priorities.length ||
 * projects.length) return []` — one per surface — which deleted every habit the
 * moment any priority or project filter was on. NOTHING covered that behaviour,
 * so its removal broke no test; these exist so the reverse can never happen
 * silently either.
 */

const TZ = 'America/New_York';
const DATE_STR = '2026-07-08'; // a Wednesday
const DATE = new Date('2026-07-08T12:00:00');

const task = (over: Partial<Task>): Task =>
  ({
    id: Math.random().toString(36).slice(2),
    title: 'task',
    status: 'pending',
    isScheduled: true,
    order: 0,
    startDate: DATE_STR,
    timeBucket: 'morning',
    ...over,
  }) as Task;

const habit = (over: Partial<Habit>): Habit =>
  ({
    id: Math.random().toString(36).slice(2),
    title: 'habit',
    group: 'wellness',
    status: 'pending',
    streak: 0,
    completedDates: [],
    skippedDates: [],
    repeatFrequency: 'daily',
    timeBucket: 'morning',
    ...over,
  }) as Habit;

const input = (over: Partial<DayItemsInput>): DayItemsInput => ({
  tasks: [],
  habits: [],
  projects: [],
  dateStr: DATE_STR,
  date: DATE,
  timezone: TZ,
  typeFilter: 'all',
  showCompletedTasks: true,
  ...over,
});

const filters = (over: Partial<ViewFilters>): ViewFilters => ({
  ...EMPTY_VIEW_FILTERS,
  ...over,
});

const morningIds = (r: ReturnType<typeof deriveDayItems>) => ({
  tasks: r.tasksByBucket.morning.map((t) => t.id),
  habits: r.habitsByBucket.morning.map((h) => h.id),
});

/* ── the bug this phase exists to kill ──────────────────────────────────── */

describe('habits survive a filter on a field they do not carry', () => {
  it('a priority filter no longer deletes every habit', () => {
    const high = task({ priority: 'high' });
    const low = task({ priority: 'low' });
    const h = habit({});

    const r = deriveDayItems(
      input({ tasks: [high, low], habits: [h], filters: filters({ priorities: ['high'] }) })
    );

    expect(morningIds(r)).toEqual({ tasks: [high.id], habits: [h.id] });
  });

  it('a project filter no longer deletes every habit — it asks for their group', () => {
    const inWork = task({ project: 'Work' });
    const inHome = task({ project: 'Home' });
    const wellness = habit({ group: 'wellness' });
    const health = habit({ group: 'health' });

    const r = deriveDayItems(
      input({
        tasks: [inWork, inHome],
        habits: [wellness, health],
        // One axis, two namespaces: a project AND a habit group at once.
        filters: filters({ containers: [containerRef('project', 'Work'), containerRef('group', 'health')] }),
      })
    );

    expect(morningIds(r)).toEqual({ tasks: [inWork.id], habits: [health.id] });
  });

  it('a project-only filter excludes habits by their group, not by fiat', () => {
    // The habit is dropped because its GROUP is not selected — a real answer to
    // the container question — not because it "has no project".
    const t = task({ project: 'Work' });
    const h = habit({ group: 'wellness' });

    const r = deriveDayItems(
      input({ tasks: [t], habits: [h], filters: filters({ containers: [containerRef('project', 'Work')] }) })
    );

    expect(morningIds(r)).toEqual({ tasks: [t.id], habits: [] });
  });
});

/* ── unset is a value, not oblivion ─────────────────────────────────────── */

describe('explicit None values', () => {
  it('No priority selects the tasks whose priority was never set', () => {
    const unset = task({});
    const high = task({ priority: 'high' });

    const r = deriveDayItems(
      input({ tasks: [unset, high], filters: filters({ priorities: [NO_PRIORITY] }) })
    );

    expect(morningIds(r).tasks).toEqual([unset.id]);
  });

  it('High no longer silently deletes the unset majority... but does exclude them', () => {
    // The old predicate rejected `!task.priority` under ANY selection, so this
    // looked the same. The difference is that unset is now reachable — the
    // test above — rather than unaddressable.
    const unset = task({});
    const high = task({ priority: 'high' });

    const r = deriveDayItems(
      input({ tasks: [unset, high], filters: filters({ priorities: ['high'] }) })
    );

    expect(morningIds(r).tasks).toEqual([high.id]);
  });

  it('No project selects task-likes with no project, and No group habits with none', () => {
    const noProject = task({});
    const inWork = task({ project: 'Work' });
    // itemFromRow maps a NULL column to '', so '' is the live "no group" value.
    const noGroup = habit({ group: '' });
    const inWellness = habit({ group: 'wellness' });

    const r = deriveDayItems(
      input({
        tasks: [noProject, inWork],
        habits: [noGroup, inWellness],
        filters: filters({ containers: [NO_CONTAINER] }),
      })
    );

    expect(morningIds(r)).toEqual({ tasks: [noProject.id], habits: [noGroup.id] });
  });
});

/* ── the case collision the seeds ship with ─────────────────────────────── */

describe('habit groups compare case-insensitively, projects exactly', () => {
  it("matches 'personal' against 'Personal'", () => {
    // makeAddDraft falls back to a lowercase 'personal' when an account has no
    // groups, and 119 habits on the live database carry a capitalised
    // 'Personal' from before that. Both exist in real data, which is why the
    // comparison folds. (The starter set no longer ships either — Phase 6
    // renamed the defaults — but the rows that do are still out there.)
    const lower = habit({ group: 'personal' });
    const upper = habit({ group: 'Personal' });

    const r = deriveDayItems(
      input({ habits: [lower, upper], filters: filters({ containers: [containerRef('group', 'Personal')] }) })
    );

    expect(morningIds(r).habits).toEqual([lower.id, upper.id]);
  });

  it('does NOT fold project names — those are typed once and compared exactly', () => {
    const work = task({ project: 'Work' });
    const lower = task({ project: 'work' });

    const r = deriveDayItems(
      input({ tasks: [work, lower], filters: filters({ containers: [containerRef('project', 'Work')] }) })
    );

    expect(morningIds(r).tasks).toEqual([work.id]);
  });
});

/* ── the fourth row kind ────────────────────────────────────────────────── */

describe('recurring project blocks', () => {
  const block = (name: string): Project => ({
    id: `p-${name}`,
    name,
    emoji: '📁',
    startTime: '09:00',
    timeBucket: 'morning',
    repeatFrequency: 'daily',
  });

  it('is narrowed by the container filter — other projects stop leaving empty blocks', () => {
    const r = deriveDayItems(
      input({
        projects: [block('Work'), block('Home')],
        filters: filters({ containers: [containerRef('project', 'Work')] }),
      })
    );

    expect(r.recurringProjects.map((p) => p.name)).toEqual(['Work']);
  });

  it('is left alone by a priority filter — a block has no priority', () => {
    const r = deriveDayItems(
      input({ projects: [block('Work')], filters: filters({ priorities: ['high'] }) })
    );

    expect(r.recurringProjects.map((p) => p.name)).toEqual(['Work']);
  });
});

/* ── skipped occurrences ────────────────────────────────────────────────── */

describe('hide finished covers skipped occurrences', () => {
  it('hides a habit skipped on this date when the toggle is on', () => {
    const skipped = habit({ skippedDates: [DATE_STR] });
    const normal = habit({});

    const on = deriveDayItems(
      input({ habits: [skipped, normal], filters: filters({ hideFinished: true }) })
    );
    const off = deriveDayItems(input({ habits: [skipped, normal] }));

    expect(morningIds(on).habits).toEqual([normal.id]);
    expect(morningIds(off).habits).toEqual([skipped.id, normal.id]);
  });

  it('the global showCompletedTasks setting does NOT hide skips', () => {
    // Its settings copy promises "Tasks only — habits always stay". Folding the
    // skip term into it would make a tasks-only setting hide habits.
    const skipped = habit({ skippedDates: [DATE_STR] });

    const r = deriveDayItems(
      input({ habits: [skipped], showCompletedTasks: false, filters: filters({ hideFinished: false }) })
    );

    expect(morningIds(r).habits).toEqual([skipped.id]);
  });

  it('hides a skipped recurring task the same way', () => {
    const skipped = task({ repeatFrequency: 'daily', skippedDates: [DATE_STR] } as Partial<Task>);
    const normal = task({ repeatFrequency: 'daily' } as Partial<Task>);

    const r = deriveDayItems(
      input({ tasks: [skipped, normal], filters: filters({ hideFinished: true }) })
    );

    expect(morningIds(r).tasks).toEqual([normal.id]);
  });
});

/* ── the unit-level rule ────────────────────────────────────────────────── */

describe('the predicates themselves', () => {
  const asItem = (o: object) => o as Item;

  it('resolves the container axis per type through the registry', () => {
    expect(containerRefOf(asItem({ type: 'task', project: 'Work' }))).toBe('project:Work');
    expect(containerRefOf(asItem({ type: 'habit', group: 'health' }))).toBe('group:health');
    // Custom types are project-shaped (see the Step 1 commit).
    expect(containerRefOf(asItem({ type: 'custom', customType: 'goal', project: 'Work' }))).toBe(
      'project:Work'
    );
  });

  it('answers NO_CONTAINER for a carried-but-unset container', () => {
    expect(containerRefOf(asItem({ type: 'task' }))).toBe(NO_CONTAINER);
    expect(containerRefOf(asItem({ type: 'habit', group: '' }))).toBe(NO_CONTAINER);
  });

  it('passes an item through an axis its type does not carry', () => {
    const h = asItem({ type: 'habit', group: 'health' });
    expect(passesPriorityFilter(h, ['high'])).toBe(true);
  });

  it('is a no-op on an empty selection', () => {
    const t = asItem({ type: 'task', project: 'Work', priority: 'low' });
    expect(passesPriorityFilter(t, [])).toBe(true);
    expect(passesContainerFilter(t, [])).toBe(true);
  });

  it('resolves the registry name off a projection row that lost its declared type', () => {
    expect(typeNameOf({ type: 'custom', customType: 'goal' } as unknown as Task)).toBe('goal');
    expect(typeNameOf({} as unknown as Task)).toBe('task');
  });
});
