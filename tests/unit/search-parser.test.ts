import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '@/lib/search';

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
