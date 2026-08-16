'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// The store's one UI import, and it earns it: a swallowed write failure is the
// exact bug undoFailedCreate exists to fix, so the net has to be able to speak.
// planner-store is 'use client' and no server route imports it, and <Toaster>
// is mounted in the root layout.
import { toast } from 'sonner';
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
  renameContainerMembers as dbRenameContainerMembers,
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
  itemDbType,
  adoptContainerMembers,
  type TrashEntry,
} from './db';
import type { CommitResult, SeedPlan } from './seed-containers';
import { ITEM_TYPES, getItemTypeConfig, itemTypeName, isSkippable, isPausable, isCollectible, hydrateCustomTypes } from './item-registry';
import {
  isPausedOn,
  isProgramActiveOn,
  inactiveItemIdsOn,
  resolvePauseWrite,
  suppressionReason,
  suppressionLabel,
} from './active';
import { programStateForSwitch } from './scope-rail';
import { recordReleased } from './sweep-grace';
import { PROJECT_FIELDS, HABIT_GROUP_FIELDS, ROUTINE_FIELDS, PROGRAM_FIELDS } from '@anchor-app/types';
import { saveSettings } from './settings-service';
import { isRecurring, isCompletedOnDate, toDateStr } from './recurrence';
import { accentColorForName } from './accent-colors';
import { foldContainerName, sameContainerName } from './container-registry';

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
  /**
   * Batched unscheduleTask — one set(), one history entry, one undo.
   *
   * `opts.label` overrides the history entry's text, which is also what decides
   * whether the undo toast fires (hooks/use-undo-toast.ts matches on prefix).
   * Only the auto-age sweep passes it, and only to stand the toast down; see
   * the note at the implementation.
   */
  unscheduleTasks: (ids: string[], opts?: { label?: string }) => void;
  /**
   * Put scheduling fields back on specific rows — the forward-facing inverse of
   * `unscheduleTasks`, addressed at ids rather than at the top of the history
   * stack.
   *
   * This exists because "undo" and "put those back" stop being the same thing
   * within seconds. An undo toast can pop the stack safely because it lives for
   * five seconds and nothing else has happened yet. A receipt that persists —
   * the dock's line for the overnight sweep — cannot: by the time it is read,
   * the sweep is buried under everything the user has done since, and a pop
   * would reverse the wrong action entirely. Restoring recorded field values is
   * the same outcome, still one set() and so still itself undoable, but correct
   * no matter how long the offer sat there.
   */
  restoreScheduling: (
    entries: readonly {
      id: string;
      isScheduled: boolean;
      startDate?: string;
      timeBucket?: string;
      startTime?: string;
    }[]
  ) => void;
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
  /** First-run starter containers. See seedStarterContainers for the guards. */
  seedStarterContainers: (plan: SeedPlan, forUserId: string) => CommitResult;
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
  /**
   * Pause/resume a routine. Same today-resolved, dateless semantics as items.
   *
   * `until` distinguishes three things and the difference is load-bearing:
   * `undefined` is "not specified" (what the bare toggles pass, and what keeps
   * them idempotent), `null` is "clear the resume date", and a string is "come
   * back on this day". Resolved through active.ts's resolvePauseWrite.
   */
  setRoutinePaused: (id: string, paused: boolean, until?: string | null) => void;

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

  /**
   * Put one row of the Trash back (Organize console, Phase 4).
   *
   * One action for all five kinds rather than five, because the hard parts are
   * identical and are all about HISTORY: decision 3 says a restore is a normal
   * entry and ⌘Z re-deletes it, and that only holds if the label is armed
   * before the single set() that carries every slice being touched. See the
   * implementation for the two traps.
   *
   * Takes the whole TrashEntry, not an id: the bin lives in a local hook and
   * never enters the store, so this is the only way the entity reaches it.
   */
  restoreFromTrash: (entry: TrashEntry) => void;
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

/**
 * A container NAME write implies an ID write (migration 027).
 *
 * Every surface that files an item still speaks in names — the item dialog's
 * chips, the agent API, the braindump — and converting those ~15 call sites is
 * explicitly out of scope. So the resolution happens once, here, at the moment
 * a name is written: the name stays authoritative for display, and the id it
 * resolves to is what survives the container being renamed.
 *
 * Returning `undefined` for an unmatched name is correct, not a fallback. Some
 * items name a container that has no row at all — 12 of them on the live
 * database name a project called "Housework" — and inventing a link for those
 * would file them under whatever container is created with that name next.
 */
const projectIdFor = (name: string | undefined, projects: Project[]) =>
  name ? projects.find((p) => p.name === name)?.id : undefined;

/**
 * The habit-group twin, with the case-insensitive fallback the group surfaces
 * already use — getHabitGroupEmoji and getHabitGroupColor both normalise, and
 * addHabitGroup de-dupes case-insensitively, so an exact-only match here would
 * strand a habit that says "personal" against a group row named "Personal".
 */
const groupIdFor = (name: string | undefined, groups: HabitGroupType[]) =>
  name
    ? (
        groups.find((g) => g.name === name) ??
        groups.find((g) => g.name.toLowerCase() === name.toLowerCase())
      )?.id
    : undefined;

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

/**
 * What a restored row is CALLED in its history entry.
 *
 * The bin is the one list in the app that mixes kinds, so "Restore: Morning" is
 * ambiguous in a way no other label is — and this string is what the user reads
 * in the history popover when deciding what ⌘Z is about to take back.
 */
const TRASH_NOUNS: Record<TrashEntry['kind'], string> = {
  item: 'item',
  project: 'project',
  group: 'habit group',
  routine: 'routine',
  program: 'program',
};

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

/** The entry `saveToHistory` just wrote, so a failed write can take it back. */
const lastHistoryEntryId = (): string | null =>
  actionLog.length > 0 ? actionLog[actionLog.length - 1].id : null;

