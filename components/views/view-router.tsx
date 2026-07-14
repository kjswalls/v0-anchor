'use client';

import { WeekBuckets } from '@/components/views/week-buckets';
import { WeekList } from '@/components/views/week-list';
import { WeekSchedule } from '@/components/views/week-schedule';
import { DayBuckets } from '@/components/views/day-buckets';
import { DayList } from '@/components/views/day-list';
import { DaySchedule } from '@/components/views/day-schedule';
import { useViewStore } from '@/lib/view-store';
import { useDragStore } from '@/lib/drag-store';

/**
 * Routes the canvas to one of the six scope × layout views. Subscribes to drag
 * state here (not via a prop) so a drag only re-renders the canvas subtree —
 * the views need it for drop hints, the rest of the shell doesn't.
 */
export function ViewRouter() {
  const activeId = useDragStore((s) => s.activeId);
  const { scope, layout } = useViewStore();

  if (scope === 'week') {
    if (layout === 'list') return <WeekList />;
    if (layout === 'schedule') return <WeekSchedule activeId={activeId} />;
    return <WeekBuckets activeId={activeId} />;
  }

  if (layout === 'list') return <DayList />;
  if (layout === 'schedule') return <DaySchedule activeId={activeId} />;
  return <DayBuckets activeId={activeId} />;
}
