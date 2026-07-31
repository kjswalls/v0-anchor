import { describe, expect, it } from 'vitest';
import {
  DRAFT_KEYS,
  habitUpdatesFromDraft,
  taskUpdatesFromDraft,
  type ItemDraft,
} from '@/components/planner/item-dialog';

/**
 * The load-bearing invariant of the non-modal panel
 * (memory/plans/item-surface-growth.md Phase 7): an autosave writes ONLY the
 * fields the user touched in the panel.
 *
 * It matters because the canvas behind the panel stays live. If a commit sent
 * the whole property set — as the modal always did, safely, because it owned
 * the screen — then dragging a block, resizing it, undoing, or an agent write
 * would all be silently reverted by the next keystroke's save.
 */

const draft: ItemDraft = {
  title: '  Write the deck  ',
  notes: '  three slides, no more  ',
  priority: 'high',
  container: 'Work',
  startDate: new Date(2026, 6, 30),
  timeBucket: 'morning',
  startTime: '09:00',
  duration: '45',
  repeatFrequency: 'custom',
  repeatDays: [1, 3],
  repeatMonthDay: 1,
  timesPerDay: '2',
  newContainer: { show: false, name: '', icon: '' },
};

describe('panel writes are scoped to what was touched', () => {
  it('sends one field when one field changed', () => {
    expect(taskUpdatesFromDraft(draft, ['priority'])).toEqual({ priority: 'high' });
    expect(taskUpdatesFromDraft(draft, ['notes'])).toEqual({ notes: 'three slides, no more' });
    expect(habitUpdatesFromDraft(draft, ['container'])).toEqual({ group: 'Work' });
  });

  it('never leaks an untouched field into the payload', () => {
    // The regression this exists for: `duration` here would clobber a resize
    // the user just made on the grid with the panel open.
    for (const key of ['title', 'priority', 'notes', 'container'] as const) {
      expect(Object.keys(taskUpdatesFromDraft(draft, [key]))).toHaveLength(1);
    }
    expect(taskUpdatesFromDraft(draft, ['title'])).not.toHaveProperty('duration');
    expect(taskUpdatesFromDraft(draft, ['title'])).not.toHaveProperty('startTime');
    expect(habitUpdatesFromDraft(draft, ['title'])).not.toHaveProperty('timesPerDay');
  });

  it('treats the three repeat fields as one control', () => {
    expect(taskUpdatesFromDraft(draft, ['repeatDays'])).toEqual({
      repeatFrequency: 'custom',
      repeatDays: [1, 3],
      repeatMonthDay: undefined,
    });
  });

  it('writes nothing when nothing was touched', () => {
    expect(taskUpdatesFromDraft(draft, [])).toEqual({});
    expect(habitUpdatesFromDraft(draft, [])).toEqual({});
    // 'timeBucket' has no direct column on either payload — it is applied by
    // the scheduling second pass, not by these builders.
    expect(taskUpdatesFromDraft(draft, ['timeBucket'])).toEqual({});
  });

  it('still produces the whole-item save the modal has always sent', () => {
    const full = taskUpdatesFromDraft(draft, DRAFT_KEYS);
    expect(full).toEqual({
      title: 'Write the deck',
      notes: 'three slides, no more',
      priority: 'high',
      project: 'Work',
      startDate: '2026-07-30',
      duration: 45,
      startTime: '09:00',
      repeatFrequency: 'custom',
      repeatDays: [1, 3],
      repeatMonthDay: undefined,
    });
  });

  it("maps the draft's UI sentinels to cleared values", () => {
    const blank: ItemDraft = {
      ...draft,
      notes: '   ',
      priority: 'none',
      container: 'none',
      startDate: undefined,
      startTime: '',
      repeatFrequency: 'none',
    };
    expect(taskUpdatesFromDraft(blank, DRAFT_KEYS)).toMatchObject({
      notes: undefined,
      priority: undefined,
      project: undefined,
      startDate: undefined,
      startTime: undefined,
      repeatFrequency: undefined,
    });
  });
});
