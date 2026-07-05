'use client';

import { useState } from 'react';
import { Timeline } from '@/components/planner/timeline';
import { WeekView } from '@/components/planner/week-view';
import { DayBuckets } from '@/components/views/day-buckets';
import { useViewStore } from '@/lib/view-store';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor, openAddDialog } from '@/lib/ui-store';
import type { TimeBucket } from '@/lib/planner-types';

/**
 * Routes the canvas to one of the scope × layout views. Rollout state:
 *   day-buckets   → NEW (P5a)
 *   week-buckets  → legacy WeekView until P5b
 *   list/schedule → land in P5c/P5d (toggles disabled in the capsule)
 * Escape hatch while the rewrite bakes: localStorage
 * 'anchor-legacy-timeline' = '1' renders the old Timeline for day-buckets.
 */
export function ViewRouter({ activeId }: { activeId: string | null }) {
  const { scope } = useViewStore();
  const [useLegacyTimeline] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('anchor-legacy-timeline') === '1'
  );

  const legacyProps = {
    onTaskClick: (task: Parameters<typeof openEditFor>[0]) => openEditFor(task, 'task'),
    onHabitClick: (habit: Parameters<typeof openEditFor>[0]) => openEditFor(habit, 'habit'),
    onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') =>
      openAddDialog(type, bucket, usePlannerStore.getState().selectedDate),
  };

  if (scope === 'week') {
    return <WeekView {...legacyProps} />;
  }

  if (useLegacyTimeline) {
    return <Timeline {...legacyProps} activeId={activeId} />;
  }

  return <DayBuckets activeId={activeId} />;
}
