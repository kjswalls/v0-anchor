import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAnchorContext } from '@/lib/ai-context';
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt';
import type { Item } from '@/lib/planner-types';

/**
 * The Beacon chat context is a pinned presentation: the registry's per-type
 * renderContextSection functions must stay byte-identical to the
 * pre-unification builder. These tests lock the exact output.
 */

describe('buildAnchorContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A Wednesday, well away from midnight in any plausible test TZ.
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // July 15 2026, local
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const items: Item[] = [
    {
      type: 'task',
      id: 't1',
      title: 'Write report',
      status: 'pending',
      isScheduled: true,
      order: 0,
      startDate: '2026-07-15',
      project: 'Work',
      timeBucket: 'morning',
      priority: 'high',
    },
    {
      type: 'task',
      id: 't2',
      title: 'Old thing',
      status: 'pending',
      isScheduled: true,
      order: 1,
      startDate: '2026-07-10',
      priority: 'low',
    },
    {
      type: 'task',
      id: 't3',
      title: 'Done thing',
      status: 'completed',
      isScheduled: true,
      order: 2,
      startDate: '2026-07-15',
    },
    {
      type: 'habit',
      id: 'h1',
      title: 'Stretch',
      group: 'Wellness',
      streak: 4,
      status: 'pending',
      completedDates: ['2026-07-15'],
      skippedDates: [],
      dailyCounts: {},
      repeatFrequency: 'daily',
    },
    {
      type: 'habit',
      id: 'h2',
      title: 'Read',
      group: 'Growth',
      streak: 0,
      status: 'pending',
      completedDates: [],
      skippedDates: [],
      dailyCounts: {},
      repeatFrequency: 'daily',
    },
  ];

  it('renders the exact pre-unification presentation', () => {
    const out = buildAnchorContext({ items, projects: [{ id: 'p1', name: 'Work', emoji: '' }], habitGroups: [] });
    expect(out).toBe(
      [
        '## Anchor Context',
        'Date: Wednesday, July 15 2026',
        '',
        "### Today's Tasks",
        '**Pending**',
        '- Write report (Project: Work, Morning, High priority)',
        '**Completed today**',
        '- Done thing ✓',
        '**Overdue**',
        '- Old thing (was Jul 10, Low)',
        '',
        '### Habits',
        '- Stretch — 🔥 4 day streak — ✓ done today',
        '- Read — no streak — pending today',
        '',
        '### Projects',
        'Work',
      ].join('\n')
    );
  });

  it('renders the empty-state lines', () => {
    const out = buildAnchorContext({ items: [], projects: [], habitGroups: [] });
    expect(out).toContain('No tasks scheduled for today.');
    expect(out).toContain('No habits tracked.');
    expect(out).toContain('No projects.');
  });
});

describe('BEACON_SYSTEM_PROMPT', () => {
  it('is byte-identical to the pre-registry string', () => {
    expect(BEACON_SYSTEM_PROMPT).toBe(
      'You are Beacon, a warm and encouraging AI assistant built into Anchor — a daily planner for neurodivergent people. ' +
        "You have full visibility into the user's current tasks, habits, and projects. " +
        'Help them plan their day, break down overwhelming tasks, celebrate progress, and stay focused. ' +
        "Be concise, warm, and never judgmental. When you reference their tasks or habits, be specific — you can see exactly what they're working on."
    );
  });
});
