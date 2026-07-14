'use client';

import { DayBuckets } from '@/components/views/day-buckets';
import { DayList } from '@/components/views/day-list';
import { useViewStore } from '@/lib/view-store';
import { useDragStore } from '@/lib/drag-store';

/**
 * The Today tab's view. Mobile ships a clamped subset of the desktop matrix —
 * day scope only, Buckets or List (Schedule-lite lands in 7b). It reuses the
 * exact desktop view components + the shared derivation, and reads its own
 * drag state (drop hints) rather than threading it down from the shell.
 */
export function MobileViewRouter() {
  const layout = useViewStore((s) => s.layout);
  const activeId = useDragStore((s) => s.activeId);

  if (layout === 'list') return <DayList />;
  return <DayBuckets activeId={activeId} />;
}
