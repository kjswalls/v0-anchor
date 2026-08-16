import { describe, it, expect } from 'vitest';
import { groupRows, type GroupableRow } from '@/lib/grouping';
import { groupBySupport } from '@/lib/view-options';
import type { GroupBy, Habit, Task } from '@/lib/planner-types';

/**
 * The shared grouping core (Phase 5a).
 *
 * `buildListGroups` lived inside components/views/day-list.tsx, which is why one
 * view honoured five values and the other five honoured at most one. These cases
 * are about what moved and what CHANGED while it moved — the container axis and
 * the priority axis both stopped hoisting habits into a section named after
 * their type.
 */

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id,
    title: `Task ${id}`,
    status: 'pending',
    isScheduled: true,
    order: 0,
    timeBucket: 'morning',
    ...over,
  }) as Task;

const habit = (id: string, over: Partial<Habit> = {}): Habit =>
  ({
    id,
    title: `Habit ${id}`,
    group: 'Health',
    streak: 0,
    status: 'pending',
    completedDates: [],
    skippedDates: [],
    repeatFrequency: 'daily',
    timeBucket: 'morning',
    ...over,
  }) as Habit;

const t = (id: string, over: Partial<Task> = {}): GroupableRow => ({
  itemType: 'task',
  item: task(id, over),
});
const h = (id: string, over: Partial<Habit> = {}): GroupableRow => ({
  itemType: 'habit',
  item: habit(id, over),
});

const labels = (gs: { label: string }[]) => gs.map((g) => g.label);
const ids = (g: { rows: GroupableRow[] }) => g.rows.map((r) => r.item.id);

describe('groupRows — the container axis', () => {
  it('sections habits by their own GROUP instead of hoisting them out', () => {
    // The half of the habits fix grouping never got. buildListGroups put every
    // habit in one "Habits" section and grouped only the tasks, so "group by
    // Project" answered a question about tasks and then filed the rest of the
    // day under its own type name. A habit is not container-less — it answers
    // with its group, exactly as passesContainerFilter has since Phase 1.
    const out = groupRows([h('h1', { group: 'Health' }), t('t1', { project: 'Work' })], 'project');

    expect(labels(out)).toEqual(['Health', 'Work']);
    expect(out.map(ids)).toEqual([['h1'], ['t1']]);
  });

  it('keeps a project and a habit group of the SAME NAME apart', () => {
    // DEFAULT_PROJECTS and DEFAULT_HABIT_GROUPS both seed Work, Wellness and
    // Personal, so this is the shipped state of a fresh account, not an edge
    // case. Two sections under one React key reconcile against a single fiber.
    const out = groupRows([h('h1', { group: 'Work' }), t('t1', { project: 'Work' })], 'project');

    expect(labels(out)).toEqual(['Work', 'Work']);
    // The group key is case-folded (see the case-variant case below); the
    // project key is not. The namespaces keep them apart either way.
    expect(out.map((g) => g.key)).toEqual(['group:work', 'project:Work']);
    expect(new Set(out.map((g) => g.key)).size).toBe(2);
  });

  it('merges two case-variant spellings of ONE habit group', () => {
    // The filter folds case for `group:` refs — a deliberate asymmetry
    // (filters.ts:140-150), because makeAddDraft writes a lowercase 'personal'
    // against DEFAULT_HABIT_GROUPS' 'Personal' whenever the groups list has not
    // loaded. Keyed on the raw ref, grouping split them into two sections that
    // the menu's single "Personal" checkbox selects together.
    const out = groupRows([h('h1', { group: 'personal' }), h('h2', { group: 'Personal' })], 'project');

    expect(out).toHaveLength(1);
    expect(ids(out[0])).toEqual(['h1', 'h2']);
    // First spelling seen wins the heading — the store's own order.
    expect(out[0].label).toBe('personal');
  });

  it('does NOT fold case for projects, which compare exactly everywhere else', () => {
    const out = groupRows([t('t1', { project: 'work' }), t('t2', { project: 'Work' })], 'project');

    expect(out.map((g) => g.key)).toEqual(['project:work', 'project:Work']);
  });

  it('says which SIDE of the axis is unset rather than merging the two', () => {
    // The filter needs one "No project or group" checkbox that catches both
    // sides. A heading has room to say which side it is, and "No project" over a
    // stack of habits would be false.
    const out = groupRows([h('h1', { group: '' }), t('t1', { project: undefined })], 'project');

    expect(labels(out)).toEqual(['No group', 'No project']);
  });

  it('puts the unset sections last, however early they arrive', () => {
    // The sort side's rule (sort-rows.ts UNSET_RANK) applied to sections: most
    // items have no container, so first would bury the ones that do.
    const out = groupRows(
      [t('none1', { project: undefined }), t('w', { project: 'Work' })],
      'project'
    );

    expect(labels(out)).toEqual(['Work', 'No project']);
  });

  it('resolves a custom type through the registry, not as a bare task', () => {
    // The custom template carries containerKind: 'projects' (Step 1). Before
    // that fix buildListGroups filed every custom item under "No project"
    // while it carried a real one.
    const out = groupRows(
      [{ itemType: 'task', item: task('c', { type: 'custom', customType: 'errand', project: 'Work' } as Partial<Task>) }],
      'project'
    );

    expect(labels(out)).toEqual(['Work']);
  });
});

