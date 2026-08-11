'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Task,
  Habit,
  Item,
  TaskItem,
  HabitItem,
  ItemType,
  ViewMode,
  GroupBy,
  FilterState,
  TimeBucket,
  TaskStatus,
  HabitStatus,
  Project,
  HabitGroupType,
  ItemTypeDef,
  Routine,
  Program,
} from './planner-types';
import { TIME_BUCKET_RANGES } from './planner-types';
import {
  fetchItems,
  fetchProjects,
  fetchHabitGroups,
  fetchItemTypes,
  createItemType as dbCreateItemType,
  updateItemType as dbUpdateItemType,
  deleteItemType as dbDeleteItemType,
  createItem as dbCreateItem,
  updateItem as dbUpdateItem,
  deleteItem as dbDeleteItem,
  restoreItem as dbRestoreItem,
  setItemCompletion as dbSetItemCompletion,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  restoreProject as dbRestoreProject,
  createHabitGroup as dbCreateHabitGroup,
  updateHabitGroup as dbUpdateHabitGroup,
  deleteHabitGroup as dbDeleteHabitGroup,
  restoreHabitGroup as dbRestoreHabitGroup,
  fetchRoutines,
  createRoutine as dbCreateRoutine,
  updateRoutine as dbUpdateRoutine,
  deleteRoutine as dbDeleteRoutine,
  restoreRoutine as dbRestoreRoutine,
  fetchPrograms,
  createProgram as dbCreateProgram,
  updateProgram as dbUpdateProgram,
  deleteProgram as dbDeleteProgram,
  restoreProgram as dbRestoreProgram,
} from './db';
import { ITEM_TYPES, getItemTypeConfig, itemTypeName, isSkippable, isPausable, isCollectible, hydrateCustomTypes } from './item-registry';
import {
  isPausedOn,
  isProgramActiveOn,
  inactiveItemIdsOn,
  suppressionReason,
  suppressionLabel,
} from './active';
import { recordReleased } from './sweep-grace';
import { PROJECT_FIELDS, HABIT_GROUP_FIELDS, ROUTINE_FIELDS, PROGRAM_FIELDS } from '@anchor-app/types';
import { saveSettings } from './settings-service';
import { isRecurring, isCompletedOnDate, toDateStr } from './recurrence';
import { accentColorForName } from './accent-colors';

interface PlannerStore {
  /**
   * Source of truth: every task and habit as a unified Item. `tasks` and
   * `habits` are projections kept in sync on every mutation so existing
   * consumers keep working unchanged; new code should prefer `items`.
   */
  items: Item[];
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: Project[];
  habitGroups: HabitGroupType[];
  timelineItemFilter: 'all' | 'tasks' | 'habits';
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  navDirection: 'left' | 'right' | null;
  setNavDirection: (direction: 'left' | 'right' | null) => void;
  chillMode: boolean;
  setChillMode: (chill: boolean) => void;
  showCurrentTimeIndicator: boolean;
  setShowCurrentTimeIndicator: (show: boolean) => void;
  showCompletedTasks: boolean;
  setShowCompletedTasks: (show: boolean) => void;
  /**
   * Render suppressed work in place, greyed, instead of hiding it (Phase 5).
   *
   * Deliberately grid-only. The braindump already has a better answer — the
   * Paused section groups by CAUSE, which a greyed row inline cannot — and the
   * question this setting answers is a canvas question: "what would today look
   * like with Summer back on?"
   */
  showPausedOnGrid: boolean;
  setShowPausedOnGrid: (show: boolean) => void;
  defaultView: 'day' | 'week';
  setDefaultView: (view: 'day' | 'week') => void;
  defaultTimeBucket: TimeBucket;
  setDefaultTimeBucket: (bucket: TimeBucket) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  weekStartDay: 'sunday' | 'monday' | 'saturday';
  setWeekStartDay: (day: 'sunday' | 'monday' | 'saturday') => void;
  timeFormat: '12h' | '24h';
  setTimeFormat: (format: '12h' | '24h') => void;
  /** IANA zone from user_settings (hydrated on login); use with chat timestamps, EOD, etc. */
  userTimezone: string | null;
  /** ID of the task/habit card currently under the mouse cursor — used by keyboard shortcuts */
  hoveredItemId: string | null;
  hoveredItemType: 'task' | 'habit' | null;
  setHoveredItem: (id: string | null, type: 'task' | 'habit' | null) => void;

  // Supabase state
  userId: string | null;
  isLoading: boolean;
  error: string | null;

  // Store lifecycle
  initializeStore: (userId: string) => Promise<void>;
  clearStore: () => void;

  // Task actions ('task' actions operate on any task-LIKE item — custom types
  // are task-shaped and ride this pipeline; only habits are excluded)
  /** Create an item of a user-defined type (task-shaped). */
  addItem: (
    customType: string,
    item: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>,
    memberships?: Memberships,
  ) => void;
  addTask: (
    task: Omit<Task, 'id' | 'order' | 'status' | 'isScheduled'>,
    memberships?: Memberships,
  ) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string, status?: TaskStatus, date?: Date) => void;
  scheduleTask: (id: string, bucket: TimeBucket, time?: string, date?: string) => void;
  assignTaskToBucket: (id: string, bucket: TimeBucket) => void;
  unscheduleTask: (id: string) => void;
  /**
   * Carry ONE task-like item to `dateStr` (yyyy-MM-dd), guaranteeing it stays
   * visible on that day (see the timeBucket note at the implementation).
   * Preserves startTime.
   */
  moveTaskToDate: (id: string, dateStr: string) => void;
  /**
   * Bulk carry: one set(), one history entry, one undo. Same visibility
   * guarantee as moveTaskToDate, but deliberately drops startTime/isScheduled.
   * `bucket` overrides each item's own bucket (a week-grid group drop targets a
   * specific bucket); omitted, each item keeps its current bucket.
   */
  moveTasksToDate: (ids: string[], dateStr: string, bucket?: TimeBucket) => void;
  /** Batched unscheduleTask — one set(), one history entry, one undo. */
  unscheduleTasks: (ids: string[]) => void;
  reorderTasks: (taskIds: string[]) => void;

  // Multi-select bulk actions (any kind). Each does exactly ONE set() so the
  // whole gesture is a single undo, then fans out one DB write per item with
  // that item's own slug — see moveTasksToDate for the pattern.
  /** Bulk delete a mixed selection, cascading task-like subtasks. */
  deleteItems: (ids: string[]) => void;
  /**
   * Bulk completion for `date`, routed per kind: per-date completedDates for
   * habits and recurring task-likes, scalar status for one-off task-likes.
   * Items already in the target state are skipped (no double-counted streaks).
   */
  setItemsCompleted: (ids: string[], completed: boolean, date?: Date) => void;
  /** Bulk assign a mixed selection to a time bucket, untimed (group drag). */
  assignItemsToBucket: (ids: string[], bucket: TimeBucket) => void;
  /**
   * Add or remove a whole selection's membership of one routine or program, in
   * one set() ⇒ one undo. The registry gates eligibility (subtasks are not
   * collectible), so a mixed selection collects its eligible subset rather than
   * refusing wholesale — same posture as the other bulk verbs.
   */
  setItemsCollected: (
    ids: string[],
    kind: 'routine' | 'program',
    containerId: string,
    member: boolean,
  ) => void;
  /**
   * Bulk schedule a mixed selection AT a clock time (group drag onto a timed
   * grid slot) so they land as visible blocks, not untimed rows. Task-likes take
   * the date; habits are date-blind and just take the bucket + time. One undo.
   */
  scheduleItemsAt: (ids: string[], bucket: TimeBucket, time: string, dateStr?: string) => void;
  /**
   * Declare whether ONE recurring occurrence is skipped (intent-based, so a
   * repeat is a no-op). Type-agnostic: the registry decides whether the type
   * can be skipped at all and whether a skip is also denormalized into scalar
   * `status` — it is for habits, never for tasks (see ItemTypeConfig.skipStatus).
   */
  setItemSkipped: (id: string, skipped: boolean, date?: Date) => void;
  /** Pause/resume an item. `until` is an exclusive resume date (yyyy-MM-dd). */
  setItemPaused: (id: string, paused: boolean, until?: string) => void;

  // Habit actions
  addHabit: (habit: Omit<Habit, 'id' | 'streak' | 'status' | 'completedDates' | 'skippedDates' | 'dailyCounts' | 'currentDayCount'>, memberships?: Memberships) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitStatus: (id: string, status: HabitStatus, count?: number, date?: Date) => void;
  scheduleHabit: (id: string, bucket: TimeBucket, time?: string) => void;
  assignHabitToBucket: (id: string, bucket: TimeBucket) => void;
  resetHabitStreak: (id: string) => void;

  // View actions
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: ViewMode) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setFilters: (filters: FilterState) => void;
  clearFilters: () => void;
  setTimelineItemFilter: (filter: 'all' | 'tasks' | 'habits') => void;

  // Project actions
  addProject: (name: string, emoji: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  getProjectEmoji: (name: string) => string;
  getProjectColor: (name: string) => string;
  getProject: (name: string) => Project | undefined;
  moveTaskToProjectBlock: (taskId: string) => void;
  moveTasksToProjectBlock: (taskIds: string[]) => void;
  moveTaskOutOfProjectBlock: (taskId: string) => void;

  // Item type definitions (user-defined types, Phase 6). Hydrated into the
  // capability registry on load; NOT part of undo/redo history.
  itemTypes: ItemTypeDef[];
  /** False when the item_types table is unreachable (migration 021 not yet
   *  applied) — creation UI must gate on this or writes vanish on reload. */
  itemTypesAvailable: boolean;
  addItemType: (def: Omit<ItemTypeDef, 'id'>) => void;
  updateItemType: (id: string, updates: Partial<Omit<ItemTypeDef, 'id' | 'name'>>) => void;
  removeItemType: (id: string) => void;

  // Routines (migration 024). A routine scopes its members: while it is paused,
  // its items are suppressed even though nothing on the items changed. Part of
  // undo/redo history, unlike itemTypes — membership is user data.
  routines: Routine[];
  /** False when migration 024's tables are unreachable. Every routine UI gates
   *  on this, or writes look like they landed and vanish on reload. */
  collectionsAvailable: boolean;
  addRoutine: (routine: Omit<Routine, 'id'> & { id?: string }) => string;
  updateRoutine: (id: string, updates: Partial<Omit<Routine, 'id'>>) => void;
  removeRoutine: (id: string) => void;
  /** Pause/resume a routine. Same today-resolved, dateless semantics as items. */
  setRoutinePaused: (id: string, paused: boolean, until?: string) => void;

  // Programs (migration 024). A period of life — summer, a school year — holding
  // items and/or whole routines. Same undo/redo treatment as routines, and
  // gated by the same `collectionsAvailable` flag.
  programs: Program[];
  addProgram: (program: Omit<Program, 'id'> & { id?: string }) => string;
  updateProgram: (id: string, updates: Partial<Omit<Program, 'id'>>) => void;
  removeProgram: (id: string) => void;
  /**
   * Set a program's tri-state. Separate from `updateProgram` for the same reason
   * `setRoutinePaused` is: it stamps its own action-log label, and the history
   * subscriber fires synchronously inside set().
   */
  setProgramState: (id: string, state: Program['state']) => void;
  /**
   * Activate one program and pause every other one that is currently on, in a
   * SINGLE set() — decision 3's "swap programs is just pause A + activate B",
   * made one gesture so it is also one ⌘Z.
   */
  swapToProgram: (id: string) => void;

  // Habit group actions
  addHabitGroup: (name: string, emoji: string, color?: string) => void;
  updateHabitGroup: (id: string, updates: Partial<HabitGroupType>) => void;
  removeHabitGroup: (id: string) => void;
  getHabitGroupEmoji: (name: string) => string;
  getHabitGroupColor: (name: string) => string;

  // Cleanup orphaned references
  cleanupOrphanedReferences: () => void;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Action log for displaying undo/redo history
  actionLog: ActionLogEntry[];
  historyIndex: number;
  refreshActionLog: () => void;
}

