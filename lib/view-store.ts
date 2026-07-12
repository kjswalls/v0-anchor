import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GroupBy } from './planner-types';
import { usePlannerStore } from './planner-store';

/**
 * View preferences for the redesigned canvas: what slice of time you're
 * looking at (scope), how it's laid out (layout), and what's shown.
 *
 * Source of truth going forward. During the migration (P2–P5) the legacy
 * fields in planner-store (viewMode, timelineItemFilter) are kept mirrored so
 * the old timeline/week-view keep working until their rewrites land; the
 * mirrors and the legacy fields are deleted in P8.
 */

export type ViewScope = 'day' | 'week';
export type ViewLayout = 'buckets' | 'schedule' | 'list';
export type TypeFilter = 'all' | 'tasks' | 'habits';
export type BraindumpGroupBy = 'none' | 'type' | 'project';
/** Content typeface: sans = Inter Medium 13 (Linear look), serif = Source Serif SemiBold 15. */
export type TypeMode = 'sans' | 'serif';

export interface BraindumpFilters {
  projects: string[];
  priorities: string[];
  hideCompleted: boolean;
}

const EMPTY_BRAINDUMP_FILTERS: BraindumpFilters = {
  projects: [],
  priorities: [],
  hideCompleted: false,
};

interface ViewStore {
  scope: ViewScope;
  layout: ViewLayout;
  typeFilter: TypeFilter;
  canvasGroupBy: GroupBy;
  braindumpGroupBy: BraindumpGroupBy;
  braindumpFilters: BraindumpFilters;
  typeMode: TypeMode;
  /** One-time adoption of legacy planner-store view prefs (see adoptLegacyViewPrefs). */
  adoptedLegacy: boolean;

  setScope: (scope: ViewScope) => void;
  setLayout: (layout: ViewLayout) => void;
  setTypeFilter: (filter: TypeFilter) => void;
  setCanvasGroupBy: (groupBy: GroupBy) => void;
  setBraindumpGroupBy: (groupBy: BraindumpGroupBy) => void;
  setBraindumpFilters: (filters: BraindumpFilters) => void;
  setTypeMode: (mode: TypeMode) => void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      scope: 'day',
      layout: 'buckets',
      typeFilter: 'all',
      canvasGroupBy: 'none',
      braindumpGroupBy: 'none',
      braindumpFilters: EMPTY_BRAINDUMP_FILTERS,
      typeMode: 'sans',
      adoptedLegacy: false,

      setScope: (scope) => {
        set({ scope });
        // Legacy mirror + user-settings sync (planner-store persists default_view)
        usePlannerStore.getState().setViewMode(scope);
      },
      setLayout: (layout) => set({ layout }),
      setTypeFilter: (typeFilter) => {
        set({ typeFilter });
        usePlannerStore.getState().setTimelineItemFilter(typeFilter);
      },
      setCanvasGroupBy: (canvasGroupBy) => {
        set({ canvasGroupBy });
        usePlannerStore.getState().setGroupBy(canvasGroupBy);
      },
      setBraindumpGroupBy: (braindumpGroupBy) => set({ braindumpGroupBy }),
      setBraindumpFilters: (braindumpFilters) => set({ braindumpFilters }),
      setTypeMode: (typeMode) => set({ typeMode }),
    }),
    {
      name: 'anchor-view',
      version: 1,
    }
  )
);

/**
 * Adopt the user's existing planner-store view prefs the first time the new
 * shell mounts, so nobody's saved day/week + filter choice resets. Runs once;
 * afterwards view-store is authoritative.
 */
export function adoptLegacyViewPrefs() {
  const view = useViewStore.getState();
  if (view.adoptedLegacy) return;
  const legacy = usePlannerStore.getState();
  useViewStore.setState({
    scope: legacy.viewMode,
    typeFilter: legacy.timelineItemFilter,
    canvasGroupBy: legacy.groupBy,
    adoptedLegacy: true,
  });
}
