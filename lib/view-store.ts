import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GroupBy, Priority } from './planner-types';
import { usePlannerStore } from './planner-store';
// week-columns imports ViewLayout back from here, but type-only — erased at
// compile time, so there is no runtime cycle.
import {
  clampWeekDays,
  isScalableLayout,
  resolveWeekDaysFromLastCanvas,
  stepWeekDays,
} from './week-columns';

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
/**
 * Chrome drawn on a schedule block when it's hovered/selected — the corner
 * registration plus the resize grips. All three are 1px --ink-1 hairline and
 * reveal on hover; they differ only in FORM (see components/views/day-schedule).
 *   nodes  — CAD bounding-box handles: hollow squares on the vertices (default)
 *   target — prepress registration crosshairs floating off each corner
 *   trim   — trim-mark lozenges + a three-patch ink strip for the grip
 */
export type ScheduleMarkStyle = 'nodes' | 'target' | 'trim';

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

export interface CanvasFilters {
  projects: string[];
  priorities: Priority[];
  hideCompleted: boolean;
}

const EMPTY_CANVAS_FILTERS: CanvasFilters = {
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
  canvasFilters: CanvasFilters;
  typeMode: TypeMode;
  scheduleMarkStyle: ScheduleMarkStyle;
  /**
   * How many day columns the week views try to fit across the canvas — the
   * value behind the week scale control. Stored as a day COUNT, not a pixel
   * width, so it keeps meaning the same thing when the canvas resizes under it
   * (item panel, sidebar, window). lib/week-columns.ts turns it into pixels.
   *
   * `null` means the user has never adjusted it, and is NOT the same as landing
   * on the default by choice: while it is null the view picks whichever stop
   * comes nearest TARGET_COL_PX on the canvas it actually has, and keeps
   * re-picking as that canvas changes. The first adjustment writes a number and
   * that is what persists from then on.
   */
  weekDaysVisible: number | null;
  /** One-time adoption of legacy planner-store view prefs (see adoptLegacyViewPrefs). */
  adoptedLegacy: boolean;

  setScope: (scope: ViewScope) => void;
  setLayout: (layout: ViewLayout) => void;
  setTypeFilter: (filter: TypeFilter) => void;
  setCanvasGroupBy: (groupBy: GroupBy) => void;
  setBraindumpGroupBy: (groupBy: BraindumpGroupBy) => void;
  setBraindumpFilters: (filters: BraindumpFilters) => void;
  setCanvasFilters: (filters: CanvasFilters) => void;
  setTypeMode: (mode: TypeMode) => void;
  setScheduleMarkStyle: (style: ScheduleMarkStyle) => void;
  /** `null` hands the choice back to the width-derived default. */
  setWeekDaysVisible: (days: number | null) => void;
  /** Move along the ladder by `delta` stops; +1 is one step wider. */
  stepWeekDaysVisible: (delta: number) => void;
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
      canvasFilters: EMPTY_CANVAS_FILTERS,
      typeMode: 'sans',
      scheduleMarkStyle: 'nodes',
      weekDaysVisible: null,
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
      setCanvasFilters: (canvasFilters) => set({ canvasFilters }),
      setTypeMode: (typeMode) => set({ typeMode }),
      setScheduleMarkStyle: (scheduleMarkStyle) => set({ scheduleMarkStyle }),
      // Clamped on the way IN, so nothing downstream has to defend against a
      // hand-edited localStorage value or a stale ladder. `null` passes through
      // untouched — it is the "never adjusted" state, not a bad number.
      setWeekDaysVisible: (days) =>
        set({ weekDaysVisible: days === null ? null : clampWeekDays(days) }),
      // Stepping is always an adjustment, so it resolves the current effective
      // value first — from the last measured canvas when nothing is stored yet —
      // and writes a concrete number. Stepping from null must not jump.
      stepWeekDaysVisible: (delta) =>
        set((s) => ({
          weekDaysVisible: stepWeekDays(resolveWeekDaysFromLastCanvas(s.weekDaysVisible), delta),
        })),
    }),
    {
      // NOT bumped for weekDaysVisible. zustand's default merge keeps the
      // initial value for any key the persisted payload lacks, so an existing
      // 'anchor-view' blob rehydrates with the default and no migration. A bump
      // would invalidate every stored payload — including the literal version:1
      // one tests/e2e/helpers/session.ts seeds, which would reset adoptedLegacy
      // and re-run the legacy adoption on a fixture.
      name: 'anchor-view',
      version: 1,
    }
  )
);

/**
 * True when the canvas should run edge-to-edge instead of the 1100px column.
 *
 * The week COLUMN views only. `canvas-container`'s cap exists so a day's rows
 * don't stretch into unreadable 2000px lines, and that argument holds just as
 * well for Week × List — but a grid of seven day columns is the one thing on
 * this canvas that can actually use the width, and capping it at 1100px is why
 * seven columns never fit on any monitor. The header capsule and the past-due
 * bar read this too, so all three keep the shared left edge that
 * `@utility canvas-container` exists to guarantee.
 */
export function useCanvasWide(): boolean {
  return useViewStore((s) => s.scope === 'week' && isScalableLayout(s.layout));
}

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
