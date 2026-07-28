import { describe, it, expect } from 'vitest';
import {
  TaskCreateSchema,
  HabitCreateSchema,
  TaskUpdateSchema,
  HabitUpdateSchema,
  AnchorContextResponseSchema,
} from '@anchor-app/types';

/**
 * The agent write-body schemas are the 400-instead-of-500 boundary for
 * /api/agent/tasks|habits. These tests pin the contract: what validates,
 * what rejects, what null means per field, and the legacy normalizations.
 */

describe('TaskCreateSchema', () => {
  it('accepts a minimal body (title only)', () => {
    const r = TaskCreateSchema.safeParse({ title: 'Ship it' });
    expect(r.success).toBe(true);
  });

  it('rejects a missing title', () => {
    expect(TaskCreateSchema.safeParse({}).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects a junk status that would otherwise 500 on the DB CHECK', () => {
    expect(TaskCreateSchema.safeParse({ title: 'x', status: 'done' }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(TaskCreateSchema.safeParse({ title: 'x', id: 'abc' }).success).toBe(false);
  });

  it('requires repeatDays when frequency is custom', () => {
    expect(
      TaskCreateSchema.safeParse({ title: 'x', repeatFrequency: 'custom' }).success
    ).toBe(false);
    expect(
      TaskCreateSchema.safeParse({ title: 'x', repeatFrequency: 'custom', repeatDays: [1] })
        .success
    ).toBe(true);
  });

  it('normalizes legacy weekly to custom', () => {
    const r = TaskCreateSchema.safeParse({
      title: 'x',
      repeatFrequency: 'weekly',
      repeatDays: [1],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.repeatFrequency).toBe('custom');
  });

  it('strips unknown keys (allowlist behavior)', () => {
    const r = TaskCreateSchema.safeParse({ title: 'x', evil: 'field' });
    expect(r.success).toBe(true);
    if (r.success) expect('evil' in r.data).toBe(false);
  });

  it('id: null falls through to server-side generation (legacy behavior)', () => {
    const r = TaskCreateSchema.safeParse({ title: 'x', id: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBeUndefined();
  });

  it('rejects fractional values on integer fields', () => {
    expect(TaskCreateSchema.safeParse({ title: 'x', duration: 1.5 }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ title: 'x', order: 0.1 }).success).toBe(false);
  });
});

describe('HabitCreateSchema', () => {
  it('accepts a minimal body (title only) — server defaults fill the rest', () => {
    expect(HabitCreateSchema.safeParse({ title: 'Stretch' }).success).toBe(true);
  });

  it('rejects a task-vocabulary status', () => {
    expect(HabitCreateSchema.safeParse({ title: 'x', status: 'completed' }).success).toBe(
      false
    );
  });

  it('normalizes legacy weekly to custom', () => {
    const r = HabitCreateSchema.safeParse({
      title: 'x',
      repeatFrequency: 'weekly',
      repeatDays: [2],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.repeatFrequency).toBe('custom');
  });
});

describe('TaskUpdateSchema', () => {
  it('accepts null on clearable fields (means "clear")', () => {
    const r = TaskUpdateSchema.safeParse({ priority: null, project: null, startDate: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBeNull();
      expect(r.data.project).toBeNull();
    }
  });

  it('rejects null on NOT-NULL fields (title, status)', () => {
    expect(TaskUpdateSchema.safeParse({ title: null }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ status: null }).success).toBe(false);
  });

  it('rejects junk enum values that would otherwise 500', () => {
    expect(TaskUpdateSchema.safeParse({ status: 'done' }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ timeBucket: 'midnight' }).success).toBe(false);
  });

  it('normalizes legacy weekly to custom (repeatDays required alongside)', () => {
    const r = TaskUpdateSchema.safeParse({ repeatFrequency: 'weekly', repeatDays: [1] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.repeatFrequency).toBe('custom');
  });

  it('an empty body validates (route treats it as a no-op)', () => {
    expect(TaskUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects custom (or normalized weekly) frequency without repeatDays — a stored custom-without-days item would brick the plugin context parse', () => {
    expect(TaskUpdateSchema.safeParse({ repeatFrequency: 'custom' }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ repeatFrequency: 'weekly' }).success).toBe(false);
    expect(
      TaskUpdateSchema.safeParse({ repeatFrequency: 'weekly', repeatDays: [1, 3] }).success
    ).toBe(true);
  });

  it('rejects fractional values on integer fields', () => {
    expect(TaskUpdateSchema.safeParse({ duration: 22.5 }).success).toBe(false);
    expect(TaskUpdateSchema.safeParse({ repeatDays: [1.5] }).success).toBe(false);
  });
});

describe('HabitUpdateSchema', () => {
  it('rejects null on legacy-NOT-NULL habit fields', () => {
    expect(HabitUpdateSchema.safeParse({ group: null }).success).toBe(false);
    expect(HabitUpdateSchema.safeParse({ streak: null }).success).toBe(false);
    expect(HabitUpdateSchema.safeParse({ repeatFrequency: null }).success).toBe(false);
  });

  it('accepts null on clearable habit fields', () => {
    expect(
      HabitUpdateSchema.safeParse({ timeBucket: null, startTime: null, timesPerDay: null })
        .success
    ).toBe(true);
  });

  it('rejects a task-vocabulary status', () => {
    expect(HabitUpdateSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
  });

  it('rejects custom frequency without repeatDays', () => {
    expect(HabitUpdateSchema.safeParse({ repeatFrequency: 'custom' }).success).toBe(false);
    expect(
      HabitUpdateSchema.safeParse({ repeatFrequency: 'custom', repeatDays: [0, 6] }).success
    ).toBe(true);
  });

  it('rejects fractional timesPerDay', () => {
    expect(HabitUpdateSchema.safeParse({ timesPerDay: 2.5 }).success).toBe(false);
  });
});

describe('AnchorContextResponseSchema (items[] additivity)', () => {
  const base = {
    userId: 'u1',
    fetchedAt: new Date(0).toISOString(),
    tasks: [],
    habits: [],
    projects: [],
    habitGroups: [],
  };

  it('parses a v2 response without items[] (old server ↔ new plugin)', () => {
    expect(AnchorContextResponseSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(
      true
    );
  });

  it('parses a v3 response with items[]', () => {
    const r = AnchorContextResponseSchema.safeParse({
      ...base,
      schemaVersion: 3,
      items: [
        {
          type: 'task',
          id: 't1',
          title: 'A',
          status: 'pending',
          isScheduled: false,
          order: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
