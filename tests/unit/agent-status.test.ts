import { describe, it, expect } from 'vitest';
import { agentStatusView, formatElapsed, hasAgentState, isAgentState } from '@/lib/agent-status';

/**
 * What a delegated item says on a row.
 *
 * The elapsed reading is the reason this exists: "Working" is not information,
 * "Working 3h" is — an agent four minutes into a task is fine, and the same
 * agent three hours in has died somewhere that nobody would otherwise notice
 * until they opened the item.
 *
 * Which makes the WRONG number the thing to guard against hardest. That is why
 * the stamp is a dedicated `aiStatusAt` (migration 038) rather than the item's
 * trigger-maintained `updated_at`: the latter moves on any edit, so renaming a
 * task mid-run would silently reset the clock. No number beats a wrong one, and
 * these tests pin the cases where the honest answer is "say nothing".
 */

const NOW = Date.parse('2026-08-26T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const view = (over: Record<string, unknown> = {}) =>
  agentStatusView({ assignee: 'beacon', aiStatus: 'working', aiStatusAt: ago(4 * MINUTE), ...over }, NOW);

describe('formatElapsed', () => {
  it('reads coarsely — minutes, then hours, then days', () => {
    expect(formatElapsed(ago(30 * 1000), NOW)).toBe('just now');
    expect(formatElapsed(ago(4 * MINUTE), NOW)).toBe('4m');
    expect(formatElapsed(ago(59 * MINUTE), NOW)).toBe('59m');
    expect(formatElapsed(ago(3 * HOUR), NOW)).toBe('3h');
    expect(formatElapsed(ago(23 * HOUR), NOW)).toBe('23h');
    expect(formatElapsed(ago(2 * DAY), NOW)).toBe('2d');
  });

  it('never shows something impossible for a stamp from the future', () => {
    // Clock skew between the server that stamps and the browser that reads is
    // ordinary; a row reading "-3m" is not.
    expect(formatElapsed(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toBe('just now');
  });

  it('says nothing for an unparseable stamp', () => {
    expect(formatElapsed('not a date', NOW)).toBeUndefined();
    expect(formatElapsed('', NOW)).toBeUndefined();
  });
});

describe('what the row says', () => {
  it('reports the state and how long it has been in it', () => {
    expect(view()).toMatchObject({ label: 'Working', elapsed: '4m', active: true });
  });

  it('treats blocked as the one state that wants something from the user', () => {
    const blocked = view({ aiStatus: 'blocked' })!;
    expect(blocked.needsUser).toBe(true);
    expect(blocked.label).toBe('Needs you');
    // Not "Blocked": the copy contract is that nothing names a failure, and the
    // state is a request, not a reprimand for not having noticed.
    expect(blocked.label).not.toMatch(/blocked/i);
  });

  it('leaves every other state muted', () => {
    for (const aiStatus of ['queued', 'working', 'failed']) {
      expect(view({ aiStatus })!.needsUser).toBe(false);
    }
  });

  it('counts only queued and working as live', () => {
    // The spinner is honest only while something is actually running.
    expect(view({ aiStatus: 'queued' })!.active).toBe(true);
    expect(view({ aiStatus: 'working' })!.active).toBe(true);
    expect(view({ aiStatus: 'blocked' })!.active).toBe(false);
    expect(view({ aiStatus: 'failed' })!.active).toBe(false);
  });

  it('says nothing at all for finished work', () => {
    // A row that keeps announcing "Done" for work already seen is the badge
    // equivalent of a notification that will not clear.
    expect(view({ aiStatus: 'done' })).toBeNull();
  });

  it('says nothing for an item nobody is working', () => {
    expect(view({ assignee: undefined })).toBeNull();
  });

  it('says nothing for a status outside the frozen vocabulary', () => {
    // The read schema is a loose string on purpose, so a future vocabulary
    // addition cannot brick an old plugin — which means junk can arrive here.
    expect(view({ aiStatus: 'wat' })).toBeNull();
    expect(view({ aiStatus: undefined })).toBeNull();
    // Object prototype keys are the junk that is easy to miss.
    expect(view({ aiStatus: 'toString' })).toBeNull();
    expect(view({ aiStatus: 'constructor' })).toBeNull();
  });

  it('still names the state when the stamp is missing', () => {
    // Rows written before migration 038 carry no timestamp. Losing the label
    // too would hide the delegation entirely.
    const noStamp = view({ aiStatusAt: undefined })!;
    expect(noStamp.label).toBe('Working');
    expect(noStamp.elapsed).toBeUndefined();
    expect(noStamp.detail).toBe('Working');
  });

  it('phrases the detail as a sentence a reader can hear', () => {
    expect(view({ aiStatus: 'working', aiStatusAt: ago(3 * HOUR) })!.detail).toBe(
      'Working — for 3h'
    );
    expect(view({ aiStatus: 'blocked', aiStatusAt: ago(2 * HOUR) })!.detail).toBe(
      'Waiting on your answer — asked 2h ago'
    );
    expect(view({ aiStatus: 'blocked', aiStatusAt: ago(10 * 1000) })!.detail).toBe(
      'Waiting on your answer — asked just now'
    );
  });

  it('keeps the copy contract — nothing names a failure of the user', () => {
    const forbidden = /overdue|late|behind|you failed|should have|neglect|ignored/i;
    for (const aiStatus of ['queued', 'working', 'blocked', 'failed']) {
      const v = view({ aiStatus })!;
      expect(v.label).not.toMatch(forbidden);
      expect(v.detail).not.toMatch(forbidden);
    }
  });

  it("names the agent's own failure without blaming anyone", () => {
    expect(view({ aiStatus: 'failed' })!.label).toBe("Couldn't finish");
  });
});

describe('isAgentState', () => {
  it('accepts the frozen write vocabulary and nothing else', () => {
    for (const s of ['queued', 'working', 'blocked', 'done', 'failed']) {
      expect(isAgentState(s)).toBe(true);
    }
    // Inherited keys included: `aiStatus` is a loose string by design, so
    // 'toString' can genuinely arrive — and `'toString' in LABELS` is true,
    // which would have put a function through the label lookup.
    for (const s of [undefined, '', 'pending', 'completed', 'toString', 'constructor', 'valueOf']) {
      expect(isAgentState(s as string | undefined)).toBe(false);
    }
  });
});

describe('hasAgentState — the clockless half', () => {
  /**
   * A component cannot read `Date.now()` during render (impure), and nothing
   * about WHETHER to show the pill depends on the time — only the elapsed
   * reading does. So the decision is split out, and the risk is that the two
   * halves drift: a predicate saying "show it" where the view returns null
   * would mount a ticking component that renders nothing.
   */
  const cases = [
    { assignee: 'beacon', aiStatus: 'working' },
    { assignee: 'beacon', aiStatus: 'blocked' },
    { assignee: 'beacon', aiStatus: 'queued' },
    { assignee: 'beacon', aiStatus: 'failed' },
    { assignee: 'beacon', aiStatus: 'done' },
    { assignee: 'beacon', aiStatus: 'toString' },
    { assignee: 'beacon', aiStatus: undefined },
    { assignee: undefined, aiStatus: 'working' },
    {},
  ];

  it('agrees with the view on every input', () => {
    for (const item of cases) {
      expect(hasAgentState(item), JSON.stringify(item)).toBe(
        agentStatusView({ ...item, aiStatusAt: ago(MINUTE) }, NOW) !== null
      );
    }
  });

  it('does not depend on the clock', () => {
    const item = { assignee: 'beacon', aiStatus: 'working' };
    expect(hasAgentState(item)).toBe(true);
    // No stamp at all, and none needed — the decision is about state.
    expect(hasAgentState({ ...item, aiStatusAt: undefined } as never)).toBe(true);
  });
});