// Projections: keep `tasks`/`habits` derived from `items` in the same set()
// so every consumer sees a consistent snapshot. TaskItem/HabitItem are
// structurally assignable to Task/Habit (the extra `type` key is inert).
//
// Phase 6b: the app-internal `tasks` projection is task-LIKE (custom-type
// items included — they're task-shaped and ride the task pipeline in every
// view). This is NOT the pinned external projection: db.ts fetchTasks and the
// context response keep type === 'task' exactly. Runtime objects retain their
// type/customType keys (projections filter, never map).
const projectItems = (items: Item[]) => ({
  items,
  // Subtasks (parentItemId set) live inside their parent's detail surface and
  // are deliberately EXCLUDED from the tasks projection — braindump, buckets,
  // schedule, EOD/morning all read this projection, so one filter keeps a
  // subtask from showing up as a free-floating task everywhere at once.
  // items[] still carries them (the panel and the agent context read items).
  tasks: items.filter(
    (i): i is TaskItem => i.type !== 'habit' && !i.parentItemId
  ) as Task[],
  habits: items.filter((i): i is HabitItem => i.type === 'habit'),
});

// History management for undo/redo
/**
 * Container membership handed to an add action, so the item row and its join
 * rows land in ONE set() and therefore one history entry.
 *
 * The add actions mint ids internally and return void, so "create, then apply
 * membership" has no id to apply to — and would cost a second undo step, which
 * makes one user gesture take two ⌘Z to reverse.
 */
export interface Memberships {
  routineIds?: string[];
  programIds?: string[];
}

/**
 * Create the item row, THEN its join rows.
 *
 * The order is load-bearing and cannot be parallelised: routine_items and
 * program_items each carry a composite FK (item_id, user_id) -> items(id,
 * user_id), so a join insert that lands before the item does fails with 23503
 * and the membership is silently lost — the store would show it, and a reload
 * would not. Chaining off the create is the whole point of this helper existing
 * rather than two call sites firing side by side.
 */
function persistNewItem(
  userId: string,
  row: Item,
  memberships: Memberships | undefined,
  get: () => PlannerStore,
) {
  const created = dbCreateItem(userId, row);
  created.catch(console.error);

  const routineIds = memberships?.routineIds ?? [];
  const programIds = memberships?.programIds ?? [];
  if (routineIds.length === 0 && programIds.length === 0) return;

  created
    .then(() =>
      Promise.all([
        // Re-read in both loops: the optimistic set() already appended, and
        // these are the arrays the reconciler diffs against.
        ...routineIds.map((rid) => {
          const routine = get().routines.find((r) => r.id === rid);
          return routine ? dbUpdateRoutine(userId, rid, { itemIds: routine.itemIds }) : undefined;
        }),
        ...programIds.map((pid) => {
          const program = get().programs.find((p) => p.id === pid);
          return program ? dbUpdateProgram(userId, pid, { itemIds: program.itemIds }) : undefined;
        }),
      ]),
    )
    .catch(console.error);
}

/**
 * Add `itemId` to each named container. Returns the SAME array reference when
 * there is nothing to do, so the common no-membership add doesn't churn
 * identity and re-render every consumer of the list.
 */
function withMembership<T extends { id: string; itemIds: string[] }>(
  containers: T[],
  itemId: string,
  containerIds: string[] | undefined,
): T[] {
  if (!containerIds?.length) return containers;
  const want = new Set(containerIds);
  return containers.map((c) =>
    want.has(c.id) && !c.itemIds.includes(itemId) ? { ...c, itemIds: [...c.itemIds, itemId] } : c,
  );
}

/**
 * Decision 11's receipt: did the thing the user just moved land somewhere it
 * will not be seen?
 *
 * The move verbs are all ALLOWED to drop work into a suppressed window —
 * blocking them would fight the boundary week, which deliberately renders live
 * and hidden columns side by side so you can plan across the handoff. What is
 * not allowed is doing it silently. A drag that ends with the block simply gone
 * is indistinguishable from a bug.
 *
 * Resolved at the TARGET date, not today: dropping a task on a column after a
 * program ends is exactly the case this exists for, and today would answer
 * about the wrong day. Suppression that is dateless (a paused item, a paused
 * routine) answers the same on every date, so it is covered by the same call.
 *
 * Lives here rather than in each caller because there are five of them — DnD,
 * EOD's move-all, two date pickers and the mobile sheet — and they all funnel
 * through these actions. One definition, per lib/overdue.ts's founding lesson.
 */
function landingReceipt(
  state: { items: Item[]; routines: Routine[]; programs: Program[]; userTimezone: string | null },
  ids: readonly string[],
  dateStr?: string,
): string | undefined {
  const tz = state.userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const target = dateStr ?? toDateStr(new Date(), tz);
  const ctx = { userTimezone: tz, routines: state.routines, programs: state.programs };
  const labels = ids
    .map((id) => state.items.find((i) => i.id === id))
    .filter((item): item is Item => !!item)
    .map((item) => suppressionReason(item, target, ctx))
    .filter((reason) => !!reason)
    .map((reason) => suppressionLabel(reason, { long: true }));

  if (labels.length === 0) return undefined;
  // One cause, however many items: say it. Mixed causes across a bulk move
  // can't be summarised without inventing a shared reason, so it counts instead.
  const unique = new Set(labels);
  if (unique.size === 1) return labels[0];
  return `${labels.length} of these are hidden where they landed`;
}

/**
 * Suppressed open loops right now, for the release-grace diff below.
 *
 * `inactiveItemIdsOn` and not `isItemActiveOn`, deliberately: only open loops
 * can ever be swept, so anything else appearing in the diff would grant grace
 * to work that was never at risk.
 */
function suppressedNow(
  state: { items: Item[]; routines: Routine[]; programs: Program[] },
  todayStr: string,
  tz: string,
): Set<string> {
  return inactiveItemIdsOn(state.items, todayStr, {
    userTimezone: tz,
    routines: state.routines,
    programs: state.programs,
  });
}

interface HistoryState {
  items: Item[];
  projects: Project[];
  habitGroups: HabitGroupType[];
  // Explicit, because the subscriber snapshots only what it is told. Omitting
  // either container would make every membership edit and every pause/state
  // change un-undoable AND would let an unrelated undo silently revert them,
  // since applyHistoryState writes the whole snapshot back.
  routines: Routine[];
  programs: Program[];
}

export type ActionLogEntry = {
  id: string;
  label: string;
  timestamp: number;
  /**
   * A second line for the undo toast, set when the action's result is not
   * visible where the user just put it (plan decision 11). Optional and
   * ignored everywhere else — the action log itself renders labels only.
   */
  receipt?: string;
};

const MAX_HISTORY_SIZE = 50;
let historyStack: HistoryState[] = [];
let historyIndex = -1;
let isUndoRedoAction = false;
let actionLog: ActionLogEntry[] = [];
let pendingActionLabel: string | null = null;
let pendingActionReceipt: string | undefined;

// Set the label for the next action that will be saved to history
export const setNextActionLabel = (label: string, receipt?: string) => {
  pendingActionLabel = label;
  pendingActionReceipt = receipt;
};

// Get the current action log
export const getActionLog = (): ActionLogEntry[] => {
  return [...actionLog].reverse(); // Most recent first
};

// Get the current history index for highlighting current position
export const getHistoryInfo = () => ({
  currentIndex: historyIndex,
  totalEntries: historyStack.length,
  actionLog: [...actionLog].reverse(),
});

const saveToHistory = (state: HistoryState) => {
  if (isUndoRedoAction) return;

  // If we're not at the end of history, truncate forward history
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
    actionLog = actionLog.slice(0, historyIndex + 1);
  }

  // Deep clone the state to avoid reference issues.
  //
  // Every key of HistoryState must appear here. Omitting one does not fail
  // loudly: applyHistoryState restores the missing slice as [], and
  // syncContainers reads "present in current, absent in restored" as a DELETE —
  // so one Cmd+Z silently soft-deletes every row of that container in Supabase.
  // That is exactly what shipped for `routines` and the review caught it.
  const snapshot: HistoryState = {
    items: JSON.parse(JSON.stringify(state.items)),
    projects: JSON.parse(JSON.stringify(state.projects)),
    habitGroups: JSON.parse(JSON.stringify(state.habitGroups)),
    routines: JSON.parse(JSON.stringify(state.routines)),
    programs: JSON.parse(JSON.stringify(state.programs)),
  };

  historyStack.push(snapshot);

  // Add action log entry
  actionLog.push({
    id: crypto.randomUUID(),
    label: pendingActionLabel || 'Unknown action',
    timestamp: Date.now(),
    receipt: pendingActionReceipt,
  });
  pendingActionLabel = null;
  pendingActionReceipt = undefined;

  // Limit history size
  if (historyStack.length > MAX_HISTORY_SIZE) {
    historyStack.shift();
    actionLog.shift();
  } else {
    historyIndex++;
  }
};

// Get appropriate bucket for a given time
const getBucketForTime = (time: string): TimeBucket => {
  const hour = parseInt(time.split(':')[0]);
  if (hour >= TIME_BUCKET_RANGES.morning.start && hour < TIME_BUCKET_RANGES.morning.end) {
    return 'morning';
  } else if (hour >= TIME_BUCKET_RANGES.afternoon.start && hour < TIME_BUCKET_RANGES.afternoon.end) {
    return 'afternoon';
  } else if (hour >= TIME_BUCKET_RANGES.evening.start || hour < 5) {
    return 'evening';
  }
  return 'anytime';
};

// A concrete start time overrides a mismatched bucket ('anytime' is exempt).
// Single home for the auto-correct rule that used to be copied six times.
const autoCorrectBucket = (
  time: string | undefined,
  bucket: TimeBucket | undefined,
): TimeBucket | undefined =>
  time && bucket && bucket !== 'anytime' ? getBucketForTime(time) : bucket;

