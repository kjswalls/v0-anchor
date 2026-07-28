import { describe, it, expect } from 'vitest';
import { parseSearchQuery, searchItems } from '@/lib/search';
import type { Task } from '@/lib/planner-types';

describe('type:<name> grammar (Phase 6)', () => {
  it('type:goal sets the type filter to the slug', () => {
    expect(parseSearchQuery('type:goal run')).toEqual({
      text: 'run',
      type: 'goal',
      priority: null,
      project: null,
    });
  });

  it('type:task / type:habit map onto the built-in filters', () => {
    expect(parseSearchQuery('type:task').type).toBe('task');
    expect(parseSearchQuery('type:HABIT').type).toBe('habit');
  });

  it('searchItems matches custom rows by slug and excludes habits', () => {
    const task = { id: 't1', title: 'Run errands', status: 'pending', isScheduled: false, order: 0 } as Task;
    const goal = {
      id: 'g1', title: 'Run a 10k', status: 'pending', isScheduled: false, order: 0,
      type: 'custom', customType: 'goal',
    } as unknown as Task;
    const habit = {
      id: 'h1', title: 'Run daily', group: 'Fitness', streak: 0, status: 'pending',
      completedDates: [], skippedDates: [], dailyCounts: {}, repeatFrequency: 'daily',
    };

    const bySlug = searchItems('type:goal', [task, goal], [habit as never]);
    expect(bySlug.tasks.map((t) => t.id)).toEqual(['g1']);
    expect(bySlug.habits).toEqual([]);

    const byTask = searchItems('type:task run', [task, goal], [habit as never]);
    expect(byTask.tasks.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('search keyword parser', () => {
  it('empty string returns no filters', () => {
    expect(parseSearchQuery('')).toEqual({ text: '', type: null, priority: null, project: null });
  });

  it('plain text query sets text field only', () => {
    expect(parseSearchQuery('meeting notes')).toEqual({
      text: 'meeting notes',
      type: null,
      priority: null,
      project: null,
    });
  });

  it('"task:" prefix filters to tasks only (#93)', () => {
    expect(parseSearchQuery('task:standup')).toEqual({
      text: 'standup',
      type: 'task',
      priority: null,
      project: null,
    });
  });

  it('"habit:" prefix filters to habits only (#93)', () => {
    expect(parseSearchQuery('habit:water')).toEqual({
      text: 'water',
      type: 'habit',
      priority: null,
      project: null,
    });
  });

  it('"priority:high" keyword sets priority filter', () => {
    expect(parseSearchQuery('priority:high report')).toEqual({
      text: 'report',
      type: null,
      priority: 'high',
      project: null,
    });
  });

  it('"project:" keyword sets project filter', () => {
    expect(parseSearchQuery('project:Website copy')).toEqual({
      text: 'copy',
      type: null,
      priority: null,
      project: 'Website',
    });
  });

  it('unknown keywords are treated as plain text', () => {
    expect(parseSearchQuery('foo:bar baz')).toEqual({
      text: 'foo:bar baz',
      type: null,
      priority: null,
      project: null,
    });
  });

  it('invalid priority values fall back to plain text', () => {
    expect(parseSearchQuery('priority:urgent fix')).toEqual({
      text: 'priority:urgent fix',
      type: null,
      priority: null,
      project: null,
    });
  });

  it('combines type and priority keywords', () => {
    expect(parseSearchQuery('task:report priority:high')).toEqual({
      text: 'report',
      type: 'task',
      priority: 'high',
      project: null,
    });
  });
});
