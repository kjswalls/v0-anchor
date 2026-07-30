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

  const view = (() => {
    if (scope === 'week') {
      if (layout === 'list') return <WeekList />;
      if (layout === 'schedule') return <WeekSchedule activeId={activeId} />;
      return <WeekBuckets activeId={activeId} />;
    }
    if (layout === 'list') return <DayList />;
    if (layout === 'schedule') return <DaySchedule activeId={activeId} />;
    return <DayBuckets activeId={activeId} />;
  })();

  // Nothing in the DOM used to say WHICH of the six views was mounted, so tests
  // inferred it from droppable ids — which are ambiguous ([data-dnd-id^="week:"]
  // is emitted by both week-buckets and week-schedule; unscheduled:anytime by
  // both day-buckets and day-schedule). A layout regression then surfaced as an
  // opaque timeout in an unrelated assertion. `display: contents` so this
  // wrapper adds a marker without joining the layout.
  return (
    <div
      data-testid="view-root"
      data-view-scope={scope}
      data-view-layout={layout}
      style={{ display: 'contents' }}
    >
      {view}
    </div>
  );
}
