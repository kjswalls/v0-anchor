import { describe, expect, it } from 'vitest';
import { updatesToRow } from '@/lib/db';
import { selectOverdue } from '@/lib/overdue';
import { buildDsulContext } from '@/lib/ai-context';
import type { Item, TaskItem } from '@/lib/planner-types';

const NONE: ReadonlySet<string> = new Set();

/**
 * Pins the item-surface growth data behavior (memory/plans/item-surface-growth.md):
 * the four woken columns' update mappings, subtask invisibility in the overdue
 * selector, and the focused-item context section. The 235 pre-growth tests
 * prove old paths with the fields ABSENT; these prove the new paths with the
 * fields SET.
 */

const task = (over: Partial<TaskItem> & { id: string; title: string }): TaskItem => ({
  type: 'task',
  status: 'pending',
  isScheduled: false,
  order: 0,
  ...over,
});

describe('growth-field update mappings', () => {
  it('maps the four fields on task-like updates, presence-keyed with null clears', () => {
    expect(
      updatesToRow('task', {
        parentItemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        assignee: 'openclaw',
        aiStatus: 'working',
        aiResult: 'Slide 3 of 8 drafted',
      })
    ).toEqual({
      parent_item_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      assignee: 'openclaw',
      ai_status: 'working',
      ai_result: 'Slide 3 of 8 drafted',
      // Stamped WITH the status and never on its own (migration 041) — which is
      // what stops the timestamp drifting from the state it describes. The row
      // says "Working 3h"; a clock written separately could make that a
      // confident wrong number, which is worse than no number.
      ai_status_at: expect.any(String),
    });

    // Unassign: present-but-undefined keys clear to NULL, never get dropped.
    expect(
      updatesToRow('task', { assignee: undefined, aiStatus: undefined, aiResult: undefined })
    ).toEqual({
      assignee: null,
      ai_status: null,
      ai_result: null,
      // Cleared status, fresh stamp: "not delegated, as of now" is the truth,
      // and leaving the old one would date the clearing to the last run.
      ai_status_at: expect.any(String),
    });

    // The companion rides ONLY with a status write. A result-only progress
    // report must not restart the clock — an agent posting an update every few
    // minutes would otherwise keep the row reading "Working just now" forever,
    // which is precisely the stuck-run signal this exists to surface.
    expect(updatesToRow('task', { aiResult: 'still going' })).toEqual({
      ai_result: 'still going',
    });
  });

  it('never maps growth fields through the habit allowlist', () => {
    expect(
      updatesToRow('habit', {
        parentItemId: 'x',
        assignee: 'openclaw',
        aiStatus: 'working',
        aiResult: 'y',
      } as never)
    ).toEqual({});
  });
});

describe('subtasks stay out of the overdue surface', () => {
  it('excludes parented items from selectOverdue, keeping their twins', () => {
    const items: Item[] = [
      task({ id: 't1', title: 'Free task', startDate: '2026-07-01' }),
      task({
        id: 't2',
        title: 'Subtask',
        startDate: '2026-07-01',
        parentItemId: 'parent-1',
      }),
    ];
    const overdue = selectOverdue(items, '2026-07-29', NONE);
    expect(overdue.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('focused-item context section', () => {
  const base = {
    items: [
      task({ id: 'p1', title: 'Draft the deck', assignee: 'openclaw', aiStatus: 'working' }),
      task({ id: 's1', title: 'Pull the metrics', parentItemId: 'p1', status: 'completed' }),
      task({ id: 's2', title: 'Design the cover', parentItemId: 'p1' }),
    ] as Item[],
    projects: [],
  };

  it('is absent from the base output', () => {
    expect(buildDsulContext(base)).not.toContain('### Focused item');
  });

  it('renders the item, its agent state, and subtask checkboxes when focused', () => {
    const out = buildDsulContext({ ...base, focusItemId: 'p1' });
    expect(out).toContain('### Focused item');
    expect(out).toContain('Draft the deck [id: p1]');
    expect(out).toContain('Assigned to: openclaw (working)');
    expect(out).toContain('[x] Pull the metrics [id: s1]');
    expect(out).toContain('[ ] Design the cover [id: s2]');
  });

  it('tolerates a focus id that resolves to nothing', () => {
    const out = buildDsulContext({ ...base, focusItemId: 'gone' });
    expect(out).not.toContain('### Focused item');
  });
});
