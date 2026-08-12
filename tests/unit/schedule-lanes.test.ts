import { describe, it, expect } from 'vitest';
import { planLanes, resolveFocus, isReceded, laneBudget, NO_LANES } from '@/lib/schedule-lanes';
import { layoutOverlaps } from '@/lib/schedule-overlap';
import { MIN_CHANNEL_PX } from '@/lib/schedule-constants';
import type { GroupableRow } from '@/lib/grouping';
import type { Habit, Task } from '@/lib/planner-types';

/**
 * Lanes and focus — how a Schedule grid answers a grouping (Phase 5b).
 *
 * The grid cannot take section headings, so the partition goes on x. x is not
 * free, which is why there are two answers and the choice between them is
 * arithmetic. These pin the arithmetic; the rendered halves are in
 * schedule-lanes-render.test.tsx.
 */

const t = (id: string, over: Partial<Task> = {}): GroupableRow => ({
  itemType: 'task',
  item: {
    id,
    title: `Task ${id}`,
    status: 'pending',
    isScheduled: true,
    order: 0,
    timeBucket: 'morning',
    ...over,
  } as Task,
});

const h = (id: string, over: Partial<Habit> = {}): GroupableRow => ({
  itemType: 'habit',
  item: {
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
  } as Habit,
});

/** Three projects — enough to divide, small enough to fit any realistic field. */
const THREE = [
  t('a', { project: 'Work' }),
  t('b', { project: 'Home' }),
  t('c', { project: 'Admin' }),
];
const WIDE = 900;

describe('planLanes — which answer the grid gets', () => {
  it('does nothing at all when nothing is grouped', () => {
    expect(planLanes(THREE, 'none', { variant: 'day', fieldWidth: WIDE })).toEqual(NO_LANES);
  });

  it('divides a wide DAY field into one band per group', () => {
    const plan = planLanes(THREE, 'project', { variant: 'day', fieldWidth: WIDE });

    expect(plan.mode).toBe('lanes');
    expect(plan.lanes.map((l) => l.label)).toEqual(['Work', 'Home', 'Admin']);
    // Bands tile the field with no gap and no overlap: lane i owns
    // [i/n, (i+1)/n], written as the left and right insets the overlap pass
    // takes as its root.
    expect(plan.lanes.map((l) => [l.leftPct, l.rightPct])).toEqual([
      [0, 200 / 3],
      [100 / 3, 100 / 3],
      [200 / 3, 0],
    ]);
    for (const lane of plan.lanes) expect(lane.leftPct + lane.rightPct).toBeCloseTo(200 / 3, 9);
  });

  it('never divides WEEK, because a column is exactly one channel', () => {
    // Arithmetic, not a compromise: at every derived default a week column is
    // one 140px channel, so there is nothing to divide. Focus costs no pixels.
    const plan = planLanes(THREE, 'project', { variant: 'week', fieldWidth: WIDE });

    expect(plan.mode).toBe('focus');
    expect(plan.lanes.map((l) => l.label)).toEqual(['Work', 'Home', 'Admin']);
    expect(plan.lanes.every((l) => l.leftPct === 0 && l.rightPct === 0)).toBe(true);
  });

  it('never divides by ROUTINE, on any variant or width', () => {
    // Membership is many-to-many and the grouping branch is first-claim-wins, so
    // x cannot express insert-into-B versus move-to-B. Focus-only in every
    // version, not just this one.
    const rows = [t('a'), t('b')];
    const routines = [{ id: 'r', name: 'Mornings', itemIds: ['a'] }];
    const plan = planLanes(rows, 'routine', { variant: 'day', fieldWidth: 4000, routines });

    expect(plan.mode).toBe('focus');
    expect(plan.lanes.map((l) => l.label)).toEqual(['Mornings', 'No routine']);
  });

  it('falls back to focus past the lane budget rather than folding an "Other" lane', () => {
    // A lane naming groups it cannot spatially distinguish is a channel that
    // lies. The whole view goes to focus instead, where every group is one click
    // from the full field.
    const many = Array.from({ length: 8 }, (_, i) => t(`t${i}`, { project: `P${i}` }));
    const narrow = MIN_CHANNEL_PX * 3;

    expect(laneBudget(narrow)).toBe(3);
    expect(planLanes(many, 'project', { variant: 'day', fieldWidth: narrow }).mode).toBe('focus');
    // …and divides once the field can carry all eight.
    expect(
      planLanes(many, 'project', { variant: 'day', fieldWidth: MIN_CHANNEL_PX * 8 }).mode
    ).toBe('lanes');
  });

  it('falls back to focus when the field has not been measured yet', () => {
    // First paint. Dividing on a guess would lay the grid out once and re-lay it
    // a frame later, which is the jump the freeze exists to avoid elsewhere.
    expect(planLanes(THREE, 'project', { variant: 'day', fieldWidth: null }).mode).toBe('focus');
  });

  it('does not divide for ONE group — that is a label, not a partition', () => {
    const plan = planLanes([t('a', { project: 'Work' })], 'project', {
      variant: 'day',
      fieldWidth: WIDE,
    });

    expect(plan.mode).toBe('focus');
    expect(plan.lanes.map((l) => l.label)).toEqual(['Work']);
  });

  it('files every row in exactly one lane, habits included', () => {
    // The container axis resolves through the registry, so a habit answers with
    // its GROUP and gets a lane of its own rather than being hoisted out.
    const plan = planLanes([h('h1', { group: 'Health' }), ...THREE], 'project', {
      variant: 'day',
      fieldWidth: WIDE,
    });

    expect([...plan.laneOf.keys()].sort()).toEqual(['a', 'b', 'c', 'h1']);
    expect(plan.laneOf.get('h1')).toBe('group:health');
    expect(plan.lanes.reduce((n, l) => n + l.count, 0)).toBe(4);
  });
});

