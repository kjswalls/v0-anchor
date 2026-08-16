'use client';

import { WeekBuckets } from '@/components/views/week-buckets';
import { WeekList } from '@/components/views/week-list';
import { WeekSchedule } from '@/components/views/week-schedule';
import { DayBuckets } from '@/components/views/day-buckets';
import { DayList } from '@/components/views/day-list';
import { DaySchedule } from '@/components/views/day-schedule';
import { useViewStore } from '@/lib/view-store';
import { useDragStore } from '@/lib/drag-store';
import { usePlannerStore } from '@/lib/planner-store';

/**
 * Routes the canvas to one of the six scope × layout views. Subscribes to drag
 * state here (not via a prop) so a drag only re-renders the canvas subtree —
 * the views need it for drop hints, the rest of the shell doesn't.
 */
export function ViewRouter() {
  const activeId = useDragStore((s) => s.activeId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const userId = usePlannerStore((s) => s.userId);
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
      // Whether the planner store's initial fetch has LANDED. Hydration is not
      // the same thing: initializeStore replaces `projects`/`habitGroups`/
      // `items` wholesale when it resolves, so a write made in the window
      // between mount and that resolve is silently discarded. A test that acted
      // on "the page is interactive" could therefore create a project, watch it
      // appear, and find it gone — which reads as a broken create, not a race.
      //
      // `userId &&`, not `!isLoading` alone: isLoading is FALSE at rest and only
      // flips true once initializeStore starts, so the bare check is satisfied
      // by the pre-init state and would wave a test through before the fetch has
      // even been issued. userId is set in the same set() that raises the flag.
      data-loaded={userId && !isLoading ? 'true' : 'false'}
      style={{ display: 'contents' }}
    >
      {view}
    </div>
  );
}