/**
 * Take an optimistic container back out when the database refused it.
 *
 * WHY THIS EXISTS AT ALL. `projects_user_id_name_key` and
 * `habit_groups_user_id_name_key` are PLAIN unique indexes over
 * `(user_id, name)` — no `WHERE deleted_at IS NULL` — so a soft-deleted
 * container reserves its name for the full 30 days while being invisible to
 * this store, whose arrays come from `deleted_at`-filtered fetches. The
 * `alreadyExists` guards above therefore cannot see the row that is about to
 * reject the insert, and the insert used to fail into a bare
 * `.catch(console.error)` AFTER the optimistic `set()` had landed.
 *
 * What that left behind is worse than a missing container. Every later edit to
 * it is an `.eq('id', …)` matching zero rows, so it accepts a glyph, a colour
 * and a whole time block and keeps none of them — and because
 * `items_project_id_fkey` is a COMPOSITE foreign key, any item filed into it
 * has its own INSERT rejected with 23503 in full. The item dialog's inline
 * "new project" is the sharp end: type the name of a project you deleted last
 * week, save, and you lose the project AND the task you were writing, with the
 * only evidence a console line nobody will read.
 *
 * Healing it HERE rather than at the call sites is the point. The console's
 * create rows consult the bin and refuse with a sentence (see
 * use-trashed-names.ts) — that is the good path, and this is the net under it,
 * covering the item dialog, the command palette, and anything added later,
 * without the async lookup a synchronous action cannot await.
 *
 * The rollback leaves no trace in history: it is not a user action, so it
 * pushes no entry of its own (a bare `set()` here would be a labelless mutation
 * landing as "Unknown action"), and the failed create's own entry is stripped
 * of the phantom and relabelled — see forgetFailedContainer.
 *
 * WHAT IT CANNOT DO. If the user's Save wins the race — the item's INSERT goes
 * out before the container's rejection comes back — that item is already lost
 * to 23503 and nothing here retrieves it. Clearing the reference stops the NEXT
 * save carrying it; the one already in flight is why the proactive refusals in
 * the console and the item dialog matter, and why this is the net rather than
 * the plan.
 */
/**
 * Container ids that were seated optimistically and then refused.
 *
 * Published because the rollback is INDISTINGUISHABLE from a delete to anything
 * watching this store: both are "a container that was in `projects` and now is
 * not". `useTrashedNames` watches exactly that, to catch the name of a container
 * binned mid-visit — and so it caught the phantom too, and spent the rest of the
 * session refusing a name that nothing anywhere holds. The user's one useful
 * response to "Nothing was saved" is to try again; that was the response it
 * locked out.
 *
 * A uuid per failed create, never cleared. Both are deliberate: ids are uuids so
 * a stale entry cannot collide with a real container even across an account
 * switch, and a session with enough refused creates for the set to matter has a
 * much larger problem than its memory.
 */
const neverCreated = new Set<string>();

/** True for a container this store seated and the database then rejected. */
export const wasNeverCreated = (id: string): boolean => neverCreated.has(id);

/**
 * Take a refused container back out of the store and out of history.
 *
 * Extracted so first-run seeding gets the SAME rollback a hand-made create gets.
 * Its inserts can be refused for a reason no fault is needed to reach: two tabs
 * opening a first run both read the seeding latch as false, both plan the same
 * names, and the second one's insert meets `projects_user_id_name_key`. Left
 * behind, that tab holds six containers that do not exist — and because
 * `items_project_id_fkey` is composite, the first item filed into one has its
 * own INSERT rejected in full.
 *
 * Everything careful here was paid for twice (see the fix-commit table in
 * memory/plans/organize-console.md); duplicating it for the seed path would have
 * been the third time.
 */
const removeRefusedContainer = (
  kind: 'project' | 'group',
  id: string,
  entryId: string | null,
  label: string,
) => {
  // BEFORE the setState below, not after. The history subscriber and
  // useTrashedNames' both run synchronously inside set(), so a watcher that
  // asks "was this real?" while reacting to the removal has to be able to get
  // the right answer already.
  neverCreated.add(id);

  // SAVED AND RESTORED, never a hard `false`. `isUpdatingUndoRedo` is a plain
  // boolean rather than a counter, and `initializeStore` holds it true across
  // its ENTIRE fetch while `userId` is already stamped — so a create rejecting
  // inside the load window used to hand the flag back unblocked. The republish
  // below then woke the subscriber's lazy-baseline branch mid-load, seeding a
  // second 'Session start' and leaving `historyIndex` naming a snapshot the
  // store did not hold. One ⌘Z after that soft-deleted every row the load had
  // just brought in — verified by an A/B probe whose only variable was whether
  // the create resolved.
  const wasSuppressed = isUpdatingUndoRedo;
  isUpdatingUndoRedo = true;
  try {
    usePlannerStore.setState((state) => {
      if (kind === 'project') {
        return {
          projects: state.projects.filter((p) => p.id !== id),
          // Items filed into it in the meantime lose the reference too, or the
          // next save re-sends an id no row will ever match.
          ...projectItems(
            state.items.map((item) =>
              item.type !== 'habit' && item.projectId === id
                ? { ...item, project: undefined, projectId: undefined }
                : item
            )
          ),
        };
      }
      return {
        habitGroups: state.habitGroups.filter((g) => g.id !== id),
        ...projectItems(
          state.items.map((item) =>
            item.type === 'habit' && item.groupId === id
              ? { ...item, group: '', groupId: undefined }
              : item
          )
        ),
      };
    });
    forgetFailedContainer(kind, id, entryId, label);
    // The baseline has to follow the rollback, or the next real change is
    // diffed against a snapshot that still holds the phantom.
    const s = usePlannerStore.getState();
    updatePrevStateBaseline({
      items: s.items,
      projects: s.projects,
      habitGroups: s.habitGroups,
      routines: s.routines,
      programs: s.programs,
    });
  } finally {
    isUpdatingUndoRedo = wasSuppressed;
  }

  // Republish the action log so the relabelled entry reaches the popover. Only
  // when nothing else is mid-write: inside initializeStore's window this would
  // publish half-loaded history over the top of the load.
  //
  // BOTH THIS GUARD AND THE SAVE/RESTORE ABOVE ARE KEPT, and each alone is
  // enough to stop the load-window corruption — verified by probing them
  // separately. Neither is dead code: this one keeps the rollback from
  // publishing over a load in progress, the other keeps the suppression flag
  // honest for every other reader of it. The consequence of getting it wrong is
  // one ⌘Z soft-deleting everything the load brought in, which is worth two
  // cheap defences rather than one clever one.
  if (!wasSuppressed) {
    const info = getHistoryInfo();
    usePlannerStore.setState({
      canUndo: historyIndex > 0,
      canRedo: historyIndex < historyStack.length - 1,
      actionLog: info.actionLog,
      historyIndex: info.currentIndex,
    });
  }
};

