import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlannerStore } from '@/lib/planner-store';
import { setGateOn } from '@/lib/gate-toggle';
import type { Routine, Program } from '@dsul/types';

/**
 * setGateOn — the one guarded, click-time-resolved write behind both the group-
 * header switch and the Display menu's "Paused scopes" list.
 *
 * It resolves "today" from `new Date()` internally, so a test cannot pin the
 * date. Every fixture here is therefore date-INDEPENDENT: routines pause with no
 * end (paused on every date at or after an epoch-past `pausedAt`), and programs
 * are RANGELESS, so `isProgramActiveOn` is `auto`→on / `paused`→off for any
 * today. That isolates the logic under test — toggle direction, the no-op guard,
 * and the program tri-state routing — from the calendar.
 */

const TZ = 'America/New_York';
const PAST = '2000-01-01T12:00:00Z';

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

let setRoutinePaused: ReturnType<typeof vi.fn>;
let setProgramState: ReturnType<typeof vi.fn>;

const seed = (routines: Routine[], programs: Program[]) => {
  setRoutinePaused = vi.fn();
  setProgramState = vi.fn();
  usePlannerStore.setState({
    routines,
    programs,
    userTimezone: TZ,
    // Cast the spies onto the action signatures — a bare Mock isn't nominally the
    // store's function type, but it is call-compatible and setGateOn only invokes it.
    setRoutinePaused: setRoutinePaused as unknown as (
      id: string,
      paused: boolean,
      until?: string | null,
    ) => void,
    setProgramState: setProgramState as unknown as (
      id: string,
      state: 'auto' | 'active' | 'paused',
    ) => void,
  });
};

describe('setGateOn — routines', () => {
  beforeEach(() => seed([], []));

  it('turns an on routine off by pausing it', () => {
    seed([routine('r')], []); // no pause → on today
    setGateOn('routine', 'r', false);
    // paused := !desiredOn === true
    expect(setRoutinePaused).toHaveBeenCalledWith('r', true);
  });

  it('turns a paused routine on by clearing the pause', () => {
    seed([routine('r', { pausedAt: PAST })], []); // paused with no end → off today
    setGateOn('routine', 'r', true);
    expect(setRoutinePaused).toHaveBeenCalledWith('r', false);
  });

  it('no-ops when the routine is already in the desired state', () => {
    seed([routine('r')], []); // already on
    setGateOn('routine', 'r', true); // ask for on
    expect(setRoutinePaused).not.toHaveBeenCalled();
  });

  it('no-ops on a stale id rather than throwing', () => {
    seed([routine('r')], []);
    expect(() => setGateOn('routine', 'gone', true)).not.toThrow();
    expect(setRoutinePaused).not.toHaveBeenCalled();
  });

  it("keys the no-op guard off the routine's LOCAL switch, not the resolved effect", () => {
    // An unpaused routine (localOn=true) held off by a rangeless paused program
    // (effectiveOn=false). The guard must read the routine's OWN switch, or
    // "turn this off" silently no-ops while the routine is still scoped —
    // exactly the local/effective merge the split exists to prevent. Rangeless,
    // so date-independent.
    seed([routine('r')], [program('p', { state: 'paused', routineIds: ['r'] })]);
    setGateOn('routine', 'r', false);
    expect(setRoutinePaused).toHaveBeenCalledWith('r', true);
  });
});

describe('setGateOn — programs route through the tri-state', () => {
  beforeEach(() => seed([], []));

  it('turns a live auto program off with a manual paused', () => {
    seed([], [program('p')]); // rangeless auto → on
    setGateOn('program', 'p', false);
    expect(setProgramState).toHaveBeenCalledWith('p', 'paused');
  });

  it('turns a paused program back to auto when auto already yields on', () => {
    // The auto-preserving rule: a rangeless program is on under auto, so turning
    // it on returns it to auto rather than stamping a manual active.
    seed([], [program('p', { state: 'paused' })]);
    setGateOn('program', 'p', true);
    expect(setProgramState).toHaveBeenCalledWith('p', 'auto');
  });

  it('no-ops when the program is already in the desired state', () => {
    seed([], [program('p')]); // auto → on
    setGateOn('program', 'p', true); // ask for on
    expect(setProgramState).not.toHaveBeenCalled();
  });

  it('no-ops on a stale id rather than throwing', () => {
    seed([], [program('p')]);
    expect(() => setGateOn('program', 'gone', false)).not.toThrow();
    expect(setProgramState).not.toHaveBeenCalled();
  });
});
