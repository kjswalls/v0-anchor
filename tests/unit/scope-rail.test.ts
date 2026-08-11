import { describe, it, expect } from 'vitest';
import {
  buildScopeRows,
  programStateForSwitch,
  scopeCountLine,
  type ScopeRow,
} from '@/lib/scope-rail';
import type { Item, Routine, Program } from '@anchor-app/types';

const TZ = 'America/New_York';
const TODAY = '2026-08-10';
/** Noon UTC is still the same day in New York — no boundary meaning in fixtures. */
const JUL01 = '2026-07-01T12:00:00Z';

const task = (id: string, over: Partial<Item> = {}): Item =>
  ({
    type: 'task',
    id,
    title: `Task ${id}`,
    status: 'pending',
    isScheduled: false,
    order: 0,
    ...over,
  }) as Item;

const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id,
  name: `Routine ${id}`,
  itemIds: [],
  ...over,
});

const program = (id: string, over: Partial<Program> = {}): Program => ({
  id,
  name: `Program ${id}`,
  state: 'auto',
  itemIds: [],
  routineIds: [],
  ...over,
});

const build = (items: Item[], routines: Routine[], programs: Program[]) =>
  buildScopeRows(items, routines, programs, TODAY, TZ);

const row = (rows: ScopeRow[], id: string) => rows.find((r) => r.id === id)!;

describe('programStateForSwitch — prefer auto whenever auto already answers', () => {
  // The rule that keeps a binary switch from destroying a tri-state. Both
  // directions matter: turning a live summer off with `paused` and back on with
  // `active` loses its Aug 31 end, and turning a future term on with `active`
  // and off again with `paused` loses its Sep 1 start.
  const summer = program('s', { startsOn: '2026-06-01', endsOn: '2026-08-31' });
  const term = program('t', { startsOn: '2026-09-01', endsOn: '2026-12-20' });

  it('writes a manual override only when it is genuinely needed', () => {
    // Summer is live today; asking for OFF disagrees with the calendar.
    expect(programStateForSwitch(summer, false, TODAY)).toBe('paused');
    // Term is off today; asking for ON disagrees with the calendar.
    expect(programStateForSwitch(term, true, TODAY)).toBe('active');
  });

  it('returns to auto when auto is already producing the requested state', () => {
    expect(programStateForSwitch({ ...summer, state: 'paused' }, true, TODAY)).toBe('auto');
    expect(programStateForSwitch({ ...term, state: 'active' }, false, TODAY)).toBe('auto');
  });

  it('round-trips a dated program without losing its dates', () => {
    const off = programStateForSwitch(summer, false, TODAY);
    const back = programStateForSwitch({ ...summer, state: off }, true, TODAY);
    expect(back).toBe('auto');
    const on = programStateForSwitch(term, true, TODAY);
    const again = programStateForSwitch({ ...term, state: on }, false, TODAY);
    expect(again).toBe('auto');
  });

  it('a rangeless program still switches off manually', () => {
    const p = program('p');
    expect(programStateForSwitch(p, false, TODAY)).toBe('paused');
    expect(programStateForSwitch({ ...p, state: 'paused' }, true, TODAY)).toBe('auto');
  });
});

describe('buildScopeRows — the local/effective split', () => {
  it('a program has nothing above it, so its switch IS its effect', () => {
    const rows = build([], [], [program('p', { state: 'paused' })]);
    expect(row(rows, 'p').localOn).toBe(false);
    expect(row(rows, 'p').effectiveOn).toBe(false);
  });

  it('a routine held off by its program keeps its own switch ON', () => {
    // The correctness constraint. Render this routine as "off" and resuming the
    // program hands back a routine the user believes they turned off.
    const r = routine('r', { name: 'Mornings' });
    const p = program('p', { name: 'Term', state: 'paused', routineIds: ['r'] });
    const rows = build([], [r], [p]);
    expect(row(rows, 'r').localOn).toBe(true);
    expect(row(rows, 'r').effectiveOn).toBe(false);
    expect(row(rows, 'r').state).toBe('On · held with Term');
  });

  it('one live holder is enough — the rule is disjunctive', () => {
    const r = routine('r');
    const rows = build(
      [],
      [r],
      [
        program('off', { state: 'paused', routineIds: ['r'] }),
        program('on', { state: 'active', routineIds: ['r'] }),
      ]
    );
    expect(row(rows, 'r').effectiveOn).toBe(true);
    expect(row(rows, 'r').state).toBe('On');
  });

  it('names the soonest-returning blocker and counts the rest', () => {
    const r = routine('r');
    const rows = build(
      [],
      [r],
      [
        program('later', { name: 'Later', startsOn: '2026-10-01', routineIds: ['r'] }),
        program('soon', { name: 'Soon', startsOn: '2026-09-01', routineIds: ['r'] }),
      ]
    );
    // Disjunctive: the routine comes back when the FIRST holder does.
    expect(row(rows, 'r').state).toBe('On · held with Soon +1');
  });

  it('a self-paused routine reads off, with its own resume date', () => {
    const r = routine('r', { pausedAt: JUL01, pausedUntil: '2026-09-01' });
    const rows = build([], [r], []);
    expect(row(rows, 'r').localOn).toBe(false);
    expect(row(rows, 'r').state).toBe('Off · back Sep 1');
  });
});