// Per-type diff for undo/redo db sync — fields come from the schema-derived
// registry lists, so a new schema field can never silently drop out of sync.
const diffItem = (from: Item, to: Item): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  for (const key of getItemTypeConfig(itemTypeName(to)).fields) {
    const a = (from as Record<string, unknown>)[key];
    const b = (to as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) patch[key] = b;
  }
  return patch;
};

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => {
      // ── Unified item engine (private) ──────────────────────────────────────
      const findItem = (id: string, type: ItemType): Item | undefined =>
        get().items.find((i) => i.id === id && i.type === type);

      /**
       * Custom types are task-shaped and ride the task action pipeline
       * (Phase 6b): "task" actions operate on any non-habit item. The
       * habit/task boundary stays hard — a task-like lookup never returns a
       * habit, so e.g. the sidebar drop calling unscheduleTask with a habit
       * id remains a complete no-op.
       */
      const findTaskLike = (id: string): Item | undefined =>
        get().items.find((i) => i.id === id && i.type !== 'habit');

      /**
       * findTaskLike's runtime filter guarantees non-habit but its declared
       * return type is the full union, so `startDate` needs the narrowing
       * spelled out. Habits genuinely have no startDate — they are date-blind
       * by design — so undefined here is the right answer, not a fallback.
       */
      const startDateOf = (item: Item | undefined): string | undefined =>
        item && item.type !== 'habit' ? item.startDate : undefined;

      /**
       * Run a container write, and record any item whose suppression it ENDED.
       *
       * The auto-age sweep reads recorded resume dates to grace work that has
       * just come back (decision 9). Deleting a container, or pulling a member
       * out of one, releases items with no such record anywhere — the container
       * or the join row it would have been read from is precisely what was
       * removed. Without this, tidying up a paused routine hands every one of
       * its dated members to the next morning's sweep, already weeks overdue.
       *
       * Diffed rather than inferred from the patch: "was hidden, is now
       * visible" is the only question that matters, and the path algebra makes
       * it genuinely hard to answer any other way (an item with a second live
       * path was never hidden; one held by two paused programs still is).
       */
      const withReleaseGrace = (mutate: () => void) => {
        const tz = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const todayStr = toDateStr(new Date(), tz);
        const before = suppressedNow(get(), todayStr, tz);
        mutate();
        if (before.size === 0) return;
        const after = suppressedNow(get(), todayStr, tz);
        const released = [...before].filter((id) => !after.has(id));
        if (released.length > 0) recordReleased(released, todayStr);
      };

      /** DB slug for an item ('task' | 'habit' | custom slug). */
      const dbTypeOf = (item: Item): string =>
        item.type === 'custom' ? item.customType : item.type;

      /**
       * Optimistically apply `updates` to one item and persist. The type guard
       * is load-bearing (see findTaskLike); 'task' here means "task-like".
       *
       * Deliberate change from the pre-unification store: a store miss also
       * suppresses the DB write (old code issued it blindly, which could touch
       * soft-deleted trash rows).
       */
      const updateItemAction = (id: string, type: ItemType, updates: Partial<Task> | Partial<Habit>) => {
        const found = type === 'habit' ? findItem(id, 'habit') : findTaskLike(id);
        if (!found) return;
        set((state) => projectItems(
          state.items.map((i) => (i.id === id && i.type === found.type ? { ...i, ...updates } as Item : i)),
        ));
        dbUpdateItem(id, dbTypeOf(found), updates).catch(console.error);
      };

      const resolveDateStr = (date?: Date): string => {
        const userTimezone = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        return toDateStr(date ?? get().selectedDate, userTimezone);
      };

      return {
      ...projectItems([]),
      selectedDate: new Date(),
      viewMode: 'day',
      groupBy: 'none',
      filters: {},
      projects: [],
      habitGroups: [],
      timelineItemFilter: 'all' as const,
      actionLog: [] as ActionLogEntry[],
      historyIndex: -1,
      refreshActionLog: () => {
        const info = getHistoryInfo();
        set({ actionLog: info.actionLog, historyIndex: info.currentIndex });
      },
      compactMode: false,
      setCompactMode: (compact) => {
        set({ compactMode: compact });
        const userId = get().userId;
        if (userId) saveSettings(userId, { compact_mode: compact });
      },
      navDirection: null,
      setNavDirection: (direction) => set({ navDirection: direction }),
      chillMode: false,
      setChillMode: (chill) => {
        set({ chillMode: chill });
        const userId = get().userId;
        if (userId) saveSettings(userId, { chill_mode: chill });
      },
      showCurrentTimeIndicator: true,
      setShowCurrentTimeIndicator: (show) => {
        set({ showCurrentTimeIndicator: show });
        const userId = get().userId;
        if (userId) saveSettings(userId, { show_time_indicator: show });
      },
      showCompletedTasks: true,
      setShowCompletedTasks: (show) => {
        set({ showCompletedTasks: show });
        const userId = get().userId;
        if (userId) saveSettings(userId, { show_completed_tasks: show });
      },
      showPausedOnGrid: false,
      // Local-only, unlike its showCompletedTasks neighbour: persisting it
      // server-side would mean a user_settings column, and a migration is a
      // steep price for a preference that answers "what am I looking at on this
      // screen". It rides planner-storage's partialize, which is where the rest
      // of the view preferences already live.
      setShowPausedOnGrid: (show) => set({ showPausedOnGrid: show }),
      defaultView: 'day',
      setDefaultView: (view) => {
        set({ defaultView: view, viewMode: view });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_view: view });
      },
      defaultTimeBucket: 'anytime',
      setDefaultTimeBucket: (bucket) => {
        set({ defaultTimeBucket: bucket });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_time_bucket: bucket });
      },
      animationsEnabled: true,
      setAnimationsEnabled: (enabled) => {
        set({ animationsEnabled: enabled });
        const userId = get().userId;
        if (userId) saveSettings(userId, { animations_enabled: enabled });
      },
      weekStartDay: 'sunday',
      setWeekStartDay: (day) => {
        set({ weekStartDay: day });
        const userId = get().userId;
        if (userId) saveSettings(userId, { week_start_day: day });
      },
      timeFormat: '12h',
      setTimeFormat: (format) => {
        set({ timeFormat: format });
        const userId = get().userId;
        if (userId) saveSettings(userId, { time_format: format });
      },
      userTimezone: null,
      hoveredItemId: null,
      hoveredItemType: null,
      setHoveredItem: (id, type) => set({ hoveredItemId: id, hoveredItemType: type }),

      // Supabase state
      userId: null,
      isLoading: false,
      error: null,

      // ── Item type definitions (Phase 6) ────────────────────────────────────
      itemTypes: [],
      itemTypesAvailable: true,
      addItemType: (def) => {
        const userId = get().userId;
        if (!get().itemTypesAvailable) return;
        const name = def.name.trim().toLowerCase();
        if (!name || ['task', 'habit', 'custom'].includes(name)) return;
        if (get().itemTypes.some((t) => t.name === name)) return;
        const full: ItemTypeDef = { ...def, name, id: crypto.randomUUID() };
        const next = [...get().itemTypes, full];
        hydrateCustomTypes(next);
        set({ itemTypes: next });
        if (userId) dbCreateItemType(userId, full).catch(console.error);
      },
      updateItemType: (id, updates) => {
        const next = get().itemTypes.map((t) => (t.id === id ? { ...t, ...updates } : t));
        hydrateCustomTypes(next);
        set({ itemTypes: next });
        dbUpdateItemType(id, updates).catch(console.error);
      },
      // Items of the type are NOT deleted — they fall back to the registry's
      // default template (capitalized-name label).
      removeItemType: (id) => {
        const next = get().itemTypes.filter((t) => t.id !== id);
        hydrateCustomTypes(next);
        set({ itemTypes: next });
        dbDeleteItemType(id).catch(console.error);
      },

      // ── Routines (Phase 2) ─────────────────────────────────────────────────
      routines: [],
      collectionsAvailable: true,
      addRoutine: (routine) => {
        const userId = get().userId;
        const full: Routine = { ...routine, id: routine.id ?? crypto.randomUUID() };
        setNextActionLabel(`Add routine: ${full.name}`);
        set({ routines: [...get().routines, full] });
        if (userId) dbCreateRoutine(userId, full).catch(console.error);
        return full.id;
      },
      updateRoutine: (id, updates) => {
        const userId = get().userId;
        const routine = get().routines.find((r) => r.id === id);
        if (!routine) return;
        setNextActionLabel(`Edit routine: ${updates.name ?? routine.name}`);
        // Only a membership change can release anything; a rename or a colour
        // cannot, and the diff costs two resolver passes.
        const run = () =>
          set({ routines: get().routines.map((r) => (r.id === id ? { ...r, ...updates } : r)) });
        if (updates.itemIds) withReleaseGrace(run);
        else run();
        if (userId) dbUpdateRoutine(userId, id, updates).catch(console.error);
      },
      removeRoutine: (id) => {
        const userId = get().userId;
        const routine = get().routines.find((r) => r.id === id);
        if (!routine) return;
        // Soft delete. The join rows survive, so a restore within the purge
        // window brings the membership back intact — which is also what makes
        // undo of a delete a real undo rather than an empty shell.
        setNextActionLabel(`Delete routine: ${routine.name}`);
        withReleaseGrace(() => set({ routines: get().routines.filter((r) => r.id !== id) }));
        if (userId) dbDeleteRoutine(userId, id).catch(console.error);
      },
      setRoutinePaused: (id, paused, until) => {
        const routine = get().routines.find((r) => r.id === id);
        if (!routine) return;
        // Resolved at TODAY from a single instant, never at selectedDate —
        // pausing is dateless (decision 3), and this is the bug Phase 1 shipped
        // and had to fix on the item side. Same reasoning, same shape.
        const tz = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const todayStr = toDateStr(new Date(), tz);
        if (isPausedOn(routine, todayStr, tz) === paused) return;
        // Manual resume normalizes pausedUntil to today rather than clearing
        // the pair — the interval stays on the row for the sweep's grace.
        const updates: Partial<Routine> = paused
          ? { pausedAt: new Date().toISOString(), pausedUntil: until }
          : { pausedUntil: todayStr };
        // Writes directly rather than delegating to updateRoutine: that action
        // stamps its own "Edit routine" label, and the history subscriber fires
        // synchronously on its set(), so a label applied afterwards would land
        // on whatever the user does NEXT.
        setNextActionLabel(`${paused ? 'Pause' : 'Resume'} routine: ${routine.name}`);
        set({ routines: get().routines.map((r) => (r.id === id ? { ...r, ...updates } : r)) });
        const userId = get().userId;
        if (userId) dbUpdateRoutine(userId, id, updates).catch(console.error);
      },

      // ── Programs (Phase 3) ─────────────────────────────────────────────────
      programs: [],
      addProgram: (program) => {
        const userId = get().userId;
        const full: Program = { ...program, id: program.id ?? crypto.randomUUID() };
        setNextActionLabel(`Add program: ${full.name}`);
        set({ programs: [...get().programs, full] });
        if (userId) dbCreateProgram(userId, full).catch(console.error);
        return full.id;
      },
      updateProgram: (id, updates) => {
        const userId = get().userId;
        const program = get().programs.find((p) => p.id === id);
        if (!program) return;
        setNextActionLabel(`Edit program: ${updates.name ?? program.name}`);
        const run = () =>
          set({ programs: get().programs.map((p) => (p.id === id ? { ...p, ...updates } : p)) });
        // Membership OR a date range: moving `startsOn` earlier switches the
        // program on for today just as surely as adding a member does.
        if (updates.itemIds || updates.routineIds || 'startsOn' in updates || 'endsOn' in updates) {
          withReleaseGrace(run);
        } else {
          run();
        }
        if (userId) dbUpdateProgram(userId, id, updates).catch(console.error);
      },
      removeProgram: (id) => {
        const userId = get().userId;
        const program = get().programs.find((p) => p.id === id);
        if (!program) return;
        // Soft delete, and the join rows survive it — so a restore inside the
        // 30-day purge window brings the membership back intact, and undo of a
        // delete is a real undo rather than an empty shell. Note the members
        // REAPPEAR while the program is trashed: a routine it was the only
        // holder of falls back to standalone (resolver decision 3). That is the
        // designed behaviour — a container in the trash must not keep hiding
        // work behind a control nobody can reach.
        setNextActionLabel(`Delete program: ${program.name}`);
        withReleaseGrace(() => set({ programs: get().programs.filter((p) => p.id !== id) }));
        if (userId) dbDeleteProgram(userId, id).catch(console.error);
      },
      setProgramState: (id, state) => {
        const userId = get().userId;
        const program = get().programs.find((p) => p.id === id);
        if (!program || program.state === state) return;
        const verb =
          state === 'active' ? 'Activate' : state === 'paused' ? 'Pause' : 'Auto-schedule';
        // Written directly rather than through updateProgram for the same
        // reason setRoutinePaused is: that action stamps its own "Edit program"
        // label, and the history subscriber fires synchronously inside its
        // set(), so a label applied afterwards lands on the user's NEXT action.
        setNextActionLabel(`${verb} program: ${program.name}`);
        // `updatedAt` is stamped optimistically to mirror what the DB trigger is
        // about to do. Without it the store keeps the value it loaded with, and
        // the overdue sweep's grace (c) — whose ONLY evidence that a program
        // recently stopped hiding its members is this timestamp — would not fire
        // until the next reload. Turning a program on and leaving the tab open
        // overnight is exactly the case it protects.
        const stamped = { state, updatedAt: new Date().toISOString() };
        set({ programs: get().programs.map((p) => (p.id === id ? { ...p, ...stamped } : p)) });
        if (userId) dbUpdateProgram(userId, id, { state }).catch(console.error);
      },
      swapToProgram: (id) => {
        const userId = get().userId;
        const target = get().programs.find((p) => p.id === id);
        if (!target) return;
        // Resolved at TODAY, never at selectedDate — switching programs is a
        // statement about now, not about the week being browsed.
        const tz = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const todayStr = toDateStr(new Date(), tz);

        const patches = new Map<string, Partial<Program>>();
        // Only write the target if it is not ALREADY on. An `auto` program
        // inside its own date range is already carrying its members, and
        // stamping 'active' would silently convert a self-managing program into
        // one the user must remember to turn off.
        if (!isProgramActiveOn(target, todayStr)) patches.set(id, { state: 'active' });
        for (const program of get().programs) {
          if (program.id === id) continue;
          if (isProgramActiveOn(program, todayStr)) patches.set(program.id, { state: 'paused' });
        }
        if (patches.size === 0) return;

        // ONE set() for the whole swap: one history entry, one ⌘Z. A loop over
        // setProgramState would cost one undo press per program that happened
        // to be on, which for a verb the user experiences as a single switch is
        // effectively not undoable.
        setNextActionLabel(`Switch to program: ${target.name}`);
        const now = new Date().toISOString();
        set({
          programs: get().programs.map((p) => {
            const patch = patches.get(p.id);
            // Same optimistic `updatedAt` as setProgramState, and needed most
            // here: a swap is precisely the moment a dormant program's members
            // flood back in, already carrying weeks of accrued overdue age.
            return patch ? { ...p, ...patch, updatedAt: now } : p;
          }),
        });
        if (userId) {
          for (const [programId, patch] of patches) {
            dbUpdateProgram(userId, programId, patch).catch(console.error);
          }
        }
      },

      initializeStore: async (userId: string) => {
        // Block subscriber during initialization to prevent poisoned history entries
        isUpdatingUndoRedo = true;
        hasInitializedHistory = false;

        // Reset history for new session
        historyStack = [];
        historyIndex = -1;
        actionLog = [];
        prevStateJson = null;

        set({ userId, isLoading: true, error: null });

        try {
          const [items, projects, habitGroups, itemTypesResult, routinesResult, programsResult] =
            await Promise.all([
              fetchItems(userId),
              fetchProjects(userId),
              fetchHabitGroups(userId),
              fetchItemTypes(userId),
              fetchRoutines(userId),
              // Rides the SAME Promise.all as items, deliberately: the overdue
              // sweep's only hydration gate is `!isLoading`, which is cleared by
              // the single set() below. Fetch programs anywhere else — a lazy
              // load, a second effect — and the sweep runs against an empty
              // list, reads every member of an inactive program as unprotected,
              // and unschedules them in one silent batch. See use-overdue-sweep.
              fetchPrograms(userId),
            ]);
          const itemTypes = itemTypesResult ?? [];
          // null means the table is unreachable, NOT "no rows" — the flag gates
          // the UI so a write can't look like it landed and vanish.
          const routines = routinesResult ?? [];
          const programs = programsResult ?? [];

          // Custom types must be resolvable before any item renders.
          hydrateCustomTypes(itemTypes);

          const snapshot = { items, projects, habitGroups, routines, programs };

          // Manually push the initial state to history (session start)
          historyStack.push(JSON.parse(JSON.stringify(snapshot)));
          actionLog.push({
            id: crypto.randomUUID(),
            label: 'Session start',
            timestamp: Date.now(),
          });
          historyIndex = 0;

          // Set prevStateJson so the subscriber doesn't double-save
          prevStateJson = JSON.stringify(snapshot);

          isUpdatingUndoRedo = true;
          set({
            ...projectItems(items),
            projects,
            habitGroups,
            itemTypes,
            itemTypesAvailable: itemTypesResult !== null,
            routines,
            programs,
            // Both tables arrive with migration 024, so either coming back
            // unreachable means the same thing: the whole collections feature
            // is not deployed and its UI must stay hidden.
            collectionsAvailable: routinesResult !== null && programsResult !== null,
            isLoading: false,
            canUndo: false,
            canRedo: false,
            actionLog: [...actionLog].reverse(),
            historyIndex: 0,
          });
          isUpdatingUndoRedo = false;
        } catch (err) {
          isUpdatingUndoRedo = false;
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load data',
          });
        }
      },

      clearStore: () => {
        historyStack = [];
        historyIndex = -1;
        actionLog = [];
        prevStateJson = null;

        hydrateCustomTypes([]);
        isUpdatingUndoRedo = true;
        set({
          userId: null,
          ...projectItems([]),
          projects: [],
          habitGroups: [],
          itemTypes: [],
          routines: [],
          programs: [],
          collectionsAvailable: true,
          isLoading: false,
          error: null,
          canUndo: false,
          canRedo: false,
          actionLog: [],
          historyIndex: -1,
          userTimezone: null,
        });
        isUpdatingUndoRedo = false;
      },

      addItem: (customType, itemData, memberships) => {
        // Only hydrated custom slugs: 'task'/'habit' would write a corrupt
        // row through the task-shaped mapper, 'custom' is the envelope
        // discriminant, and unknown slugs shouldn't be minted by a typo.
        if (
          ['task', 'habit', 'custom'].includes(customType) ||
          !get().itemTypes.some((t) => t.name === customType)
        ) {
          return;
        }
        const config = getItemTypeConfig(customType);
        setNextActionLabel(`Add ${config.label.toLowerCase()}: ${itemData.title}`);
        const timeBucket = autoCorrectBucket(itemData.startTime, itemData.timeBucket);

        const item: Item = {
          ...itemData,
          type: 'custom',
          customType,
          timeBucket,
          id: crypto.randomUUID(),
          status: 'pending',
          isScheduled: !!timeBucket,
          order: 0, // custom types aren't manually orderable (created_at sorts)
        };
        set((state) => ({
          ...projectItems([...state.items, item]),
          routines: withMembership(state.routines, item.id, memberships?.routineIds),
          programs: withMembership(state.programs, item.id, memberships?.programIds),
        }));

        const userId = get().userId;
        if (userId) persistNewItem(userId, item, memberships, get);
      },

      addTask: (taskData, memberships) => {
        setNextActionLabel(`Add task: ${taskData.title}`);
        const timeBucket = autoCorrectBucket(taskData.startTime, taskData.timeBucket);

        const task: TaskItem = {
          ...taskData,
          type: 'task',
          timeBucket,
          id: crypto.randomUUID(),
          status: 'pending',
          isScheduled: !!timeBucket,
          order: get().tasks.length,
        };
        set((state) => ({
          ...projectItems([...state.items, task]),
          routines: withMembership(state.routines, task.id, memberships?.routineIds),
          programs: withMembership(state.programs, task.id, memberships?.programIds),
        }));

        const userId = get().userId;
        if (userId) persistNewItem(userId, task, memberships, get);
      },

      updateTask: (id, updates) => {
        const task = findTaskLike(id);
        // A date change through the generic edit action IS a move verb, and two
        // of the surfaces decision 11 names by name arrive here rather than at
        // moveTaskToDate: the EOD review's "Tomorrow" button and date picker
        // (which is also how "Move all to tomorrow" works, one row at a time),
        // and the item dialog's date chip. Attaching the receipt to the update
        // itself is what stops the next such surface from being missed too.
        setNextActionLabel(
          `Edit task: ${task?.title || 'Unknown'}`,
          'startDate' in updates ? landingReceipt(get(), [id], updates.startDate) : undefined
        );

        const newUpdates = { ...updates };
        // Auto-correct bucket if start time changes
        if (updates.startTime && task) {
          const bucket = updates.timeBucket || task.timeBucket;
          const corrected = autoCorrectBucket(updates.startTime, bucket);
          if (corrected !== bucket) newUpdates.timeBucket = corrected;
        }

        updateItemAction(id, 'task', newUpdates);
      },

      deleteTask: (id) => {
        const found = findTaskLike(id);
        setNextActionLabel(`Delete task: ${found?.title || 'Unknown'}`);
        if (!found) return;
        // Cascade to subtasks explicitly: soft-delete doesn't fire the DB's
        // ON DELETE SET NULL (that's for the hard purge), and an orphaned
        // subtask would be unreachable — excluded from every view, parent gone.
        const children = get().items.filter(
          (i) => i.type !== 'habit' && i.parentItemId === id
        );
        set((state) =>
          projectItems(
            state.items.filter(
              (i) =>
                !(i.id === id && i.type === found.type) &&
                !children.some((c) => c.id === i.id)
            )
          )
        );

        dbDeleteItem(id, dbTypeOf(found)).catch(console.error);
        children.forEach((c) => dbDeleteItem(c.id, dbTypeOf(c)).catch(console.error));
      },

      toggleTaskStatus: (id, status?, date?) => {
        const found = findTaskLike(id);
        const task = found as TaskItem | undefined;
        if (!task || !found) return;

        if (isRecurring(task)) {
          // Per-date completion tracking — never change global status
          const dateStr = resolveDateStr(date);
          const alreadyDone = isCompletedOnDate(task, dateStr);
          const newCompletedDates = alreadyDone
            ? (task.completedDates ?? []).filter(d => d !== dateStr)
            : [...(task.completedDates ?? []), dateStr];

          setNextActionLabel(`${alreadyDone ? 'Uncomplete' : 'Complete'} task on ${dateStr}: ${task.title}`);
          set((state) => projectItems(
            state.items.map(i => i.id === id && i.type === found.type ? { ...i, completedDates: newCompletedDates } : i),
          ));
          dbSetItemCompletion(id, dbTypeOf(found), dateStr, !alreadyDone).catch(console.error);
        } else {
          // One-off task — existing behavior unchanged
          const newStatus: TaskStatus = status ?? (task.status === 'completed' ? 'pending' : 'completed');
          setNextActionLabel(`${newStatus === 'completed' ? 'Complete' : 'Uncomplete'} task: ${task.title}`);
          updateItemAction(id, 'task', { status: newStatus });
        }
      },

      scheduleTask: (id, bucket, time, date) => {
        const task = findTaskLike(id);
        setNextActionLabel(
          `Schedule task: ${task?.title || 'Unknown'}`,
          landingReceipt(get(), [id], date ?? startDateOf(task))
        );
        const finalBucket = autoCorrectBucket(time, bucket) ?? bucket;

        const updates: Partial<Task> = {
          isScheduled: true,
          timeBucket: finalBucket,
          startTime: time,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
          ...(date ? { startDate: date } : {}),
        };

        updateItemAction(id, 'task', updates);
      },

      assignTaskToBucket: (id, bucket) => {
        const task = findTaskLike(id);
        setNextActionLabel(
          `Move task to ${bucket}: ${task?.title || 'Unknown'}`,
          landingReceipt(get(), [id], startDateOf(task))
        );
        const updates: Partial<Task> = {
          isScheduled: false,
          timeBucket: bucket,
          startTime: undefined,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
        };

        updateItemAction(id, 'task', updates);
      },

      unscheduleTask: (id) => {
        const task = findTaskLike(id);
        if (!task) return; // habit ids no-op here by contract (sidebar drop)
        setNextActionLabel(`Unschedule task: ${task.title}`);
        updateItemAction(id, 'task', { isScheduled: false, timeBucket: undefined, startTime: undefined, startDate: undefined });
      },

      /**
       * Carry one task-like item to `dateStr`.
       *
       * The timeBucket fallback is load-bearing, not cosmetic: lib/day-items.ts
       * buckets (:98) and counts (:134) ONLY tasks that have a timeBucket, so a
       * carry that wrote startDate alone would move the item to the target day
       * and make it invisible in every day view.
       *
       * startTime is preserved on purpose — the user picked this one item, so
       * its clock time is meaningful. (The bulk verb below drops it; see there.)
       */
      moveTaskToDate: (id, dateStr) => {
        const task = findTaskLike(id);
        if (!task) return; // habit ids no-op here by contract (see findTaskLike)
        // 'Move task to' is the prefix hooks/use-undo-toast.ts SIGNIFICANT_ACTIONS
        // matches (shared with assignTaskToBucket) — keep it verbatim or the undo
        // toast silently stops appearing.
        setNextActionLabel(
          `Move task to ${dateStr}: ${task.title}`,
          landingReceipt(get(), [id], dateStr)
        );
        updateItemAction(id, 'task', {
          startDate: dateStr,
          timeBucket: task.timeBucket ?? 'anytime',
        });
      },

      /**
       * Bulk carry. Callers are responsible for excluding recurring items — a
       * recurring task's startDate is its recurrence anchor, so carrying it
       * rewrites the series rather than moving an occurrence.
       */
      moveTasksToDate: (ids, dateStr, bucket) => {
        const idSet = new Set(ids);
        // Resolved before the label is set: setNextActionLabel arms a pending
        // label consumed by the NEXT history save, so labelling a no-op would
        // mislabel whatever the user does next.
        const targets = get().items.filter((i) => i.type !== 'habit' && idSet.has(i.id));
        if (targets.length === 0) return;
        // 'Move all tasks' is already in SIGNIFICANT_ACTIONS; this is its first producer.
        setNextActionLabel(
          `Move all tasks to ${dateStr} (${targets.length})`,
          landingReceipt(get(), targets.map((t) => t.id), dateStr)
        );

        const writes = targets.map((item) => ({
          id: item.id,
          dbType: dbTypeOf(item),
          updates: {
            startDate: dateStr,
            // Same load-bearing visibility guarantee as moveTaskToDate. A group
            // week-grid drop passes the target bucket; otherwise keep own.
            timeBucket: bucket ?? item.timeBucket ?? 'anytime',
            // Deliberately cleared, unlike the single-item verb: a bulk carry can
            // drag 18 stale clock times (06:00, 22:30, …) onto today at once, and
            // deriveGridRange widens the schedule window to cover them, which
            // drives use-fit-hour-px to its MIN_HOUR_PX floor. The bulk verb would
            // then destroy the very fit-to-height contract this feature exists to
            // protect, so bulk-carried items land as untimed bucket rows.
            startTime: undefined,
            isScheduled: false,
          } satisfies Partial<Task>,
        }));

        // ONE set() => ONE history entry (the subscriber at the bottom of this
        // file snapshots per state change). A per-item loop would push N deep
        // clones, evict the user's real history at MAX_HISTORY_SIZE, and need N
        // presses of Cmd+Z to reverse a single user gesture.
        const patchById = new Map(writes.map((w) => [w.id, w.updates]));
        set((state) => projectItems(state.items.map((i) => {
          const updates = i.type !== 'habit' ? patchById.get(i.id) : undefined;
          return updates ? ({ ...i, ...updates } as Item) : i;
        })));

        // Every item persists — dbType per item, because a custom-type row is
        // matched on .eq('type', slug) and 'task' would silently write nothing.
        writes.forEach(({ id, dbType, updates }) =>
          dbUpdateItem(id, dbType, updates).catch(console.error),
        );
      },

      /** Batched unscheduleTask (bulk "move to Braindump", auto-age sweep). */
      unscheduleTasks: (ids) => {
        const idSet = new Set(ids);
        const targets = get().items.filter((i) => i.type !== 'habit' && idSet.has(i.id));
        if (targets.length === 0) return;
        // The prefix must stay exactly 'Unschedule task:' — that is the string in
        // hooks/use-undo-toast.ts SIGNIFICANT_ACTIONS. A plural 'Unschedule tasks:'
        // would NOT match its startsWith() test and the undo toast would never fire.
        setNextActionLabel(
          targets.length === 1
            ? `Unschedule task: ${targets[0].title}`
            : `Unschedule task: ${targets.length} items`,
        );

        // Field-for-field identical to unscheduleTask so the single and batched
        // verbs can never drift apart.
        const updates: Partial<Task> = {
          isScheduled: false,
          timeBucket: undefined,
          startTime: undefined,
          startDate: undefined,
        };

        // One set() => one history entry => one undo (see moveTasksToDate).
        set((state) => projectItems(state.items.map((i) => (
          i.type !== 'habit' && idSet.has(i.id) ? ({ ...i, ...updates } as Item) : i
        ))));

        targets.forEach((item) =>
          dbUpdateItem(item.id, dbTypeOf(item), updates).catch(console.error),
        );
      },

      reorderTasks: (taskIds) => {
        setNextActionLabel('Reorder tasks');
        // Tasks absent from taskIds keep their current order — a partial list
        // (e.g. one filtered view) must never drop the rest of the store.
        const orderById = new Map(taskIds.map((id, index) => [id, index]));
        const changed: TaskItem[] = [];

        set((state) => projectItems(
          state.items.map((i) => {
            if (i.type !== 'task') return i;
            const order = orderById.get(i.id);
            if (order === undefined || order === i.order) return i;
            const updated = { ...i, order };
            changed.push(updated);
            return updated;
          }),
        ));

        changed.forEach((t) =>
          dbUpdateItem(t.id, 'task', { order: t.order }).catch(console.error)
        );
      },

      /**
       * Bulk delete for multi-select. Accepts a mixed selection of any kind
       * (habits + task-like), cascades task-like subtasks the way deleteTask
       * does, and does exactly ONE set() so the whole gesture is a single undo.
       * Ids are unique across the items table, so id-only membership is safe.
       */
      deleteItems: (ids) => {
        const idSet = new Set(ids);
        const targets = get().items.filter((i) => idSet.has(i.id));
        if (targets.length === 0) return;

        // Subtasks of any deleted task-like parent (habits carry none). Soft
        // delete doesn't fire the DB's ON DELETE SET NULL, so an orphaned
        // subtask would be unreachable — cascade explicitly, as deleteTask does.
        const deletedTaskLike = new Set(
          targets.filter((i) => i.type !== 'habit').map((i) => i.id)
        );
        const children = get().items.filter(
          (i) =>
            i.type !== 'habit' &&
            i.parentItemId != null &&
            deletedTaskLike.has(i.parentItemId) &&
            !idSet.has(i.id)
        );

        setNextActionLabel(`Delete items (${targets.length})`);

        const removeIds = new Set<string>([...idSet, ...children.map((c) => c.id)]);
        set((state) => projectItems(state.items.filter((i) => !removeIds.has(i.id))));

        [...targets, ...children].forEach((item) =>
          dbDeleteItem(item.id, dbTypeOf(item)).catch(console.error)
        );
      },

      /**
       * Bulk completion for multi-select. Marks every eligible id complete (or
       * incomplete) for `date`, routed per kind:
       *   - habit               → per-date completedDates + optimistic streak
       *                           (the RPC owns streak server-side, as in
       *                           toggleHabitStatus)
       *   - recurring task-like → per-date completedDates (never scalar status)
       *   - one-off task-like   → scalar status
       * Items already in the target state are skipped, so a re-complete never
       * double-counts a streak. One set() ⇒ one undo.
       */
      setItemsCompleted: (ids, completed, date) => {
        const idSet = new Set(ids);
        const dateStr = resolveDateStr(date);
        const targets = get().items.filter((i) => idSet.has(i.id));
        if (targets.length === 0) return;

        const patchById = new Map<string, Record<string, unknown>>();
        const dbWrites: (() => void)[] = [];

        for (const item of targets) {
          if (item.type === 'habit') {
            const habit = item as HabitItem;
            const wasCompleted = habit.completedDates.includes(dateStr);
            if (wasCompleted === completed) continue;
            // Completing also clears a skip for the day (mirrors toggleHabitStatus).
            const newSkippedDates = completed
              ? (habit.skippedDates ?? []).filter((d) => d !== dateStr)
              : habit.skippedDates ?? [];
            const newStatus = completed ? 'done' : 'pending';
            patchById.set(item.id, {
              status: newStatus,
              completedDates: completed
                ? [...habit.completedDates, dateStr]
                : habit.completedDates.filter((d) => d !== dateStr),
              skippedDates: newSkippedDates,
              streak: completed ? habit.streak + 1 : Math.max(0, habit.streak - 1),
            });
            dbWrites.push(() => {
              // Streak + completedDates are server-owned on the RPC. The companion
              // update carries status AND skippedDates — the RPC never touches
              // skipped_dates, so the skip-clear must persist here or it reappears
              // on reload (matches toggleHabitStatus, which passes skippedDates).
              dbSetItemCompletion(item.id, 'habit', dateStr, completed).catch(console.error);
              dbUpdateItem(item.id, 'habit', {
                status: newStatus,
                skippedDates: newSkippedDates,
              }).catch(console.error);
            });
          } else {
            const task = item as TaskItem;
            const dbType = dbTypeOf(item);
            if (isRecurring(task)) {
              if (isCompletedOnDate(task, dateStr) === completed) continue;
              patchById.set(item.id, {
                completedDates: completed
                  ? [...(task.completedDates ?? []), dateStr]
                  : (task.completedDates ?? []).filter((d) => d !== dateStr),
              });
              dbWrites.push(() =>
                dbSetItemCompletion(item.id, dbType, dateStr, completed).catch(console.error)
              );
            } else {
              const newStatus: TaskStatus = completed ? 'completed' : 'pending';
              if (task.status === newStatus) continue;
              patchById.set(item.id, { status: newStatus });
              dbWrites.push(() =>
                dbUpdateItem(item.id, dbType, { status: newStatus }).catch(console.error)
              );
            }
          }
        }

        if (patchById.size === 0) return;
        setNextActionLabel(`${completed ? 'Complete' : 'Uncomplete'} items (${patchById.size})`);

        set((state) =>
          projectItems(
            state.items.map((i) => {
              const patch = patchById.get(i.id);
              return patch ? ({ ...i, ...patch } as Item) : i;
            })
          )
        );

        dbWrites.forEach((w) => w());
      },

      /**
       * Collect a selection into a routine or program, or release it.
       *
       * The membership half of the bulk verbs, and the reason it is one action
       * rather than N calls to updateRoutine: each of those would push its own
       * history entry, so undoing "add twelve items to Summer" would take twelve
       * Cmd+Z. One set(), one entry, same contract the other bulk verbs hold.
       *
       * Both directions have a consequence the user must be told about, and they
       * are opposites:
       *  · ADDING to a container that is currently off hides the items on the
       *    spot. Allowed — that is what collecting into a paused program means —
       *    but never silently, so it carries decision 11's receipt.
       *  · REMOVING from a container that was hiding them makes them visible
       *    again, possibly weeks overdue, so it needs the sweep's release grace
       *    exactly as removeRoutine and updateRoutine do.
       */
      setItemsCollected: (ids, kind, containerId, member) => {
        const userId = get().userId;
        const idSet = new Set(ids);
        // Registry, not a type check: the subtask rule lives in isCollectible,
        // and a second copy here would drift the first time a capability moves.
        const eligible = get()
          .items.filter((i) => idSet.has(i.id) && isCollectible(i))
          .map((i) => i.id);
        if (eligible.length === 0) return;

        const list = kind === 'routine' ? get().routines : get().programs;
        const container = list.find((c) => c.id === containerId);
        if (!container) return;

        const eligibleSet = new Set(eligible);
        const nextIds = member
          ? [...container.itemIds, ...eligible.filter((id) => !container.itemIds.includes(id))]
          : container.itemIds.filter((id) => !eligibleSet.has(id));
        // Nothing to do — every item was already in the requested state. Bail
        // before the label, or an undo entry appears for a write that never was.
        if (nextIds.length === container.itemIds.length) return;

        const changed = Math.abs(nextIds.length - container.itemIds.length);
        const withNext = <T extends { id: string; itemIds: string[] }>(cs: T[]) =>
          cs.map((c) => (c.id === containerId ? { ...c, itemIds: nextIds } : c));
        const nextRoutines = kind === 'routine' ? withNext(get().routines) : get().routines;
        const nextPrograms = kind === 'program' ? withNext(get().programs) : get().programs;

        // Resolved against the PROSPECTIVE containers, not the current ones.
        // Every other caller of landingReceipt moves an item's date while the
        // containers hold still, so asking before the write is the same answer;
        // here it is the containers that move, and asking before would report
        // the world the user is leaving. Cheaper and simpler than writing first
        // and re-labelling, which would need the label read back out.
        const receipt = member
          ? landingReceipt(
              {
                items: get().items,
                routines: nextRoutines,
                programs: nextPrograms,
                userTimezone: get().userTimezone,
              },
              eligible,
            )
          : undefined;

        setNextActionLabel(
          member
            ? `Add to ${container.name}: ${changed} ${changed === 1 ? 'item' : 'items'}`
            : `Remove from ${container.name}: ${changed} ${changed === 1 ? 'item' : 'items'}`,
          receipt,
        );

        withReleaseGrace(() =>
          set(kind === 'routine' ? { routines: nextRoutines } : { programs: nextPrograms }),
        );

        if (userId) {
          const write =
            kind === 'routine'
              ? dbUpdateRoutine(userId, containerId, { itemIds: nextIds })
              : dbUpdateProgram(userId, containerId, { itemIds: nextIds });
          write.catch(console.error);
        }
      },

      /**
       * Bulk bucket assignment for a group drag. Mirrors assignTaskToBucket
       * (untimed) for task-likes and assignHabitToBucket for habits, in one
       * set() ⇒ one undo. A group dropped on a timed slot degrades to the slot's
       * bucket, untimed — N items can't share one clock time coherently.
       */
      assignItemsToBucket: (ids, bucket) => {
        const idSet = new Set(ids);
        const targets = get().items.filter((i) => idSet.has(i.id));
        if (targets.length === 0) return;
        setNextActionLabel(`Move ${targets.length} items to ${bucket}`);

        const taskUpdates: Partial<Task> = {
          isScheduled: false,
          timeBucket: bucket,
          startTime: undefined,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
        };
        const habitUpdates: Partial<Habit> = { timeBucket: bucket, startTime: undefined };

        set((state) =>
          projectItems(
            state.items.map((i) =>
              idSet.has(i.id)
                ? ({ ...i, ...(i.type === 'habit' ? habitUpdates : taskUpdates) } as Item)
                : i
            )
          )
        );

        targets.forEach((item) =>
          dbUpdateItem(
            item.id,
            dbTypeOf(item),
            item.type === 'habit' ? habitUpdates : taskUpdates
          ).catch(console.error)
        );
      },

      scheduleItemsAt: (ids, bucket, time, dateStr) => {
        const idSet = new Set(ids);
        const targets = get().items.filter((i) => idSet.has(i.id));
        if (targets.length === 0) return;
        const corrected = autoCorrectBucket(time, bucket) ?? bucket;
        // 'Schedule items' — plural — is its own SIGNIFICANT_ACTIONS prefix in
        // hooks/use-undo-toast.ts. The old label matched none of them, so a
        // group drag onto the grid produced no toast at ALL: no undo affordance
        // and, once decision 11 arrived, nowhere for the receipt to appear.
        setNextActionLabel(
          `Schedule items: ${targets.length} items`,
          landingReceipt(get(), ids, dateStr)
        );

        // All land at the same clock time; the grid's overlap layout tiles them.
        const taskUpdates: Partial<Task> = {
          isScheduled: true,
          timeBucket: corrected,
          startTime: time,
          inProjectBlock: false,
          previousStartTime: undefined,
          previousStartDate: undefined,
          ...(dateStr ? { startDate: dateStr } : {}),
        };
        const habitUpdates: Partial<Habit> = { timeBucket: corrected, startTime: time };

        set((state) =>
          projectItems(
            state.items.map((i) =>
              idSet.has(i.id)
                ? ({ ...i, ...(i.type === 'habit' ? habitUpdates : taskUpdates) } as Item)
                : i
            )
          )
        );

        targets.forEach((item) =>
          dbUpdateItem(
            item.id,
            dbTypeOf(item),
            item.type === 'habit' ? habitUpdates : taskUpdates
          ).catch(console.error)
        );
      },

      setItemSkipped: (id, skipped, date) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        const config = getItemTypeConfig(itemTypeName(item));
        // Capability + recurrence, never `type === 'habit'`. A one-shot item
        // has no occurrence to skip, so this is a no-op rather than a write
        // that no surface would ever read back.
        if (!isSkippable(item)) return;

        // Types whose status vocabulary carries a skip value (habits) keep
        // going through the status toggle: it owns the interaction between a
        // skip, the day's completion and the server-side streak, and that
        // behavior is deliberately untouched here.
        if (config.skipStatus) {
          get().toggleHabitStatus(id, (skipped ? config.skipStatus : 'pending') as HabitStatus, undefined, date);
          return;
        }

        const dateStr = resolveDateStr(date);
        const current = item.skippedDates ?? [];
        if (current.includes(dateStr) === skipped) return;
        setNextActionLabel(
          `${skipped ? 'Skip' : 'Unskip'} ${config.label.toLowerCase()} on ${dateStr}: ${item.title}`,
        );

        const optimistic: Partial<Task> = {
          skippedDates: skipped ? [...current, dateStr] : current.filter((d) => d !== dateStr),
        };
        // A skipped occurrence is not a completed one — same exclusivity the
        // habit path enforces. Completion belongs to the atomic RPC, so it is
        // applied optimistically here and written there, never as an absolute
        // array through the update allowlist.
        const clearCompletion = skipped && isCompletedOnDate(item, dateStr);
        if (clearCompletion) {
          optimistic.completedDates = (item.completedDates ?? []).filter((d) => d !== dateStr);
        }

        set((state) => projectItems(
          state.items.map((i) => (i.id === id && i.type === item.type ? { ...i, ...optimistic } as Item : i)),
        ));

        if (clearCompletion) {
          dbSetItemCompletion(id, dbTypeOf(item), dateStr, false).catch(console.error);
        }
        dbUpdateItem(id, dbTypeOf(item), { skippedDates: optimistic.skippedDates }).catch(console.error);
      },

      /**
       * Pause or resume ONE item.
       *
       * Writes nothing but the two pause columns — never status, streak,
       * completedDates, skippedDates, startDate, repeat* or timeBucket. That
       * restraint is the feature: because a streak only ever moves inside the
       * completion RPC and nothing in the app decays one on a missed day,
       * "pause without losing your streak" needs no streak handling at all, and
       * resume finds the item exactly where it was (an item with no timeBucket
       * is invisible in day views, so a pause that touched it would strand it).
       *
       * A resume sets `pausedUntil` to today rather than clearing the pair, so
       * the interval stays readable on the row — the auto-age sweep's resume
       * grace is computed from it, and clearing would make a returning user's
       * whole backlog sweepable the next morning.
       */
      setItemPaused: (id, paused, until) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        if (!isPausable(item)) return;
        const config = getItemTypeConfig(itemTypeName(item));

        // TODAY, deliberately — NOT resolveDateStr(), which resolves the
        // navigable selectedDate. Pausing is not a per-date verb the way
        // completing or skipping is (plan decision 3: dateless surfaces resolve
        // at today), so browsing next week and hitting Pause must not write a
        // resume date from the day you happen to be looking at. Both values
        // come off one instant so they cannot straddle midnight.
        const tz = get().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const todayStr = toDateStr(now, tz);
        if (isPausedOn(item, todayStr, tz) === paused) return;

        const updates: Partial<Task> = paused
          ? { pausedAt: now.toISOString(), pausedUntil: until }
          : { pausedUntil: todayStr };

        setNextActionLabel(
          paused
            ? `Pause ${config.label.toLowerCase()}: ${item.title}`
            : `Resume ${config.label.toLowerCase()}: ${item.title}`,
        );

        set((state) => projectItems(
          state.items.map((i) => (i.id === id ? { ...i, ...updates } as Item : i)),
        ));
        dbUpdateItem(id, dbTypeOf(item), updates).catch(console.error);
      },

      addHabit: (habitData, memberships) => {
        setNextActionLabel(`Add habit: ${habitData.title}`);
        const timeBucket = autoCorrectBucket(habitData.startTime, habitData.timeBucket);

        const habit: HabitItem = {
          ...habitData,
          type: 'habit',
          timeBucket,
          id: crypto.randomUUID(),
          streak: 0,
          status: 'pending',
          completedDates: [],
          skippedDates: [],
          dailyCounts: {},
          currentDayCount: 0,
        };
        set((state) => ({
          ...projectItems([...state.items, habit]),
          routines: withMembership(state.routines, habit.id, memberships?.routineIds),
          programs: withMembership(state.programs, habit.id, memberships?.programIds),
        }));

        const userId = get().userId;
        if (userId) persistNewItem(userId, habit, memberships, get);
      },

      updateHabit: (id, updates) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Edit habit: ${habit?.title || 'Unknown'}`);

        const newUpdates = { ...updates };
        // Auto-correct bucket if start time changes
        if (updates.startTime && habit) {
          const bucket = updates.timeBucket || habit.timeBucket;
          const corrected = autoCorrectBucket(updates.startTime, bucket);
          if (corrected !== bucket) newUpdates.timeBucket = corrected;
        }

        updateItemAction(id, 'habit', newUpdates);
      },

      deleteHabit: (id) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Delete habit: ${habit?.title || 'Unknown'}`);
        if (!habit) return;
        set((state) => projectItems(state.items.filter((i) => !(i.id === id && i.type === 'habit'))));

        dbDeleteItem(id, 'habit').catch(console.error);
      },

      toggleHabitStatus: (id, status, count, date) => {
        const habit = findItem(id, 'habit') as HabitItem | undefined;
        if (!habit) return;
        const statusLabel = status === 'done' ? 'Complete' : status === 'skipped' ? 'Skip' : 'Reset';
        setNextActionLabel(`${statusLabel} habit: ${habit.title}`);
        const dateStr = resolveDateStr(date);

        const wasCompleted = habit.completedDates.includes(dateStr);
        const wasSkipped = (habit.skippedDates ?? []).includes(dateStr);
        let newCompletedDates = [...habit.completedDates];
        let newSkippedDates = [...(habit.skippedDates ?? [])];
        const newDailyCounts = { ...(habit.dailyCounts ?? {}) };
        let newStreak = habit.streak;

        // Completion goes through the intent-based atomic RPC: it sets the
        // desired end state for the date and owns the streak transition
        // server-side (streak moves only if the array actually changes), so
        // streak and completion history can't desync under partial failure,
        // stale clients, or rapid double-toggles. The optimistic values below
        // are UI-only; the companion update deliberately excludes
        // completedDates AND streak.
        if (status === 'done' && !wasCompleted) {
          newCompletedDates.push(dateStr);
          newStreak += 1;
        } else if (status !== 'done' && wasCompleted) {
          newCompletedDates = newCompletedDates.filter((d) => d !== dateStr);
          newStreak = Math.max(0, newStreak - 1);
        }

        if (status === 'skipped' && !wasSkipped) {
          newSkippedDates.push(dateStr);
        } else if (status !== 'skipped' && wasSkipped) {
          newSkippedDates = newSkippedDates.filter((d) => d !== dateStr);
        }

        if (count !== undefined) {
          newDailyCounts[dateStr] = count;
        }

        const optimistic: Partial<Habit> = {
          status,
          completedDates: newCompletedDates,
          skippedDates: newSkippedDates,
          dailyCounts: newDailyCounts,
          currentDayCount: count !== undefined ? count : habit.currentDayCount || 0,
          streak: newStreak,
        };

        set((state) => projectItems(
          state.items.map((i) => (i.id === id && i.type === 'habit' ? { ...i, ...optimistic } as Item : i)),
        ));

        dbSetItemCompletion(id, 'habit', dateStr, status === 'done').catch(console.error);
        const { completedDates: _cd, streak: _st, ...rest } = optimistic;
        dbUpdateItem(id, 'habit', rest).catch(console.error);
      },

      scheduleHabit: (id, bucket, time) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Schedule habit: ${habit?.title || 'Unknown'}`);
        const finalBucket = autoCorrectBucket(time, bucket) ?? bucket;
        updateItemAction(id, 'habit', { timeBucket: finalBucket, startTime: time });
      },

      assignHabitToBucket: (id, bucket) => {
        const habit = findItem(id, 'habit');
        // Habits are date-blind, so the receipt resolves at today — which is
        // what a dateless surface must use anyway (decision 3).
        setNextActionLabel(
          `Move habit to ${bucket}: ${habit?.title || 'Unknown'}`,
          landingReceipt(get(), [id])
        );
        updateItemAction(id, 'habit', { timeBucket: bucket, startTime: undefined });
      },

      resetHabitStreak: (id) => {
        const habit = findItem(id, 'habit');
        setNextActionLabel(`Reset streak: ${habit?.title || 'Unknown'}`);
        // Streak counter only — completedDates/dailyCounts are completion
        // history on unified items and must survive a streak reset. The
        // confirm dialog copy in item-dialog matches this wording.
        updateItemAction(id, 'habit', { streak: 0 });
      },

      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (viewMode) => {
        set({ viewMode, defaultView: viewMode });
        const userId = get().userId;
        if (userId) saveSettings(userId, { default_view: viewMode });
      },
      setGroupBy: (groupBy) => set({ groupBy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setTimelineItemFilter: (timelineItemFilter) => set({ timelineItemFilter }),

      addProject: (name, emoji) => {
        setNextActionLabel(`Add project: ${name}`);
        const alreadyExists = get().projects.some((p) => p.name === name);
        if (alreadyExists) return;

        const project: Project = { id: crypto.randomUUID(), name, emoji };
        set((state) => ({ projects: [...state.projects, project] }));

        const userId = get().userId;
        if (userId) dbCreateProject(userId, project).catch(console.error);
      },

      updateProject: (id, updates) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Edit project: ${project?.name || 'Unknown'}`);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateProject(userId, id, updates).catch(console.error);
      },

      removeProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Delete project: ${project?.name || 'Unknown'}`);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          ...projectItems(state.items.map((i) =>
            i.type === 'task' && i.project === project?.name ? { ...i, project: undefined } : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteProject(userId, id).catch(console.error);
      },

      getProjectEmoji: (name) => {
        const project = get().projects.find((p) => p.name === name);
        return project?.emoji || '';
      },

      // Stored color wins (same precedence as getHabitGroupColor); the
      // name-hash ramp remains the no-choice default, so nothing changes for
      // projects that never picked one.
      getProjectColor: (name) => {
        const project = get().projects.find((p) => p.name === name);
        return project?.color || accentColorForName(name);
      },

      getProject: (name) => {
        return get().projects.find((p) => p.name === name);
      },

      moveTaskToProjectBlock: (taskId) => {
        const moved = findItem(taskId, 'task');
        setNextActionLabel(`Move task into project block: ${moved?.title || 'Unknown'}`);
        // resolveDateStr = toDateStr(selectedDate, userTimezone) — the user-tz
        // day the canvas is derived against, so a machine-tz off-by-one can't
        // file this into a project block on the wrong day.
        const selectedDateStr = resolveDateStr();
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.items.find((i) => i.id === taskId && i.type === 'task') as TaskItem | undefined;
          if (!task || !task.project) return state;

          const project = state.projects.find((p) => p.name === task.project);
          if (!project || !project.startTime || !project.timeBucket) return state;

          taskUpdates = {
            inProjectBlock: true,
            previousStartTime: task.startTime,
            previousStartDate: task.startDate,
            startTime: undefined,
            timeBucket: project.timeBucket,
            isScheduled: true,
            startDate: selectedDateStr,
          };

          return projectItems(state.items.map((i) =>
            i.id === taskId && i.type === 'task' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, 'task', taskUpdates).catch(console.error);
      },

      moveTasksToProjectBlock: (taskIds) => {
        setNextActionLabel(`Move ${taskIds.length} tasks into project block`);
        // resolveDateStr = toDateStr(selectedDate, userTimezone) — the user-tz
        // day the canvas is derived against, so a machine-tz off-by-one can't
        // file this into a project block on the wrong day.
        const selectedDateStr = resolveDateStr();
        const updatesMap = new Map<string, Partial<Task>>();

        set((state) => {
          const firstTask = state.items.find(
            (i): i is TaskItem => i.type === 'task' && taskIds.includes(i.id)
          );
          if (!firstTask || !firstTask.project) return state;

          const project = state.projects.find((p) => p.name === firstTask.project);
          if (!project || !project.startTime || !project.timeBucket) return state;

          return projectItems(state.items.map((i) => {
            if (i.type !== 'task' || !taskIds.includes(i.id)) return i;
            const updates: Partial<Task> = {
              inProjectBlock: true,
              previousStartTime: i.startTime,
              previousStartDate: i.startDate,
              startTime: undefined,
              timeBucket: project.timeBucket,
              isScheduled: true,
              startDate: selectedDateStr,
            };
            updatesMap.set(i.id, updates);
            return { ...i, ...updates } as Item;
          }));
        });

        updatesMap.forEach((updates, id) =>
          dbUpdateItem(id, 'task', updates).catch(console.error)
        );
      },

      moveTaskOutOfProjectBlock: (taskId) => {
        const moved = findItem(taskId, 'task');
        setNextActionLabel(`Move task out of project block: ${moved?.title || 'Unknown'}`);
        let taskUpdates: Partial<Task> | null = null;

        set((state) => {
          const task = state.items.find((i) => i.id === taskId && i.type === 'task') as TaskItem | undefined;
          if (!task) return state;
          taskUpdates = {
            inProjectBlock: false,
            startTime: task.previousStartTime,
            startDate: task.previousStartDate,
            previousStartTime: undefined,
            previousStartDate: undefined,
          };
          return projectItems(state.items.map((i) =>
            i.id === taskId && i.type === 'task' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, 'task', taskUpdates).catch(console.error);
      },

      addHabitGroup: (name, emoji, color) => {
        const normalized = name.toLowerCase();
        const alreadyExists = get().habitGroups.some((g) => g.name.toLowerCase() === normalized);
        if (alreadyExists) return;

        const group: HabitGroupType = { id: crypto.randomUUID(), name, emoji, color };
        set((state) => ({ habitGroups: [...state.habitGroups, group] }));

        const userId = get().userId;
        if (userId) dbCreateHabitGroup(userId, group).catch(console.error);
      },

      updateHabitGroup: (id, updates) => {
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
        }));

        const userId = get().userId;
        if (userId) dbUpdateHabitGroup(userId, id, updates).catch(console.error);
      },

      removeHabitGroup: (id) => {
        const group = get().habitGroups.find((g) => g.id === id);
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.id !== id),
          ...projectItems(state.items.map((i) =>
            i.type === 'habit' && i.group === group?.name
              ? { ...i, group: state.habitGroups.find(g => g.id !== id)?.name || 'Personal' }
              : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteHabitGroup(userId, id).catch(console.error);
      },

      getHabitGroupEmoji: (name) => {
        const normalized = name.toLowerCase();
        const group = get().habitGroups.find((g) => g.name.toLowerCase() === normalized);
        return group?.emoji || '';
      },

      getHabitGroupColor: (name) => {
        const normalized = name.toLowerCase();
        const group = get().habitGroups.find((g) => g.name.toLowerCase() === normalized);
        if (group?.color) return group.color;

        // Theme-aware tokens (app/globals.css). Stored group.color above passes
        // through untouched — the DB column is free text, incl. legacy raw oklch.
        const colorMap: Record<string, string> = {
          wellness: 'var(--habit-wellness)',
          work: 'var(--habit-work)',
          personal: 'var(--habit-personal)',
        };
        if (colorMap[normalized]) return colorMap[normalized];

        return accentColorForName(normalized);
      },

      cleanupOrphanedReferences: () => {
        const state = get();
        const projectNames = new Set(state.projects.map(p => p.name));
        const groupNames = new Set(state.habitGroups.map(g => g.name));

        set(projectItems(state.items.map((i) => {
          if (i.type === 'task' && i.project && !projectNames.has(i.project)) {
            return { ...i, project: undefined };
          }
          if (i.type === 'habit' && !groupNames.has(i.group)) {
            return { ...i, group: state.habitGroups[0]?.name || 'Personal' };
          }
          return i;
        })));
      },

      // Undo/Redo
      canUndo: false,
      canRedo: false,

      undo: () => {
        if (historyIndex <= 0) return;

        const currentState = get();
        const userId = currentState.userId;

        isUndoRedoAction = true;
        historyIndex--;
        const prevState = historyStack[historyIndex];

        if (!prevState) {
          historyIndex++;
          isUndoRedoAction = false;
          return;
        }

        applyHistoryState(prevState, currentState, {
          canUndo: historyIndex > 0,
          canRedo: true,
        }, userId, set);

        isUndoRedoAction = false;
      },

      redo: () => {
        if (historyIndex >= historyStack.length - 1) return;

        const currentState = get();
        const userId = currentState.userId;

        isUndoRedoAction = true;
        historyIndex++;
        const nextState = historyStack[historyIndex];

        if (!nextState) {
          historyIndex--;
          isUndoRedoAction = false;
          return;
        }

        applyHistoryState(nextState, currentState, {
          canUndo: true,
          canRedo: historyIndex < historyStack.length - 1,
        }, userId, set);

        isUndoRedoAction = false;
      },
      };
    },
    {
      name: 'planner-storage',
      partialize: (state) => ({
        compactMode: state.compactMode,
        viewMode: state.viewMode,
        chillMode: state.chillMode,
        groupBy: state.groupBy,
        showCurrentTimeIndicator: state.showCurrentTimeIndicator,
        timelineItemFilter: state.timelineItemFilter,
        showCompletedTasks: state.showCompletedTasks,
        showPausedOnGrid: state.showPausedOnGrid,
        defaultView: state.defaultView,
        defaultTimeBucket: state.defaultTimeBucket,
        animationsEnabled: state.animationsEnabled,
        weekStartDay: state.weekStartDay,
        timeFormat: state.timeFormat,
      }),
    }
  )
);

/**
 * Restore a history snapshot into the store and sync the delta to the DB.
 * One generic path for both kinds (the old per-kind version synced habit
 * edits only when status changed — undoing a habit title edit never
 * persisted); items missing from one side restore or soft-delete.
 */
function applyHistoryState(
  target: HistoryState,
  currentState: {
    items: Item[];
    projects: Project[];
    habitGroups: HabitGroupType[];
    routines: Routine[];
    programs: Program[];
  },
  flags: { canUndo: boolean; canRedo: boolean },
  userId: string | null,
  set: (partial: Partial<PlannerStore>) => void,
) {
  const restoredItems: Item[] = JSON.parse(JSON.stringify(target.items));
  const restoredProjects: Project[] = JSON.parse(JSON.stringify(target.projects));
  const restoredGroups: HabitGroupType[] = JSON.parse(JSON.stringify(target.habitGroups));
  // The `?? []` here is a tolerance for snapshots that predate a field, NOT a
  // licence to omit one from saveToHistory: an absent slice reads downstream as
  // "every row deleted" and syncContainers will faithfully soft-delete them all.
  // Every key of HistoryState must be snapshotted; this only softens the crash.
  const restoredRoutines: Routine[] = JSON.parse(JSON.stringify(target.routines ?? []));
  const restoredPrograms: Program[] = JSON.parse(JSON.stringify(target.programs ?? []));

  const info = getHistoryInfo();
  set({
    ...projectItems(restoredItems),
    projects: restoredProjects,
    habitGroups: restoredGroups,
    routines: restoredRoutines,
    programs: restoredPrograms,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    actionLog: info.actionLog,
    historyIndex: info.currentIndex,
  });

  updatePrevStateBaseline({
    items: restoredItems,
    projects: restoredProjects,
    habitGroups: restoredGroups,
    routines: restoredRoutines,
    programs: restoredPrograms,
  });

  if (!userId) return;

  const key = (i: Item) => `${i.type}:${i.id}`;
  // DB writes filter on the SLUG stored in items.type — the 'custom' envelope
  // discriminant matches zero rows and every write would silently no-op
  // (undoing a custom-item delete would "restore" it until the next reload).
  const dbType = (i: Item) => (i.type === 'custom' ? i.customType : i.type);
  const currentById = new Map(currentState.items.map((i) => [key(i), i]));
  const restoredById = new Map(restoredItems.map((i) => [key(i), i]));

  restoredItems.forEach((item) => {
    const cur = currentById.get(key(item));
    if (!cur) {
      dbRestoreItem(item.id, dbType(item)).catch(console.error);
      return;
    }
    const patch = diffItem(cur, item);
    // completedDates must never be written as an absolute array from a
    // snapshot — the live flow's set_item_completion RPC owns that column, and
    // a clobber here would race an in-flight completion. Replay the delta as
    // per-date intents instead (adjustStreak=false: the patch below restores
    // streak absolutely).
    if ('completedDates' in patch) {
      delete patch.completedDates;
      const curDates = new Set(cur.completedDates ?? []);
      const restoredDates = new Set(item.completedDates ?? []);
      restoredDates.forEach((d) => {
        if (!curDates.has(d)) dbSetItemCompletion(item.id, dbType(item), d, true, false).catch(console.error);
      });
      curDates.forEach((d) => {
        if (!restoredDates.has(d)) dbSetItemCompletion(item.id, dbType(item), d, false, false).catch(console.error);
      });
    }
    if (Object.keys(patch).length > 0) {
      dbUpdateItem(item.id, dbType(item), patch).catch(console.error);
    }
  });
  currentState.items.forEach((item) => {
    if (!restoredById.has(key(item))) dbDeleteItem(item.id, dbType(item)).catch(console.error);
  });

  // Containers diff by id, never by name — names are mutable, and a name-keyed
  // set-diff turns a rename undo into a bogus restore/delete pair (the delete
  // half would soft-delete the only copy of the row).
  syncContainers(
    currentState.projects, restoredProjects, PROJECT_FIELDS,
    (id) => dbRestoreProject(userId, id),
    (id, patch) => dbUpdateProject(userId, id, patch),
    (id) => dbDeleteProject(userId, id),
  );
  syncContainers(
    currentState.habitGroups, restoredGroups, HABIT_GROUP_FIELDS,
    (id) => dbRestoreHabitGroup(userId, id),
    (id, patch) => dbUpdateHabitGroup(userId, id, patch),
    (id) => dbDeleteHabitGroup(userId, id),
  );
  // Routines ride the same diff, but their update callback carries join-table
  // reconciliation: ROUTINE_FIELDS includes `itemIds`, so a membership undo
  // arrives here as an {itemIds} patch and dbUpdateRoutine turns it into
  // inserts/deletes. A column-mapper-style callback would drop it silently and
  // membership undo would never reach the DB.
  syncContainers(
    currentState.routines, restoredRoutines, ROUTINE_FIELDS,
    (id) => dbRestoreRoutine(userId, id),
    (id, patch) => dbUpdateRoutine(userId, id, patch),
    (id) => dbDeleteRoutine(userId, id),
  );
  // Programs carry TWO member arrays (itemIds and routineIds), both in
  // PROGRAM_FIELDS and both reconciled by dbUpdateProgram against their own
  // join table. Undoing "added Morning to Summer" therefore arrives here as a
  // {routineIds} patch and deletes exactly that one join row.
  syncContainers(
    currentState.programs, restoredPrograms, PROGRAM_FIELDS,
    (id) => dbRestoreProgram(userId, id),
    (id, patch) => dbUpdateProgram(userId, id, patch),
    (id) => dbDeleteProgram(userId, id),
  );
}

function syncContainers<T extends { id: string }>(
  current: T[],
  restored: T[],
  fields: readonly (keyof T & string)[],
  restore: (id: string) => Promise<void>,
  update: (id: string, patch: Partial<T>) => Promise<void>,
  remove: (id: string) => Promise<void>,
) {
  const currentById = new Map(current.map((c) => [c.id, c]));
  const restoredById = new Map(restored.map((c) => [c.id, c]));

  restored.forEach((r) => {
    const cur = currentById.get(r.id);
    if (!cur) {
      // The trashed row may have drifted from the snapshot (e.g. renamed
      // before deletion) — push the full restored shape after undeleting.
      restore(r.id).catch(console.error);
      const { id: _id, ...fullPatch } = r;
      update(r.id, fullPatch as Partial<T>).catch(console.error);
      return;
    }
    const patch: Partial<T> = {};
    for (const field of fields) {
      if (field === 'id') continue;
      if (JSON.stringify(cur[field]) !== JSON.stringify(r[field])) patch[field] = r[field];
    }
    if (Object.keys(patch).length > 0) update(r.id, patch).catch(console.error);
  });
  current.forEach((c) => {
    if (!restoredById.has(c.id)) remove(c.id).catch(console.error);
  });
}

// Subscribe to changes and save to history
let isUpdatingUndoRedo = false;
let hasInitializedHistory = false;

// Initialize prevStateJson eagerly with the store's initial state
// This captures the "before" state so we can properly undo the first action
const initialStoreState = usePlannerStore.getState();
let prevStateJson: string | null = JSON.stringify({
  items: initialStoreState.items,
  projects: initialStoreState.projects,
  habitGroups: initialStoreState.habitGroups,
  routines: initialStoreState.routines,
  programs: initialStoreState.programs,
});

// Function to update baseline from undo/redo actions
const updatePrevStateBaseline = (state: HistoryState) => {
  prevStateJson = JSON.stringify(state);
};

usePlannerStore.subscribe((state) => {
  if (isUndoRedoAction || isUpdatingUndoRedo) return;

  const currentState = {
    items: state.items,
    projects: state.projects,
    habitGroups: state.habitGroups,
    routines: state.routines,
    programs: state.programs,
  };

  const currentStateJson = JSON.stringify(currentState);

  // Initialize history with baseline state if not already done
  // This handles the case when no user is logged in (initializeStore not called)
  if (!hasInitializedHistory && historyStack.length === 0) {
    hasInitializedHistory = true;
    // Save the PREVIOUS state as baseline (captured before this change)
    const baselineState = prevStateJson ? JSON.parse(prevStateJson) : currentState;
    historyStack.push(JSON.parse(JSON.stringify(baselineState)));
    actionLog.push({
      id: crypto.randomUUID(),
      label: 'Session start',
      timestamp: Date.now(),
    });
    historyIndex = 0;
  }

  // Only save if data actually changed (not just view state)
  if (currentStateJson !== prevStateJson) {
    saveToHistory(currentState);
    // Update canUndo/canRedo and actionLog after saving (prevent recursive trigger)
    isUpdatingUndoRedo = true;
    const info = getHistoryInfo();
    usePlannerStore.setState({
      canUndo: historyIndex > 0,
      canRedo: false,
      actionLog: info.actionLog,
      historyIndex: info.currentIndex,
    });
    isUpdatingUndoRedo = false;
  }

  prevStateJson = currentStateJson;
});