/**
 * A seed container the database refused.
 *
 * Same rollback, and deliberately SILENT. `undoFailedCreate` says it out loud
 * because a hand-made create is something the user just did and is watching for;
 * this one is a starter set they never asked for, and "Couldn't create Work"
 * would be the first thing a brand-new account ever said to its owner. Nothing
 * is lost by the silence: the row simply is not there, which is the state the
 * account was in a second earlier.
 *
 * `null` for the entry id because the seed pushes no history entry at all —
 * there is nothing to relabel, and `forgetFailedContainer` still strips the id
 * from every snapshot, which is the half that matters.
 */
const rollbackSeedContainer = (
  error: unknown,
  kind: 'project' | 'group',
  id: string,
  name: string,
) => {
  console.error(`seed ${kind} failed`, name, error);
  removeRefusedContainer(kind, id, null, '');
};

const undoFailedCreate = (
  error: unknown,
  entryId: string | null,
  kind: 'project' | 'group',
  id: string,
  name: string,
) => {
  const noun = kind === 'project' ? 'project' : 'habit group';
  console.error(`create ${noun} failed`, error);

  removeRefusedContainer(kind, id, entryId, `Couldn’t add ${noun}: ${name}`);

  // SAID OUT LOUD. Every other way this can go wrong is silent, which is how it
  // survived: the container looks created for the rest of the session. 23505 is
  // the only error this insert can realistically raise, and the trash is the
  // only place the name can be hiding, so the sentence can be specific.
  toast.error(
    isUniqueViolation(error)
      ? `Couldn't create “${name}” — a deleted ${noun} still has that name. Restore or empty it from Organize → Trash.`
      : `Couldn't create “${name}”. Nothing was saved.`
  );
};

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === '23505' || (error instanceof Error && error.message.includes('duplicate key value'));
};

/**
 * Erase a container the database never accepted from the whole undo history.
 *
 * REWRITES THE SNAPSHOTS; TOUCHES NO INDEX. The first version of this popped
 * the failed create's entry off the stack and decremented `historyIndex`, which
 * is only safe when that entry is still the top AND the user has not moved —
 * and the guards it needed for that handed every other case straight back to
 * the bug. Review reproduced both halves: with the user having acted during the
 * round trip (which the item dialog's own Save flow guarantees), the store lost
 * the phantom while every snapshot kept it, so ONE ⌘Z put it back and fired
 * `dbRestoreProject` against a row that never existed.
 *
 * Stripping the id from every snapshot instead has no such precondition. The
 * stack length, the log length and `historyIndex` are all untouched, so the
 * invariant that `historyIndex` names the state the store holds cannot be
 * broken by this function at all — whatever the user did meanwhile, whether two
 * creates are in flight at once, and regardless of MAX_HISTORY_SIZE having
 * shifted entries off the front.
 *
 * Members go with it. An item filed into the phantom before the rejection
 * landed still names it in older snapshots, and undoing into one of those would
 * re-file the item against a container that does not exist.
 */