describe('focus — the half that costs no pixels', () => {
  const plan = planLanes(THREE, 'project', { variant: 'day', fieldWidth: WIDE });

  it('recedes every lane but the focused one', () => {
    expect(isReceded(plan, 'project:Work', 'a')).toBe(false);
    expect(isReceded(plan, 'project:Work', 'b')).toBe(true);
  });

  it('recedes nothing while no lane is focused', () => {
    for (const id of ['a', 'b', 'c']) expect(isReceded(plan, null, id)).toBe(false);
  });

  it('ignores a key that no current lane answers to', () => {
    // Focus is held in a store that knows nothing about grouping, so a key
    // outlives the lanes that named it: group by Project, focus Work, switch to
    // Priority. Resolving against the CURRENT plan makes it stop applying —
    // clearing it would work too, but a stale key that still applied would
    // recede the entire grid with nothing on screen able to explain it.
    expect(resolveFocus(plan, 'priority:high')).toBeNull();
    for (const id of ['a', 'b', 'c']) expect(isReceded(plan, 'priority:high', id)).toBe(false);
  });

  it('never recedes a row the plan never saw', () => {
    // Defensive rather than currently reachable: both call sites build the plan
    // from the same array they render. But they are two expressions in two
    // memos, and the failure modes are not symmetric — a stray at full strength
    // is a block that stands out on a focused day, while a receded stray is work
    // greyed out for a reason nothing on screen can explain.
    //
    // The obvious `laneKeyOf(...) !== active` gives the expensive end, and did:
    // this case failed on the first run, against a docstring three lines up
    // asserting the opposite.
    expect(isReceded(plan, 'project:Work', 'not-in-the-plan')).toBe(false);
  });
});

describe('the overlap pass, given a lane band', () => {
  const at = (id: string, startMin: number, duration: number) => ({ id, startMin, duration });
  const base = { hourPx: 60, gridStartMin: 0, variant: 'day' as const, fieldWidth: 900 };

  it('lays out a LONE block, which without a band it deliberately does not', () => {
    // The absence of a layout MEANS "the whole field" to the renderer, which is
    // exactly the wrong default once a block belongs to a lane. This is the one
    // behaviour a root band changes for every entry, not just overlapping ones.
    const solo = [at('x', 540, 60)];

    expect(layoutOverlaps(solo, base).size).toBe(0);
    expect(layoutOverlaps(solo, { ...base, root: { leftPct: 50, rightPct: 0 } }).get('x')).toMatchObject({
      left: 'calc(50% + 0px)',
      right: '4px',
      widthFraction: 0.5,
    });
  });

  it('leaves an ungrouped field byte-for-byte as it was', () => {
    // The property the whole pass is built on — an uncrowded day pays nothing
    // for this file existing — and the regression a root band could have broken.
    const two = [at('a', 540, 120), at('b', 600, 60)];
    const without = layoutOverlaps(two, base);

    expect(without.get('a')).toMatchObject({ left: '0px', right: '4px' });
    expect([...without.keys()].sort()).toEqual(['a', 'b']);
  });

  it('packs columns inside the LANE rather than across the field', () => {
    // Two crossing blocks in one lane split that lane, not the grid: the left
    // edge starts at the lane's own inset and the panes are worth half a lane.
    const crossing = [at('a', 540, 120), at('b', 600, 120)];
    const out = layoutOverlaps(crossing, { ...base, root: { leftPct: 50, rightPct: 0 } });

    for (const id of ['a', 'b']) expect(out.get(id)!.widthFraction).toBeCloseTo(0.25, 9);
    expect(out.get('a')!.left).toBe('calc(50% + 0px)');
  });

  it('gives each lane the whole lane when the same time falls in two of them', () => {
    // The reason the caller runs one pass PER LANE. Two blocks at 09:00 in
    // different lanes share a time but never a column, so they are not a
    // conflict: neither tiles, and each keeps its lane's full width. Run as one
    // pass they would have become a double-booking and split a band.
    const asOneCluster = layoutOverlaps([at('a', 540, 60), at('b', 540, 60)], base);
    expect(asOneCluster.get('a')!.widthFraction).toBeCloseTo(0.5, 9);

    const laneA = layoutOverlaps([at('a', 540, 60)], { ...base, root: { leftPct: 0, rightPct: 50 } });
    const laneB = layoutOverlaps([at('b', 540, 60)], { ...base, root: { leftPct: 50, rightPct: 0 } });
    expect(laneA.get('a')!.widthFraction).toBeCloseTo(0.5, 9);
    expect(laneB.get('b')!.widthFraction).toBeCloseTo(0.5, 9);
    expect(laneA.get('a')!.paneLeft).toBe('12px');
    expect(laneB.get('b')!.paneLeft).toBe('12px');
  });
});