describe('groupRows — the priority axis', () => {
  it('lands a habit in No priority, not in a section named for its type', () => {
    // The same call sortRows already makes: a type that does not CARRY priority
    // ranks as unset. The old "Habits" section here was type grouping smuggled
    // into a priority question — and it silently excluded custom types, which
    // DO carry priority and so were ranked while habits were hoisted.
    const out = groupRows([h('h1'), t('t1', { priority: 'high' })], 'priority');

    expect(labels(out)).toEqual(['High', 'No priority']);
    expect(ids(out[1])).toEqual(['h1']);
  });

  it('holds the High/Medium/Low/None ladder whatever order rows arrive in', () => {
    const out = groupRows(
      [t('l', { priority: 'low' }), t('n'), t('hi', { priority: 'high' }), t('m', { priority: 'medium' })],
      'priority'
    );

    expect(labels(out)).toEqual(['High', 'Medium', 'Low', 'No priority']);
  });

  it('emits no empty sections for the bands nothing is in', () => {
    const out = groupRows([t('hi', { priority: 'high' })], 'priority');
    expect(labels(out)).toEqual(['High']);
  });
});

describe('groupRows — the bucket axis', () => {
  it('orders sections by BUCKET_ORDER, not by arrival', () => {
    const out = groupRows(
      [t('e', { timeBucket: 'evening' }), t('a', { timeBucket: 'anytime' })],
      'bucket'
    );

    expect(labels(out)).toEqual(['Anytime', 'Evening']);
  });

  it('keeps a bucketless row in a trailing section rather than eating it', () => {
    // Unreachable from the canvas — deriveDayItems drops anything without a
    // bucket — but the braindump's corpus is exactly the rows that have none,
    // and a grouping that dropped them would be a disappearing-items bug.
    const out = groupRows([t('u', { timeBucket: undefined }), t('m')], 'bucket');

    expect(labels(out)).toEqual(['Morning', 'No time bucket']);
    expect(ids(out[1])).toEqual(['u']);
  });
});