const forgetFailedContainer = (
  kind: 'project' | 'group',
  id: string,
  entryId: string | null,
  label: string,
) => {
  for (const snapshot of historyStack) {
    if (kind === 'project') {
      snapshot.projects = snapshot.projects.filter((p) => p.id !== id);
      snapshot.items = snapshot.items.map((item) =>
        item.type !== 'habit' && item.projectId === id
          ? { ...item, project: undefined, projectId: undefined }
          : item
      );
    } else {
      snapshot.habitGroups = snapshot.habitGroups.filter((g) => g.id !== id);
      snapshot.items = snapshot.items.map((item) =>
        item.type === 'habit' && item.groupId === id
          ? { ...item, group: '', groupId: undefined }
          : item
      );
    }
  }

  // The entry STAYS — removing it is what forced the index arithmetic — but it
  // stops claiming something happened. Its snapshot now matches its
  // predecessor, so undoing across it is a no-op rather than a resurrection.
  const entry = entryId ? actionLog.find((a) => a.id === entryId) : undefined;
  if (entry) entry.label = label;
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

        // Delegated to resolvePauseWrite rather than hand-built here, which is
        // both a simplification and a BUG FIX. This action used to open with
        //
        //     if (isPausedOn(routine, todayStr, tz) === paused) return;
        //
        // — an idempotence guard that also swallowed the one request it should
        // have honoured: a new resume date on a pause that is already running.
        // Since a resume date can only be chosen while something is paused,
        // `pausedUntil` was unreachable from the UI entirely; the third
        // parameter has been on this signature, unwritable, since it landed.
        //
        // resolvePauseWrite (lib/active.ts) is the one definition of what the
        // pause VERB means in terms of columns, and already states this case:
        // "Already paused: honour a new resume date, but leave pausedAt where it
        // is" — never restamping the lower bound, which would drag it forward
        // and un-hide the days between. Every previously-supported call resolves
        // identically: a two-argument toggle still writes nothing when the
        // routine is already in the requested state, and a manual resume still
        // normalizes to `pausedUntil = todayStr` rather than clearing the pair,
        // so the interval survives on the row for the sweep's grace.
        //
        // `until` is `string | null | undefined`, and the three are distinct:
        // undefined = "not specified" (the toggles), null = "clear the date",
        // a string = "come back then".
        const write = resolvePauseWrite(
          routine,
          { paused, pausedUntil: until },
          todayStr,
          new Date().toISOString(),
          tz
        );
        // A `reason` is a request the resolver refused (a resume date already in
        // the past). The UI cannot produce one — the picker disables today and
        // everything before it — so there is nothing to report here.
        if (!('patch' in write)) return;
        const updates = write.patch as Partial<Routine>;
        if (Object.keys(updates).length === 0) return;

        // Writes directly rather than delegating to updateRoutine: that action
        // stamps its own "Edit routine" label, and the history subscriber fires
        // synchronously on its set(), so a label applied afterwards would land
        // on whatever the user does NEXT.
        //
        // A pausedUntil-only write is neither a pause nor a resume — it moves
        // the end of one already running — and gets its own label so undo can
        // name it.
        const verb = !('pausedAt' in updates) && paused ? 'Resume date' : paused ? 'Pause' : 'Resume';
        setNextActionLabel(`${verb} routine: ${routine.name}`);
        set({ routines: get().routines.map((r) => (r.id === id ? { ...r, ...updates } : r)) });
        const userId = get().userId;
        // dbUpdateRoutine keys on `'pausedUntil' in updates` (lib/db.ts:958), so
        // an explicit-undefined value still writes paused_until = null.
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
        // Only write a program that is not ALREADY where the swap wants it. An
        // `auto` program inside its own date range is already carrying its
        // members, and stamping 'active' would silently convert a self-managing
        // program into one the user must remember to turn off.
        //
        // The state written comes from `programStateForSwitch` — the same rule
        // the scope rail and the palette use — rather than a literal
        // 'active'/'paused'. Writing the literal is only half right: it can
        // never hand a program back to `auto`, so swapping away from a summer
        // and back again loses the Aug 31 end it was following.
        if (!isProgramActiveOn(target, todayStr)) {
          patches.set(id, { state: programStateForSwitch(target, true, todayStr) });
        }
        for (const program of get().programs) {
          if (program.id === id) continue;
          if (isProgramActiveOn(program, todayStr)) {
            patches.set(program.id, { state: programStateForSwitch(program, false, todayStr) });
          }
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
          projectId: projectIdFor(itemData.project, get().projects),
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
          projectId: projectIdFor(taskData.project, get().projects),
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
        // Re-file: the id follows the name, INCLUDING to undefined. Key
        // presence is the test, not truthiness — clearing `project` is how
        // unfiling is expressed, and leaving a stale id behind would let a
        // later rename of the old container pull the name back onto an item
        // the user had already taken out of it.
        if ('project' in updates) {
          newUpdates.projectId = projectIdFor(updates.project, get().projects);
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
      unscheduleTasks: (ids, opts) => {
        const idSet = new Set(ids);
        const targets = get().items.filter((i) => i.type !== 'habit' && idSet.has(i.id));
        if (targets.length === 0) return;
        // The prefix must stay exactly 'Unschedule task:' — that is the string in
        // hooks/use-undo-toast.ts SIGNIFICANT_ACTIONS. A plural 'Unschedule tasks:'
        // would NOT match its startsWith() test and the undo toast would never fire.
        //
        // ONE caller overrides it, and does so precisely to opt OUT of that
        // toast: the auto-age sweep (hooks/use-overdue-sweep.ts). A five-second
        // toast is a confirmation of something YOU just did; the sweep runs
        // unattended, often before the tab was open, so the toast was never a
        // receipt for it — it fired at whatever moment the app happened to
        // load. Its receipt is a dock line that persists instead. The history
        // entry is unaffected either way, so ⌘Z still reverses the sweep; only
        // the toast stands down.
        setNextActionLabel(
          opts?.label ??
            (targets.length === 1
              ? `Unschedule task: ${targets[0].title}`
              : `Unschedule task: ${targets.length} items`),
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

      restoreScheduling: (entries) => {
        // Rows the user has since deleted are silently skipped rather than
        // resurrected: a receipt can be hours old, and "put them back" must
        // never mean "and undelete the two you threw away in between".
        const byId = new Map(entries.map((e) => [e.id, e]));
        const targets = get().items.filter((i) => i.type !== 'habit' && byId.has(i.id));
        if (targets.length === 0) return;

        // 'Schedule task:' is a SIGNIFICANT_ACTIONS prefix, so this one DOES
        // raise the undo toast — unlike the sweep it reverses. This is a thing
        // the user just did, at a moment they were looking at the screen, which
        // is exactly the case a five-second toast is for.
        setNextActionLabel(
          targets.length === 1
            ? `Schedule task: ${targets[0].title}`
            : `Schedule task: ${targets.length} items`,
        );

        const updatesFor = (id: string): Partial<Task> => {
          const e = byId.get(id)!;
          return {
            isScheduled: e.isScheduled,
            startDate: e.startDate,
            timeBucket: e.timeBucket as Task['timeBucket'],
            startTime: e.startTime,
          };
        };

        // One set() => one history entry => one undo (see moveTasksToDate).
        set((state) => projectItems(state.items.map((i) => (
          i.type !== 'habit' && byId.has(i.id) ? ({ ...i, ...updatesFor(i.id) } as Item) : i
        ))));

        targets.forEach((item) =>
          dbUpdateItem(item.id, dbTypeOf(item), updatesFor(item.id)).catch(console.error),
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
          groupId: groupIdFor(habitData.group, get().habitGroups),
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
        // See updateTask — the id follows the name on every re-file.
        if ('group' in updates) {
          newUpdates.groupId = groupIdFor(updates.group, get().habitGroups);
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
        // The label goes AFTER the guard. Armed before it, a no-op create
        // leaves `Add project: Foo` pending on a module-level variable and the
        // user's next unlabelled mutation is logged and undone under that name.
        const alreadyExists = get().projects.some((p) => sameContainerName('project', p.name, name));
        if (alreadyExists) return;
        setNextActionLabel(`Add project: ${name}`);

        const project: Project = { id: crypto.randomUUID(), name, emoji };
        set((state) => ({ projects: [...state.projects, project] }));
        const entryId = lastHistoryEntryId();

        const userId = get().userId;
        if (userId) {
          dbCreateProject(userId, project).catch((error) => {
            undoFailedCreate(error, entryId, 'project', project.id, name);
          });
        }
      },

      /**
       * The first-run starter set, and the repair that shares its shape.
       *
       * ONE `set()` AND ONE HISTORY ENTRY, not six. Six `addProject` calls would
       * work and would be wrong: the history popover would open on a brand-new
       * account already listing six actions the user did not perform, and their
       * first ⌘Z would delete one starter container while leaving five. This is
       * a single arrival, so it undoes as one.
       *
       * GUARDS, ALL THREE. `userId` because a create without one writes nothing
       * and leaves an optimistic row that vanishes on reload. `isLoading`
       * because `initializeStore` REPLACES `projects`, `habitGroups` and `items`
       * wholesale when its fetch resolves — anything seeded inside that window
       * is silently discarded, which is the same trap `canCreate` guards in the
       * console and the one the e2e suite found the hard way. And the container
       * arrays being empty, re-checked HERE rather than trusted from the plan:
       * the plan was computed before two awaits (the latch read and the bin
       * read), and a fetch resolving in between is exactly how an account with
       * containers gets a second set of them.
       *
       * ADOPTION IS PART OF THE SAME `set()`. When a container is created for a
       * name its items already carry, those items get the new id in the same
       * commit — otherwise the store holds members whose `groupId` is undefined
       * while the database has just linked them, and the next edit writes the
       * stale shape back.
       */
      seedStarterContainers: (plan, forUserId) => {
        const state = get();
        const userId = state.userId;
        // THE OWNER CHECK, and it is not redundant with the caller's. The plan
        // is computed across two more awaits after the caller looked, and
        // Supabase delivers a bare SIGNED_IN for a different user with no
        // intervening SIGNED_OUT — the provider handles that case in two other
        // places. Without this, one account's plan was committed into another
        // account's store, and with adoption in the mix that meant creating a
        // container named after someone else's data.
        if (!userId || userId !== forUserId || state.isLoading) return 'refused';
        if (state.projects.length > 0 || state.habitGroups.length > 0) return 'refused';
        // Distinguished from a refusal on purpose: this is a stable answer, and
        // the caller latches on it so the account stops being asked. A refusal
        // is "ask again next load".
        if (plan.projects.length === 0 && plan.groups.length === 0) return 'nothing-to-do';

        const projects: Project[] = plan.projects.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          emoji: p.emoji,
        }));
        const groups: HabitGroupType[] = plan.groups.map((g) => ({
          id: crypto.randomUUID(),
          name: g.name,
          emoji: g.emoji,
        }));

        const projectByName = new Map(projects.map((p) => [p.name, p]));
        const groupByName = new Map(groups.map((g) => [g.name, g]));

        /**
         * NO HISTORY ENTRY, and this is a change of mind the review earned.
         *
         * The plan asked for the seed to be "undoable like anything else", and
         * the first version obliged with one entry. Two consequences neither of
         * us had costed: a brand-new account arrives with `canUndo: true` and a
         * logged action its owner did not perform, and pressing ⌘Z — the very
         * first thing many people try — SOFT-DELETES all six rows, which puts
         * six containers the user never made into a Trash they have never opened
         * and reserves all six names for thirty days, because the unique indexes
         * have no `WHERE deleted_at IS NULL`.
         *
         * Decision 2 asks for "fully deletable", and they are: every one goes
         * through the console's ordinary delete. It does not ask for undoable,
         * and a seed is not a user action — the same reasoning `undoFailedCreate`
         * already applies to itself two hundred lines up.
         *
         * Suppressed the way the rollback suppresses: save and restore the flag
         * rather than clearing it, because `initializeStore` holds it true
         * across its whole fetch and a hard `false` here would hand it back
         * unblocked mid-load.
         */
        const wasSuppressed = isUpdatingUndoRedo;
        isUpdatingUndoRedo = true;
        try {
          set((s) => ({
            projects: [...s.projects, ...projects],
            habitGroups: [...s.habitGroups, ...groups],
            ...projectItems(
              s.items.map((item) => {
                // Matched on the EXACT stored text, never a trimmed copy. The
                // adopting UPDATE filters on the name it is given, so a store
                // that links " Personal" while the database matches "Personal"
                // produces a link that looks right until the next reload drops
                // it. planSeed keeps names exact for the same reason.
                if (item.type === 'habit') {
                  const g = item.group ? groupByName.get(item.group) : undefined;
                  return g && !item.groupId ? { ...item, groupId: g.id } : item;
                }
                const p = item.project ? projectByName.get(item.project) : undefined;
                return p && !item.projectId ? { ...item, projectId: p.id } : item;
              })
            ),
          }));
          /**
           * BOTH BASELINES, and the second one is not optional — the first
           * version updated only `prevStateJson` and undo walked straight past
           * the seed.
           *
           * `updatePrevStateBaseline` sets what the NEXT change is diffed
           * against. But history is a stack of whole snapshots, and the one at
           * `historyIndex` is still 'Session start' from before the seed. The
           * user's first real edit pushes a snapshot on top of that, so one ⌘Z
           * lands on the pre-seed state and takes the containers with it — the
           * suppression having made sure there was no entry in between to stop
           * at.
           *
           * Rewriting that snapshot in place is the honest fix rather than a
           * patch: the seed is part of what this session STARTED with, which is
           * exactly what 'Session start' is supposed to name. Length and index
           * are untouched, so it cannot break the invariant that `historyIndex`
           * names the state the store holds.
           */
          const s = get();
          const seeded = {
            items: s.items,
            projects: s.projects,
            habitGroups: s.habitGroups,
            routines: s.routines,
            programs: s.programs,
          };
          updatePrevStateBaseline(seeded);
          if (historyStack[historyIndex]) {
            historyStack[historyIndex] = JSON.parse(JSON.stringify(seeded));
          }
        } finally {
          isUpdatingUndoRedo = wasSuppressed;
        }

        // Sequential per container: the adopt UPDATE must not go out before the
        // INSERT it depends on, or `items_project_id_fkey` rejects it — the
        // composite key means a bad id takes the whole statement down.
        //
        // A REFUSED INSERT IS ROLLED BACK, exactly as a hand-made one is. Two
        // tabs opening a first run both read the latch as false and both plan
        // the same names; the second one's insert hits the unique index, and
        // without this the tab keeps six containers that do not exist — and the
        // first item filed into one is rejected by the composite FK and lost.
        for (const project of projects) {
          dbCreateProject(userId, project)
            .then(() => adoptContainerMembers(userId, 'project_id', project.id, project.name))
            .catch((error) => rollbackSeedContainer(error, 'project', project.id, project.name));
        }
        for (const group of groups) {
          dbCreateHabitGroup(userId, group)
            .then(() => adoptContainerMembers(userId, 'group_id', group.id, group.name))
            .catch((error) => rollbackSeedContainer(error, 'group', group.id, group.name));
        }

        return 'committed';
      },

      updateProject: (id, updates) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Edit project: ${project?.name || 'Unknown'}`);
        // THE RENAME FAN-OUT (migration 027). Members hold the name for display
        // and the id for identity; renaming has to move the name on every one of
        // them or the container silently empties. Keyed on projectId, so a
        // member whose text drifted still follows and a same-named stranger does
        // not. Guarded on the name actually changing — an emoji or colour edit
        // arrives through this same action.
        const renamedTo =
          updates.name !== undefined && project && updates.name !== project.name
            ? updates.name
            : null;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          ...(renamedTo
            ? projectItems(
                state.items.map((i) =>
                  i.type !== 'habit' && i.projectId === id
                    ? { ...i, project: renamedTo }
                    : i
                )
              )
            : {}),
        }));

        const userId = get().userId;
        if (userId) {
          // CHAINED, not fired side by side, and this is the safety net under
          // `takenBy`. That guard can only see LIVE projects — the store never
          // loads soft-deleted ones — while projects_user_id_name_key is a
          // plain unique index that spans them. So renaming onto a TRASHED
          // project's name passes the guard, and the two writes do not fail
          // together: the container UPDATE raises 23505 while the member
          // fan-out touches no unique index and succeeds. The container would
          // keep its old name while every member claimed the new one.
          //
          // Sequencing them turns that corruption into an ordinary optimistic
          // update that reverts on reload, which is the failure mode every
          // other write in this store already has. A better message needs the
          // trashed names, which arrive with the Trash in Phase 4.
          const write = dbUpdateProject(userId, id, updates);
          (renamedTo
            ? write.then(() => {
                // A ROUND TRIP HAS PASSED, so re-check before firing. Chaining
                // fixed the split write but moved this dispatch AFTER undo's:
                // undo restores the old name with plain per-item writes and no
                // fan-out of its own, so a ⌘Z landing inside this window used to
                // be overwritten here — the container reverted while every
                // member kept the name the user had just undone, and unlike an
                // ordinary optimistic write that state survives a reload.
                if (get().projects.find((p) => p.id === id)?.name !== renamedTo) return;
                return dbRenameContainerMembers(userId, 'project_id', id, renamedTo);
              })
            : write
          ).catch(console.error);
        }
      },

      removeProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        setNextActionLabel(`Delete project: ${project?.name || 'Unknown'}`);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          ...projectItems(state.items.map((i) =>
            // Custom types hold projects too, so this has to reach them: it is
            // the ONLY live repair. cleanupOrphanedReferences below looks like
            // a safety net and is not — it has no callers anywhere in the app.
            //
            // In-session only, and that is pre-existing and symmetric with
            // removeHabitGroup: dbDeleteProject stamps projects.deleted_at and
            // items.project is plain text with no FK and no trigger, so a
            // reload re-reads the dead name. Name-referenced containers are the
            // documented parked limitation (migration 024).
            // Both halves, or the store contradicts itself: an item reading
            // unfiled while still carrying the id would follow the container's
            // next rename straight back into a project it had left.
            //
            // The DB row keeps BOTH on purpose — deleteProject only stamps
            // deleted_at, so the link survives for a Trash restore to reconnect
            // (Phase 4). That in-session/persisted asymmetry is pre-existing and
            // unchanged here; 027 makes fixing it possible, it does not fix it.
            //
            // `project &&` guards the whole disjunction, not just the name half:
            // an id that is not in the store leaves `project` undefined, and
            // `i.projectId === project?.id` then reads `undefined === undefined`
            // and unfiles every item that never had an id — which is all of them
            // before 027's backfill reaches an account.
            i.type !== 'habit' &&
            project &&
            (i.projectId === project.id ||
              (i.project && sameContainerName('project', i.project, project.name)))
              ? { ...i, project: undefined, projectId: undefined }
              : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteProject(userId, id).catch(console.error);
      },

      // These three, and every identity lookup below, ask the container registry
      // whether this kind folds rather than spelling a comparison. Projects do
      // not fold, so they are `===` in effect — written this way so the policy
      // has one home and the two kinds read the same, not two idioms whose
      // difference you have to already know about.
      getProjectEmoji: (name) => {
        const project = get().projects.find((p) => sameContainerName('project', p.name, name));
        return project?.emoji || '';
      },

      // Stored color wins (same precedence as getHabitGroupColor); the
      // name-hash ramp remains the no-choice default, so nothing changes for
      // projects that never picked one.
      getProjectColor: (name) => {
        const project = get().projects.find((p) => sameContainerName('project', p.name, name));
        return project?.color || accentColorForName(foldContainerName('project', name));
      },

      getProject: (name) => {
        return get().projects.find((p) => sameContainerName('project', p.name, name));
      },

      // TASK-LIKE, not 'task'. These three used findItem(id, 'task') and wrote
      // dbUpdateItem(id, 'task', …) while every affordance that reaches them —
      // project-block's availableTasks, its move button, and the drag arming —
      // reads the `tasks` PROJECTION, which is `type !== 'habit'`. So a custom
      // item rendered a live "move to block" button and a live drop target, and
      // the verb returned state unchanged: no row moved, no DB write (db.ts
      // filters .eq('type', type), so 'task' matches zero rows for a custom
      // item), and the group path still reported success and cleared the
      // selection. Armed on the way in, dead on arrival.
      moveTaskToProjectBlock: (taskId) => {
        const moved = findTaskLike(taskId);
        setNextActionLabel(`Move task into project block: ${moved?.title || 'Unknown'}`);
        // resolveDateStr = toDateStr(selectedDate, userTimezone) — the user-tz
        // day the canvas is derived against, so a machine-tz off-by-one can't
        // file this into a project block on the wrong day.
        const selectedDateStr = resolveDateStr();
        let taskUpdates: Partial<Task> | null = null;
        let dbType = 'task';

        set((state) => {
          const task = state.items.find(
            (i) => i.id === taskId && i.type !== 'habit'
          ) as TaskItem | undefined;
          if (!task || !task.project) return state;
          dbType = dbTypeOf(task);

          const project = state.projects.find((p) =>
            sameContainerName('project', p.name, task.project!)
          );
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
            i.id === taskId && i.type !== 'habit' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, dbType, taskUpdates).catch(console.error);
      },

      moveTasksToProjectBlock: (taskIds) => {
        setNextActionLabel(`Move ${taskIds.length} tasks into project block`);
        // resolveDateStr = toDateStr(selectedDate, userTimezone) — the user-tz
        // day the canvas is derived against, so a machine-tz off-by-one can't
        // file this into a project block on the wrong day.
        const selectedDateStr = resolveDateStr();
        const updatesMap = new Map<string, Partial<Task>>();
        const dbTypes = new Map<string, string>();

        set((state) => {
          const firstTask = state.items.find(
            (i): i is TaskItem => i.type !== 'habit' && taskIds.includes(i.id)
          );
          if (!firstTask || !firstTask.project) return state;

          const project = state.projects.find((p) =>
            sameContainerName('project', p.name, firstTask.project!)
          );
          if (!project || !project.startTime || !project.timeBucket) return state;

          return projectItems(state.items.map((i) => {
            if (i.type === 'habit' || !taskIds.includes(i.id)) return i;
            dbTypes.set(i.id, dbTypeOf(i));
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
          dbUpdateItem(id, dbTypes.get(id) ?? 'task', updates).catch(console.error)
        );
      },

      moveTaskOutOfProjectBlock: (taskId) => {
        const moved = findTaskLike(taskId);
        setNextActionLabel(`Move task out of project block: ${moved?.title || 'Unknown'}`);
        let taskUpdates: Partial<Task> | null = null;
        let dbType = 'task';

        set((state) => {
          const task = state.items.find(
            (i) => i.id === taskId && i.type !== 'habit'
          ) as TaskItem | undefined;
          if (!task) return state;
          dbType = dbTypeOf(task);
          taskUpdates = {
            inProjectBlock: false,
            startTime: task.previousStartTime,
            startDate: task.previousStartDate,
            previousStartTime: undefined,
            previousStartDate: undefined,
          };
          return projectItems(state.items.map((i) =>
            i.id === taskId && i.type !== 'habit' ? { ...i, ...taskUpdates! } as Item : i
          ));
        });

        if (taskUpdates) dbUpdateItem(taskId, dbType, taskUpdates).catch(console.error);
      },

      addHabitGroup: (name, emoji, color) => {
        const alreadyExists = get().habitGroups.some((g) => sameContainerName('group', g.name, name));
        if (alreadyExists) return;
        // Labelled at last: this create has always logged as "Unknown action"
        // while its own delete was named, so the history popover could show you
        // a group being removed and never how it arrived. Not in
        // SIGNIFICANT_ACTIONS, so no undo toast — same as `Add project:`.
        setNextActionLabel(`Add habit group: ${name}`);

        const group: HabitGroupType = { id: crypto.randomUUID(), name, emoji, color };
        set((state) => ({ habitGroups: [...state.habitGroups, group] }));
        const entryId = lastHistoryEntryId();

        const userId = get().userId;
        if (userId) {
          dbCreateHabitGroup(userId, group).catch((error) => {
            undoFailedCreate(error, entryId, 'group', group.id, name);
          });
        }
      },

      updateHabitGroup: (id, updates) => {
        const group = get().habitGroups.find((g) => g.id === id);
        // See updateProject — the same fan-out, for the same reason.
        const renamedTo =
          updates.name !== undefined && group && updates.name !== group.name
            ? updates.name
            : null;
        set((state) => ({
          habitGroups: state.habitGroups.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
          ...(renamedTo
            ? projectItems(
                state.items.map((i) =>
                  i.type === 'habit' && i.groupId === id ? { ...i, group: renamedTo } : i
                )
              )
            : {}),
        }));

        const userId = get().userId;
        if (userId) {
          // Chained, and re-checked on resume, for the same two reasons as
          // updateProject — see the notes there.
          const write = dbUpdateHabitGroup(userId, id, updates);
          (renamedTo
            ? write.then(() => {
                if (get().habitGroups.find((g) => g.id === id)?.name !== renamedTo) return;
                return dbRenameContainerMembers(userId, 'group_id', id, renamedTo);
              })
            : write
          ).catch(console.error);
        }
      },

      removeHabitGroup: (id) => {
        const group = get().habitGroups.find((g) => g.id === id);
        // The sibling of removeProject's label, and now load-bearing: the delete
        // confirm promises "⌘Z brings the group back", and without this the
        // entry that undo offers is titled "Unknown action" — a correct
        // operation the history cannot name.
        setNextActionLabel(`Delete habit group: ${group?.name || 'Unknown'}`);
        set((state) => ({
          habitGroups: state.habitGroups.filter((g) => g.id !== id),
          // Folded, unlike every version before A′. `makeAddDraft` writes a
          // lowercase 'personal' against the seeded 'Personal' whenever the
          // groups list has not loaded yet, so `i.group === group.name` left
          // exactly those habits pointing at a group that no longer exists —
          // the orphan this reassignment is here to prevent.
          ...projectItems(state.items.map((i) =>
            // Reassigns rather than unassigns — see the confirm copy, which
            // names the destination. The id moves with the name (027): a
            // destination that exists as a row hands over its id, and the
            // 'Personal' fallback resolves to undefined when no such row exists,
            // which is the honest answer for an account whose default groups
            // were never persisted.
            //
            // `group &&` guards the whole disjunction for the same reason
            // removeProject's does: without it an unknown id makes
            // `i.groupId === group?.id` true for every habit not yet linked.
            i.type === 'habit' &&
            group &&
            (i.groupId === group.id || sameContainerName('group', i.group, group.name))
              ? (() => {
                  const dest = state.habitGroups.find((g) => g.id !== id);
                  return { ...i, group: dest?.name || 'Personal', groupId: dest?.id };
                })()
              : i
          )),
        }));

        const userId = get().userId;
        if (userId) dbDeleteHabitGroup(userId, id).catch(console.error);
      },

      restoreFromTrash: (entry) => {
        const userId = get().userId;
        const state = get();

        /**
         * The next state, computed BEFORE anything is labelled.
         *
         * TRAP A — an armed label with no state change. setNextActionLabel
         * writes a module-level variable that only saveToHistory consumes, and
         * saveToHistory only runs when the subscriber sees the snapshot JSON
         * actually move. So labelling a restore that turns out to be a no-op
         * (the row is already back — a double-click, a stale bin) leaves
         * "Restore project: Work" armed, and the user's next unrelated edit is
         * logged, undone and receipted under that name. Returning early here,
         * before the label, is what makes that unreachable.
         */
        const next = (() => {
          switch (entry.kind) {
            case 'item': {
              const item = entry.entity as Item;
              if (state.items.some((i) => i.id === item.id)) return null;
              // The co-deleted subtasks land in the SAME projection rebuild —
              // db.restoreItem's cascade puts them back in the database, and a
              // parent that reappeared with an empty checklist until the next
              // reload would read as the subtasks having been lost.
              const back = [item, ...(entry.children ?? [])].filter(
                (i) => !state.items.some((existing) => existing.id === i.id)
              );
              if (back.length === 0) return null;
              return projectItems([...state.items, ...back]);
            }
            case 'project': {
              const project = entry.entity as Project;
              if (state.projects.some((p) => p.id === project.id)) return null;
              // Members re-file in the same set(). The link never left the
              // database — removeProject clears the store's copy and writes
              // nothing to items — so this is the store catching up with what a
              // reload would have shown anyway, not a new claim about the data.
              //
              // KNOWN LIMIT, and it is the price of doing this at all: ⌘Z after
              // a restore goes through applyHistoryState, whose per-item diff
              // sees {project: undefined, projectId: undefined} against the
              // pre-restore snapshot and writes both as NULL. So undoing a
              // restore does not merely re-bin the container — it also severs
              // the DB link the NEXT restore would have reconnected, and a
              // second trip through the Trash returns an empty container. The
              // gesture is rare (you have just deliberately restored the thing)
              // and the outcome still matches what the delete confirm promised
              // — "they just stop being filed under Work" — so it is accepted
              // rather than papered over. Fixing it properly means teaching the
              // history diff that a container's membership is the container's
              // to own, which is a change to undo, not to this action.
              const members = new Set(entry.memberIds ?? []);
              return {
                projects: [...state.projects, project],
                ...projectItems(
                  members.size === 0
                    ? state.items
                    : state.items.map((i) =>
                        members.has(i.id) && i.type !== 'habit'
                          ? { ...i, project: project.name, projectId: project.id }
                          : i
                      )
                ),
              };
            }
            case 'group': {
              const group = entry.entity as HabitGroupType;
              if (state.habitGroups.some((g) => g.id === group.id)) return null;
              const members = new Set(entry.memberIds ?? []);
              return {
                habitGroups: [...state.habitGroups, group],
                ...projectItems(
                  members.size === 0
                    ? state.items
                    : state.items.map((i) =>
                        members.has(i.id) && i.type === 'habit'
                          ? { ...i, group: group.name, groupId: group.id }
                          : i
                      )
                ),
              };
            }
            case 'routine': {
              const routine = entry.entity as Routine;
              if (state.routines.some((r) => r.id === routine.id)) return null;
              // itemIds arrive already hydrated from the join tables — see
              // listDeleted on why an empty array here would hard-delete the
              // very membership the soft delete preserved.
              return { routines: [...state.routines, routine] };
            }
            case 'program': {
              const program = entry.entity as Program;
              if (state.programs.some((p) => p.id === program.id)) return null;
              return { programs: [...state.programs, program] };
            }
          }
        })();
        if (!next) return;

        setNextActionLabel(`Restore ${TRASH_NOUNS[entry.kind]}: ${entry.name}`);

        /**
         * TRAP B — exactly ONE set(). A second one produces a second history
         * entry that the label has already been spent on, so it logs as
         * "Unknown action" and ⌘Z undoes only half the restore: the container
         * comes back trashed while its members stay re-filed. Every slice this
         * touches is in the object above for that reason.
         *
         * A restored container releases its members' suppression, so this rides
         * withReleaseGrace exactly as removeRoutine and updateRoutine do.
         */
        if (entry.kind === 'routine' || entry.kind === 'program') {
          withReleaseGrace(() => set(next));
        } else {
          set(next);
        }

        if (!userId) return;
        switch (entry.kind) {
          case 'item':
            dbRestoreItem(entry.id, itemDbType(entry.entity as Item)).catch(console.error);
            break;
          case 'project':
            dbRestoreProject(userId, entry.id).catch(console.error);
            break;
          case 'group':
            dbRestoreHabitGroup(userId, entry.id).catch(console.error);
            break;
          case 'routine':
            dbRestoreRoutine(userId, entry.id).catch(console.error);
            break;
          case 'program':
            dbRestoreProgram(userId, entry.id).catch(console.error);
            break;
        }
      },

      getHabitGroupEmoji: (name) => {
        const group = get().habitGroups.find((g) => sameContainerName('group', g.name, name));
        return group?.emoji || '';
      },

      getHabitGroupColor: (name) => {
        const normalized = foldContainerName('group', name);
        const group = get().habitGroups.find((g) => sameContainerName('group', g.name, name));
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
        // Keyed on the FOLDED name so membership answers the same question the
        // rest of the app does: a habit stored as 'personal' is not an orphan
        // while a group called 'Personal' exists.
        const projectNames = new Set(state.projects.map((p) => foldContainerName('project', p.name)));
        const groupNames = new Set(state.habitGroups.map((g) => foldContainerName('group', g.name)));

        set(projectItems(state.items.map((i) => {
          // `!== 'habit'`, not `=== 'task'`: custom types are project-shaped
          // (registry containerKind 'projects'), so this has to reach them.
          //
          // NB this whole action currently has ZERO CALLERS — it is declared,
          // implemented, and wired to nothing. Kept correct rather than deleted
          // because the container work (memory/plans/display-menu.md, phase B)
          // wants exactly this sweep once containers move to ids. If you wire
          // it up, note that it only mutates state: persisting the repair needs
          // dbTypeOf, not a hardcoded 'task' — see moveTaskToProjectBlock.
          if (i.type !== 'habit' && i.project && !projectNames.has(foldContainerName('project', i.project))) {
            return { ...i, project: undefined };
          }
          if (i.type === 'habit' && !groupNames.has(foldContainerName('group', i.group))) {
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