describe('buildScopeRows — the state line', () => {
  const line = (p: Partial<Program>) => row(build([], [], [program('p', p)]), 'p').state;

  it('distinguishes a manual override from the calendar', () => {
    expect(line({ state: 'active' })).toBe('On · you turned it on');
    expect(line({ state: 'paused' })).toBe('Off · you turned it off');
  });

  it('reports an auto range from whichever end is in play', () => {
    expect(line({ startsOn: '2026-06-01', endsOn: '2026-08-31' })).toBe('On · until Aug 31');
    expect(line({ startsOn: '2026-09-01' })).toBe('Off · back Sep 1');
    expect(line({ endsOn: '2026-07-31' })).toBe('Off · ended Jul 31');
    expect(line({})).toBe('On');
  });

  it('promises no return date for an inverted range', () => {
    // Live on NO date, so its start is not a comeback — saying "back Sep 1"
    // would have the user waiting for a day that does nothing.
    expect(line({ startsOn: '2026-09-01', endsOn: '2026-08-01' })).toBe('Off');
  });
});

describe('buildScopeRows — counts are resolver deltas, not member counts', () => {
  it('counts what would actually leave', () => {
    const items = [task('a'), task('b')];
    const p = program('p', { state: 'active', itemIds: ['a', 'b'] });
    expect(row(build(items, [], [p]), 'p').flips.sort()).toEqual(['a', 'b']);
  });

  it('an item held by a second live program does not move', () => {
    // The whole reason a raw member count is wrong here: under an OR rule a
    // second container is another reason to appear, never a way to vanish.
    const items = [task('a')];
    const rows = build(items, [], [
      program('p1', { state: 'active', itemIds: ['a'] }),
      program('p2', { state: 'active', itemIds: ['a'] }),
    ]);
    expect(row(rows, 'p1').flips).toEqual([]);
    expect(row(rows, 'p1').holds).toBe(1);
    expect(row(rows, 'p1').heldElsewhere).toBe(1);
  });

  it('counts work that would come back when the switch is off', () => {
    const items = [task('a')];
    const rows = build(items, [], [program('p', { state: 'paused', itemIds: ['a'] })]);
    expect(row(rows, 'p').flips).toEqual(['a']);
    expect(row(rows, 'p').effectiveOn).toBe(false);
  });

  it('ignores members that are no longer open loops', () => {
    // A completed one-off keeps rendering whatever this switch does (the
    // history rule), so counting it would promise a disappearance that cannot
    // happen.
    const items = [task('a', { status: 'completed' }), task('b')];
    const p = program('p', { state: 'active', itemIds: ['a', 'b'] });
    const r = row(build(items, [], [p]), 'p');
    expect(r.holds).toBe(1);
    expect(r.flips).toEqual(['b']);
  });

  it('ignores member ids that name a trashed item', () => {
    // Join rows survive an item's soft delete by design; the locked rule is
    // that consumers filter against the live index rather than prune the array.
    const items = [task('a')];
    const p = program('p', { state: 'active', itemIds: ['a', 'gone'] });
    expect(row(build(items, [], [p]), 'p').holds).toBe(1);
  });

  it('a program counts the items its routines carry, not just its own', () => {
    const items = [task('a'), task('b')];
    const r = routine('r', { itemIds: ['b'] });
    const p = program('p', { state: 'active', itemIds: ['a'], routineIds: ['r'] });
    const rows = build(items, [r], [p]);
    expect(row(rows, 'p').holds).toBe(2);
    expect(row(rows, 'p').flips.sort()).toEqual(['a', 'b']);
  });

  it('a switch that changes nothing reports nothing', () => {
    // A routine already held off by its program: flipping its own switch either
    // way leaves every member exactly where it is.
    const items = [task('a')];
    const r = routine('r', { itemIds: ['a'] });
    const p = program('p', { state: 'paused', routineIds: ['r'] });
    expect(row(build(items, [r], [p]), 'r').flips).toEqual([]);
  });
});

describe('buildScopeRows — ordering', () => {
  it('puts off containers last without dropping them, programs before routines', () => {
    const rows = build(
      [],
      [routine('r-on'), routine('r-off', { pausedAt: JUL01 })],
      [program('p-on', { state: 'active' }), program('p-off', { state: 'paused' })]
    );
    expect(rows.map((r) => r.id)).toEqual(['p-on', 'r-on', 'p-off', 'r-off']);
  });
});

describe('scopeCountLine', () => {
  it('states the disjunction as arithmetic', () => {
    const items = [task('a'), task('b')];
    const rows = build(items, [], [
      program('p1', { state: 'active', itemIds: ['a', 'b'] }),
      program('p2', { state: 'active', itemIds: ['b'] }),
    ]);
    expect(scopeCountLine(row(rows, 'p1'))).toBe('holds 2 · 1 would leave · 1 held elsewhere');
  });

  it('reads the other way round when the switch is off', () => {
    const rows = build([task('a')], [], [program('p', { state: 'paused', itemIds: ['a'] })]);
    expect(scopeCountLine(row(rows, 'p'))).toBe('holds 1 · 1 would come back');
  });

  it('says only what it holds when nothing would move', () => {
    const rows = build([task('a')], [routine('r', { itemIds: ['a'] })], []);
    // A standalone live routine with one member: flipping it hides that member.
    expect(scopeCountLine(row(rows, 'r'))).toBe('holds 1 · 1 would leave');
  });
});