describe('groupRows — the contract every caller depends on', () => {
  const rows = [
    h('h1', { group: 'Health' }),
    h('h2', { group: '' }),
    t('t1', { project: 'Work', priority: 'low', timeBucket: 'evening' }),
    t('t2', { priority: 'high' }),
    t('t3', { project: 'Work' }),
  ];
  const values: GroupBy[] = ['none', 'project', 'priority', 'bucket', 'routine'];

  it('never loses a row and never renders one twice', () => {
    for (const value of values) {
      const out = groupRows(rows, value, { routines: [] });
      const seen = out.flatMap(ids);
      expect([...seen].sort()).toEqual(['h1', 'h2', 't1', 't2', 't3']);
    }
  });

  it('never emits an empty section', () => {
    for (const value of values) {
      const out = groupRows(rows, value, { routines: [] });
      expect(out.every((g) => g.rows.length > 0)).toBe(true);
    }
  });

  it('returns rows in the order they arrived, so the CALLER can sort per group', () => {
    // Load-bearing, not incidental. Every surface applies sortRows to each
    // group after this returns; if this sorted, grouping and ordering would
    // fight. And sorting the flat list BEFORE this runs reorders the sections,
    // because the maps here are filled by walking the rows — the defect the
    // braindump shipped for one commit.
    const out = groupRows([t('z', { project: 'Work' }), t('a', { project: 'Work' })], 'project');

    expect(ids(out[0])).toEqual(['z', 'a']);
  });

  it("hands 'none' back as one unlabelled section, not as a per-view default", () => {
    // A surface whose no-grouping look is something richer — Day x List's
    // HABITS / TASKS / PROJECTS — owns that itself. It is a presentation choice
    // for that view, not an answer to "group by what".
    const out = groupRows(rows, 'none');

    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('');
    // The SAME ARRAY, unreordered. 'none' is both stores' default and the flat
    // producer for Week x List, both Anytime strips and the braindump, and
    // nothing downstream re-orders it — sortRows('default') is an identity and
    // the two Schedules never call it at all. So whatever this returns reaches
    // the DOM, and asserting only the length let a sort inside this branch pass.
    expect(out[0].rows).toBe(rows);
  });

  it('returns nothing at all for no rows', () => {
    expect(groupRows([], 'none')).toEqual([]);
    expect(groupRows([], 'project')).toEqual([]);
  });
});

describe('groupBySupport — how far a value reaches', () => {
  it('calls Time bucket on Buckets inert, because the view IS that partition', () => {
    // The only combination left that does nothing. Four cards of one bucket
    // each, sectioned by bucket, is four cards holding one section apiece.
    expect(groupBySupport('day', 'buckets', 'bucket')).toEqual({
      honoured: false,
      note: 'Already by bucket',
    });
    expect(groupBySupport('week', 'buckets', 'bucket').honoured).toBe(false);
  });

  it('honours the rest of Buckets, and says which part of a Day card it reaches', () => {
    // Untimed only: the timed spine below carries the
    // scheduled:{bucket}:before|after:{type}:{id} drop zones, and inferDropTime
    // resolves those against the neighbouring row's own time.
    expect(groupBySupport('day', 'buckets', 'priority')).toEqual({
      honoured: true,
      note: 'Untimed rows only',
    });
  });

  it('reaches a whole week CELL, which has no spine to protect', () => {
    // One week:{date}:{bucket} droppable, no per-row drop zones, and the cell
    // renders every habit before every task — so it was never in one time order
    // for a partition to disturb.
    expect(groupBySupport('week', 'buckets', 'priority')).toEqual({ honoured: true, note: null });
  });

  it('honours Schedule outright now that the grid partitions on x', () => {
    // Phase 5b: Day divides into lanes where the field can afford them and falls
    // back to focus where it cannot; Week is always focus. Which of the two you
    // get depends on the measured field and the group count, which a rail cannot
    // state — the cap row above the grid shows it instead.
    for (const scope of ['day', 'week'] as const) {
      expect(groupBySupport(scope, 'schedule', 'project')).toEqual({ honoured: true, note: null });
      expect(groupBySupport(scope, 'schedule', 'routine')).toEqual({ honoured: true, note: null });
    }
  });

  it('keeps Time bucket on Schedule to the Anytime strip', () => {
    // y already IS time. Four bucket-lanes would be a diagonal staircase with
    // three quarters of the field dead, so the grid declines it and the strip
    // still sections by it — honoured, partly, which is what the rail says.
    for (const scope of ['day', 'week'] as const) {
      expect(groupBySupport(scope, 'schedule', 'bucket')).toEqual({
        honoured: true,
        note: 'Anytime only',
      });
    }
  });

  it('never blocks None — it is how you turn grouping off from anywhere', () => {
    for (const scope of ['day', 'week'] as const) {
      for (const layout of ['buckets', 'schedule', 'list'] as const) {
        expect(groupBySupport(scope, layout, 'none')).toEqual({ honoured: true, note: null });
      }
    }
  });

  it('leaves both List layouts unqualified', () => {
    for (const scope of ['day', 'week'] as const) {
      for (const value of ['project', 'priority', 'bucket', 'routine'] as const) {
        expect(groupBySupport(scope, 'list', value)).toEqual({ honoured: true, note: null });
      }
    }
  });
});
