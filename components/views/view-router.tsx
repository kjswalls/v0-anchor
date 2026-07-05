'use client';

import { useState } from 'react';
import { Timeline } from '@/components/planner/timeline';
import { WeekView } from '@/components/planner/week-view';
import { DayBuckets } from '@/components/views/day-buckets';
import { WeekBuckets } from '@/components/views/week-buckets';
import { useViewStore } from '@/lib/view-store';
import { usePlannerStore } from '@/lib/planner-store';
import { openEditFor, openAddDialog } from '@/lib/ui-store';
import type { TimeBucket } from '@/lib/planner-types';

/**
 * Routes the canvas to one of the scope × layout views. Rollout state:
 *   day-buckets   → NEW (P5a)
 *   week-buckets  → legacy WeekView until P5b
 *   list/schedule → land in P5c/P5d (toggles disabled in the capsule)
 * Escape hatch while the rewrites bake (removed at the P6 checkpoint):
 * localStorage 'anchor-legacy-views' = '1' renders the old Timeline/WeekView.
 */
export function ViewRouter({ activeId }: { activeId: string | null }) {
  const { scope } = useViewStore();
  const [useLegacyViews] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('anchor-legacy-views') === '1'
  );

  const legacyProps = {
    onTaskClick: (task: Parameters<typeof openEditFor>[0]) => openEditFor(task, 'task'),
    onHabitClick: (habit: Parameters<typeof openEditFor>[0]) => openEditFor(habit, 'habit'),
    onAddClick: (bucket: TimeBucket, type: 'task' | 'habit') =>
      openAddDialog(type, bucket, usePlannerStore.getState().selectedDate),
  };

  if (scope === 'week') {
    if (useLegacyViews) return <WeekView {...legacyProps} />;
    return <WeekBuckets activeId={activeId} />;
  }

  if (useLegacyViews) {
    return <Timeline {...legacyProps} activeId={activeId} />;
  }

  return <DayBuckets activeId={activeId} />;
}
