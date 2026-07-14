import { describe, it, expect, vi } from 'vitest';
import { resolveDrop, type DropContext } from '@/lib/dnd/handle-drag-end';

function ctx(overrides: Partial<DropContext> = {}): DropContext {
  return {
    itemType: 'task',
    selectedDateStr: '2026-07-04',
    getRefTime: () => undefined,
    inferDropTime: (bucket, position, refTime) => refTime ?? '09:00',
    ...overrides,
  };
}

describe('resolveDrop — droppable ID grammar (lib/dnd/CONTRACT.md)', () => {
  it('ignores drops when the dragged item is unknown', () => {
    expect(resolveDrop('t1', 'morning', ctx({ itemType: null }))).toBeNull();
  });

  it('ignores unrecognized target ids', () => {
    expect(resolveDrop('t1', 'garbage:target', ctx())).toBeNull();
  });

  describe('scheduled:{bucket}:{pos}:{refType}:{refId}', () => {
    it('schedules a task with a time inferred from the reference item', () => {
      const getRefTime = vi.fn().mockReturnValue('10:30');
      const inferDropTime = vi.fn().mockReturnValue('10:45');
      const cmd = resolveDrop(
        't1',
        'scheduled:morning:after:task:t2',
        ctx({ getRefTime, inferDropTime })
      );
      expect(getRefTime).toHaveBeenCalledWith('task', 't2');
      expect(inferDropTime).toHaveBeenCalledWith('morning', 'after', '10:30');
      expect(cmd).toEqual({
        kind: 'schedule-task',
        taskId: 't1',
        bucket: 'morning',
        time: '10:45',
        dateStr: '2026-07-04',
      });
    });

    it('handles the empty position without a reference item', () => {
      const inferDropTime = vi.fn().mockReturnValue('14:00');
      const cmd = resolveDrop('t1', 'scheduled:afternoon:empty', ctx({ inferDropTime }));
      expect(inferDropTime).toHaveBeenCalledWith('afternoon', 'empty');
      expect(cmd).toMatchObject({ kind: 'schedule-task', bucket: 'afternoon', time: '14:00' });
    });

    it('schedules habits with a time but no date', () => {
      const cmd = resolveDrop(
        'h1',
        'scheduled:evening:before:habit:h2',
        ctx({ itemType: 'habit', getRefTime: () => '19:00' })
      );
      expect(cmd).toEqual({ kind: 'schedule-habit', habitId: 'h1', bucket: 'evening', time: '19:00' });
    });
  });

  describe('bare bucket + unscheduled:{bucket}', () => {
    it.each(['anytime', 'morning', 'afternoon', 'evening'] as const)(
      'assigns a task to %s without a time',
      (bucket) => {
        expect(resolveDrop('t1', bucket, ctx())).toEqual({
          kind: 'schedule-task',
          taskId: 't1',
          bucket,
          dateStr: '2026-07-04',
        });
      }
    );

    it('assigns habits to the bucket without scheduling', () => {
      expect(resolveDrop('h1', 'morning', ctx({ itemType: 'habit' }))).toEqual({
        kind: 'assign-habit-bucket',
        habitId: 'h1',
        bucket: 'morning',
      });
    });

    it('treats unscheduled:{bucket} the same as the bare bucket', () => {
      expect(resolveDrop('t1', 'unscheduled:evening', ctx())).toMatchObject({
        kind: 'schedule-task',
        bucket: 'evening',
      });
      expect(resolveDrop('h1', 'unscheduled:evening', ctx({ itemType: 'habit' }))).toMatchObject({
        kind: 'assign-habit-bucket',
        bucket: 'evening',
      });
    });
  });

  describe('sidebar', () => {
    it('unschedules the dropped item', () => {
      expect(resolveDrop('t1', 'sidebar', ctx())).toEqual({ kind: 'unschedule', itemId: 't1' });
    });
  });

  describe('projectblock:{name}', () => {
    it('moves a task into its own project block', () => {
      const cmd = resolveDrop('t1', 'projectblock:Website', ctx({ draggedTaskProject: 'Website' }));
      expect(cmd).toEqual({ kind: 'move-task-to-project-block', taskId: 't1' });
    });

    it('rejects tasks from other projects and habits', () => {
      expect(resolveDrop('t1', 'projectblock:Website', ctx({ draggedTaskProject: 'Other' }))).toBeNull();
      expect(resolveDrop('h1', 'projectblock:Website', ctx({ itemType: 'habit' }))).toBeNull();
    });
  });


  describe('hour:{H} (day-schedule drop-on-hour)', () => {
    it('schedules a task at the top of the hour in the owning bucket', () => {
      expect(resolveDrop('t1', 'hour:9', ctx())).toEqual({
        kind: 'schedule-task',
        taskId: 't1',
        bucket: 'morning',
        time: '09:00',
        dateStr: '2026-07-04',
      });
      expect(resolveDrop('t1', 'hour:14', ctx())).toMatchObject({ bucket: 'afternoon', time: '14:00' });
      expect(resolveDrop('t1', 'hour:21', ctx())).toMatchObject({ bucket: 'evening', time: '21:00' });
    });

    it('schedules habits with the hour time', () => {
      expect(resolveDrop('h1', 'hour:7', ctx({ itemType: 'habit' }))).toEqual({
        kind: 'schedule-habit',
        habitId: 'h1',
        bucket: 'morning',
        time: '07:00',
      });
    });

    it('rejects out-of-range hours', () => {
      expect(resolveDrop('t1', 'hour:24', ctx())).toBeNull();
      expect(resolveDrop('t1', 'hour:x', ctx())).toBeNull();
    });
  });

  describe('week:{date}:{bucket}', () => {
    it('schedules a task onto the cell date, not the selected date', () => {
      expect(resolveDrop('t1', 'week:2026-07-09:morning', ctx())).toEqual({
        kind: 'schedule-task',
        taskId: 't1',
        bucket: 'morning',
        dateStr: '2026-07-09',
      });
    });

    it('schedules habits into the bucket', () => {
      expect(resolveDrop('h1', 'week:2026-07-09:evening', ctx({ itemType: 'habit' }))).toEqual({
        kind: 'schedule-habit',
        habitId: 'h1',
        bucket: 'evening',
      });
    });
  });
});
