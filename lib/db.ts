import { createClient } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;
import type { Task, Habit, Item, ItemTypeDef, TaskItem, HabitItem, Project, HabitGroupType, Routine, Program } from './planner-types';
import { ITEM_TYPES, getItemTypeConfig } from './item-registry';
import { notifyPlugins } from './openclaw-registry';
import { COMPLETION_RETRACTION_WINDOW_DAYS, windowStart } from './completion-window';

/**
 * DB-level type value for an item: custom items store their user-defined slug
 * in items.type; only the app layer sees the {type:'custom', customType}
 * envelope. Every `type` param below takes this slug ('task', 'habit',
 * 'goal', …), never the literal 'custom'.
 */
export function itemDbType(item: Item): string {
  return item.type === 'custom' ? item.customType : item.type;
}

// ============================================================
// Unified items (tasks + habits live in one table since migration 019).
// Legacy-named exports (fetchTasks, createHabit, …) are kept so callers and
// the external agent API keep their exact shapes; they are thin projections
// over the item functions. Old tasks/habits tables are frozen — never query
// them.
// ============================================================

// ---- Item row type ----
interface ItemRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  status: string;
  notes?: string | null;
  time_bucket?: string | null;
  start_time?: string | null;
  repeat_frequency?: string | null;
  repeat_days?: number[] | null;
  repeat_month_day?: number | null;
  completed_dates: string[] | null;
  // task-side
  priority?: string | null;
  project?: string | null;
  // Container ids (migration 027). The text columns above/below stay — these
  // are what survive a rename, those are what the legacy projection emits.
  project_id?: string | null;
  group_id?: string | null;
  start_date?: string | null;
  duration?: number | null;
  is_scheduled?: boolean | null;
  order?: number | null;
  in_project_block?: boolean | null;
  previous_start_time?: string | null;
  previous_start_date?: string | null;
  // item-surface growth (columns shipped in 007/019, woken 2026-07-29)
  parent_item_id?: string | null;
  assignee?: string | null;
  ai_status?: string | null;
  ai_result?: string | null;
  // habit-side
  group?: string | null;
  streak?: number | null;
  skipped_dates?: string[] | null;
  daily_counts?: Record<string, number> | null;
  times_per_day?: number | null;
  current_day_count?: number | null;
  // pausing (migration 024) — shared by every type
  paused_at?: string | null;
  paused_until?: string | null;
  // reminders (migration 032) — shared by every remindable type
  reminder_time?: string | null;
  reminder_anchor?: string | null;
}

function itemFromRow(row: ItemRow): Item {
  // Custom types (Phase 6): the DB stores the user-defined slug in items.type;
  // app-side they travel under the closed {type:'custom', customType} envelope
  // so discriminated narrowing keeps working. Shape is task-like (v1 template).
  if (row.type !== 'task' && row.type !== 'habit') {
    return {
      type: 'custom',
      customType: row.type,
      id: row.id,
      title: row.title,
      priority: (row.priority ?? undefined) as Task['priority'],
      project: row.project ?? undefined,
      projectId: row.project_id ?? undefined,
      startDate: row.start_date ?? undefined,
      status: row.status as Task['status'],
      timeBucket: (row.time_bucket ?? undefined) as Task['timeBucket'],
      startTime: row.start_time ?? undefined,
      duration: row.duration ?? undefined,
      isScheduled: row.is_scheduled ?? false,
      repeatFrequency: (row.repeat_frequency ?? undefined) as Task['repeatFrequency'],
      repeatDays: row.repeat_days ?? undefined,
      repeatMonthDay: row.repeat_month_day ?? undefined,
      completedDates: row.completed_dates ?? [],
      skippedDates: row.skipped_dates ?? [],
      order: row.order ?? 0,
      inProjectBlock: row.in_project_block ?? undefined,
      previousStartTime: row.previous_start_time ?? undefined,
      previousStartDate: row.previous_start_date ?? undefined,
      notes: row.notes ?? undefined,
      parentItemId: row.parent_item_id ?? undefined,
      assignee: row.assignee ?? undefined,
      aiStatus: row.ai_status ?? undefined,
      aiResult: row.ai_result ?? undefined,
      pausedAt: row.paused_at ?? undefined,
      pausedUntil: row.paused_until ?? undefined,
      reminderTime: row.reminder_time ?? undefined,
      reminderAnchor: row.reminder_anchor ?? undefined,
    };
  }
  if (row.type === 'habit') {
    return {
      type: 'habit',
      id: row.id,
      title: row.title,
      group: row.group ?? '',
      groupId: row.group_id ?? undefined,
      streak: row.streak ?? 0,
      status: row.status as Habit['status'],
      completedDates: row.completed_dates ?? [],
      skippedDates: row.skipped_dates ?? [],
      dailyCounts: row.daily_counts ?? {},
      timeBucket: (row.time_bucket ?? undefined) as Habit['timeBucket'],
      startTime: row.start_time ?? undefined,
      duration: row.duration ?? undefined,
      repeatFrequency: (row.repeat_frequency ?? ITEM_TYPES.habit.defaultFrequency) as Habit['repeatFrequency'],
      repeatDays: row.repeat_days ?? undefined,
      repeatMonthDay: row.repeat_month_day ?? undefined,
      timesPerDay: row.times_per_day ?? undefined,
      currentDayCount: row.current_day_count ?? undefined,
      notes: row.notes ?? undefined,
      pausedAt: row.paused_at ?? undefined,
      pausedUntil: row.paused_until ?? undefined,
      reminderTime: row.reminder_time ?? undefined,
      reminderAnchor: row.reminder_anchor ?? undefined,
    };
  }
  return {
    type: 'task',
    id: row.id,
    title: row.title,
    priority: (row.priority ?? undefined) as Task['priority'],
    project: row.project ?? undefined,
    projectId: row.project_id ?? undefined,
    startDate: row.start_date ?? undefined,
    status: row.status as Task['status'],
    timeBucket: (row.time_bucket ?? undefined) as Task['timeBucket'],
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
    isScheduled: row.is_scheduled ?? false,
    repeatFrequency: (row.repeat_frequency ?? undefined) as Task['repeatFrequency'],
    repeatDays: row.repeat_days ?? undefined,
    repeatMonthDay: row.repeat_month_day ?? undefined,
    completedDates: row.completed_dates ?? [],
    // items.skipped_dates is not habit-private: it is the per-date skip twin of
    // completed_dates for EVERY recurring type (migration 019 declared it
    // `text[] default '{}'` on the unified table, so no migration was needed to
    // start writing it for tasks).
    skippedDates: row.skipped_dates ?? [],
    order: row.order ?? 0,
    inProjectBlock: row.in_project_block ?? undefined,
    previousStartTime: row.previous_start_time ?? undefined,
    previousStartDate: row.previous_start_date ?? undefined,
    notes: row.notes ?? undefined,
    parentItemId: row.parent_item_id ?? undefined,
    assignee: row.assignee ?? undefined,
    aiStatus: row.ai_status ?? undefined,
    aiResult: row.ai_result ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    pausedUntil: row.paused_until ?? undefined,
    reminderTime: row.reminder_time ?? undefined,
    reminderAnchor: row.reminder_anchor ?? undefined,
  };
}

/**
 * Pause columns, emitted ONLY when set.
 *
 * PostgREST rejects an INSERT naming a column absent from its schema cache
 * (PGRST204), so writing these unconditionally would break EVERY item create
 * in the window between this build deploying and migration 024 being applied —
 * the app deploys on push while `pnpm db:push` is a separate manual step, which
 * is why migration 019 shipped a cutover runbook. Nothing writes pause state
 * before Phase 1, so this yields `{}` today and the insert row stays
 * byte-identical to a pre-024 one.
 */
function pauseColumns(item: Item): Partial<Pick<ItemRow, 'paused_at' | 'paused_until'>> {
  return {
    ...(item.pausedAt !== undefined ? { paused_at: item.pausedAt } : {}),
    ...(item.pausedUntil !== undefined ? { paused_until: item.pausedUntil } : {}),
  };
}

/**
 * Container ids, emitted ONLY when set — the same PGRST204 guard as
 * pauseColumns, for the same reason: an INSERT naming a column absent from
 * PostgREST's schema cache is rejected outright, so writing these
 * unconditionally would break EVERY item create against a pre-027 database,
 * not only container-bearing ones.
 *
 * 027's header calls for database-first deploy, which makes that window
 * impossible in the forward direction. This guard is for the two cases that
 * order does not cover: a fresh clone pointed at an un-migrated project, and a
 * rollback of the migration under a deployed build.
 */
function containerColumns(item: Item): Partial<Pick<ItemRow, 'project_id' | 'group_id'>> {
  if (item.type === 'habit') {
    return item.groupId !== undefined ? { group_id: item.groupId } : {};
  }
  return item.projectId !== undefined ? { project_id: item.projectId } : {};
}

/**
 * Reminder columns, emitted ONLY when set — the third instance of the
 * pauseColumns/containerColumns guard, for the identical reason: PostgREST
 * rejects an INSERT naming a column absent from its schema cache (PGRST204),
 * so writing these unconditionally would break EVERY item create against a
 * database that has not run migration 032, not merely reminder-bearing ones.
 *
 * The app deploys on push while `pnpm db:push` is a separate manual step, so
 * that window is real rather than theoretical.
 */
function reminderColumns(item: Item): Partial<Pick<ItemRow, 'reminder_time' | 'reminder_anchor'>> {
  return {
    ...(item.reminderTime !== undefined ? { reminder_time: item.reminderTime } : {}),
    ...(item.reminderAnchor !== undefined ? { reminder_anchor: item.reminderAnchor } : {}),
  };
}

function itemToRow(userId: string, item: Item): ItemRow {
  if (item.type === 'habit') {
    return {
      id: item.id,
      user_id: userId,
      type: 'habit',
      title: item.title,
      group: item.group,
      streak: item.streak,
      status: item.status,
      completed_dates: item.completedDates,
      skipped_dates: item.skippedDates,
      daily_counts: item.dailyCounts,
      time_bucket: item.timeBucket ?? null,
      start_time: item.startTime ?? null,
      duration: item.duration ?? null,
      repeat_frequency: item.repeatFrequency,
      repeat_days: item.repeatDays ?? null,
      repeat_month_day: item.repeatMonthDay ?? null,
      times_per_day: item.timesPerDay ?? null,
      current_day_count: item.currentDayCount ?? null,
      notes: item.notes ?? null,
      ...pauseColumns(item),
      ...containerColumns(item),
      ...reminderColumns(item),
    };
  }
  // task and custom items share the task-shaped column set; the DB type is
  // the custom slug for envelope items.
  return {
    id: item.id,
    user_id: userId,
    type: item.type === 'custom' ? item.customType : 'task',
    title: item.title,
    priority: item.priority ?? null,
    project: item.project ?? null,
    start_date: item.startDate ?? null,
    status: item.status,
    time_bucket: item.timeBucket ?? null,
    start_time: item.startTime ?? null,
    duration: item.duration ?? null,
    is_scheduled: item.isScheduled ?? false,
    repeat_frequency: item.repeatFrequency ?? null,
    repeat_days: item.repeatDays ?? null,
    repeat_month_day: item.repeatMonthDay ?? null,
    completed_dates: item.completedDates ?? [],
    skipped_dates: item.skippedDates ?? [],
    // legacy tasks."order" was NOT NULL DEFAULT 0; agent POST bodies may omit it
    order: item.order ?? 0,
    in_project_block: item.inProjectBlock ?? null,
    previous_start_time: item.previousStartTime ?? null,
    previous_start_date: item.previousStartDate ?? null,
    notes: item.notes ?? null,
    parent_item_id: item.parentItemId ?? null,
    assignee: item.assignee ?? null,
    ai_status: item.aiStatus ?? null,
    ai_result: item.aiResult ?? null,
    ...pauseColumns(item),
    ...containerColumns(item),
    ...reminderColumns(item),
  };
}

// Per-type update allowlists — the last field filter before the DB, and the
// one that gates the APP's own writes (updateItem early-returns on an empty
// mapped row, so a field missing here is a silent no-op that reverts on
// reload). They must stay separate: a merged list would let habit fields be
// written onto tasks and vice versa.
//
// NOT the agent gate any more, despite what this comment used to say: agent
// PATCH bodies are validated first against the hand-enumerated
// TaskUpdateSchema/HabitUpdateSchema (packages/types), which strip unknown
// keys. Adding a field here does NOT expose it to agents — reason about agent
// exposure from those schemas, never from this list.
// Fields the legacy tables declared NOT NULL keep that semantics via null
// guards here — the unified table is nullable-superset, so without the guard
// a PATCH {"group": null} would silently corrupt instead of erroring.
function taskUpdatesToRow(updates: Partial<Task>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('priority' in updates) row.priority = updates.priority ?? null;
  if ('project' in updates) row.project = updates.project ?? null;
  // Container id (027). Nulls pass through — unfiling clears both halves, and
  // the purge cron's ON DELETE SET NULL can leave the id null while the text
  // survives, which is the state a later re-file has to be able to overwrite.
  if ('projectId' in updates) row.project_id = updates.projectId ?? null;
  if ('startDate' in updates) row.start_date = updates.startDate ?? null;
  if ('status' in updates) row.status = updates.status;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  if ('isScheduled' in updates && updates.isScheduled != null) row.is_scheduled = updates.isScheduled;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency ?? null;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  // completedDates / skippedDates are DELIBERATELY absent — see the note on
  // reconcileDateArrays. They are not dropped: updateItem routes them through
  // the per-date intent RPCs before this allowlist ever runs.
  if ('order' in updates && updates.order != null) row.order = updates.order;
  if ('inProjectBlock' in updates) row.in_project_block = updates.inProjectBlock ?? null;
  if ('previousStartTime' in updates) row.previous_start_time = updates.previousStartTime ?? null;
  if ('previousStartDate' in updates) row.previous_start_date = updates.previousStartDate ?? null;
  if ('notes' in updates) row.notes = updates.notes ?? null;
  if ('parentItemId' in updates) row.parent_item_id = updates.parentItemId ?? null;
  if ('assignee' in updates) row.assignee = updates.assignee ?? null;
  if ('aiStatus' in updates) row.ai_status = updates.aiStatus ?? null;
  if ('aiResult' in updates) row.ai_result = updates.aiResult ?? null;
  // Reminders (migration 032). Nulls pass through and MEAN something here —
  // null is how a reminder is turned off, so a `?? null` guard is the
  // behavior, not a fallback (compare `group` above, where null would corrupt).
  // Nothing clears the dedupe stamp here, deliberately: reminder_sent_key
  // contains the TIME the cue was sent for, so retiming re-arms it by itself.
  // Clearing on write instead would fire the cue a second time on any unrelated
  // edit, because the item dialog's whole-item save names every field.
  if ('reminderTime' in updates) row.reminder_time = updates.reminderTime ?? null;
  if ('reminderAnchor' in updates) row.reminder_anchor = updates.reminderAnchor ?? null;
  // Pause (migration 024). These allowlists gate EVERY write, the app's own
  // included — updateItem early-returns on an empty mapped row, so omitting
  // them here would make the store's pause verb (and every undo/redo restore
  // of pause state) an optimistic no-op that silently unpauses on reload.
  // Nulls pass through: clearing is how a resume that predates the
  // normalize-to-today convention would unset the pair.
  if ('pausedAt' in updates) row.paused_at = updates.pausedAt ?? null;
  if ('pausedUntil' in updates) row.paused_until = updates.pausedUntil ?? null;
  return row;
}

function habitUpdatesToRow(updates: Partial<Habit>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('group' in updates && updates.group != null) row.group = updates.group;
  // Container id (027) — see the task allowlist. No null guard, unlike `group`
  // above: the group NAME kept legacy NOT NULL semantics, but the id is
  // nullable by design and clearing it is a real operation.
  if ('groupId' in updates) row.group_id = updates.groupId ?? null;
  if ('streak' in updates && updates.streak != null) row.streak = updates.streak;
  if ('status' in updates) row.status = updates.status;
  // completedDates / skippedDates: intent-routed by updateItem, never written
  // as an absolute array. See reconcileDateArrays.
  if ('dailyCounts' in updates && updates.dailyCounts != null) row.daily_counts = updates.dailyCounts;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  if ('repeatFrequency' in updates && updates.repeatFrequency != null) row.repeat_frequency = updates.repeatFrequency;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('timesPerDay' in updates) row.times_per_day = updates.timesPerDay ?? null;
  if ('currentDayCount' in updates) row.current_day_count = updates.currentDayCount ?? null;
  if ('notes' in updates) row.notes = updates.notes ?? null;
  // Pause — see the task allowlist's note; habits need their own entries
  // because the two lists are deliberately never merged.
  if ('pausedAt' in updates) row.paused_at = updates.pausedAt ?? null;
  if ('pausedUntil' in updates) row.paused_until = updates.pausedUntil ?? null;
  // Reminders (032) — same split, same reason, including the re-arm.
  // Nothing clears the dedupe stamp here, deliberately: reminder_sent_key
  // contains the TIME the cue was sent for, so retiming re-arms it by itself.
  // Clearing on write instead would fire the cue a second time on any unrelated
  // edit, because the item dialog's whole-item save names every field.
  if ('reminderTime' in updates) row.reminder_time = updates.reminderTime ?? null;
  if ('reminderAnchor' in updates) row.reminder_anchor = updates.reminderAnchor ?? null;
  return row;
}

export function updatesToRow(type: string, updates: Partial<Task> | Partial<Habit>): Record<string, unknown> {
  return type === 'habit'
    ? habitUpdatesToRow(updates as Partial<Habit>)
    : taskUpdatesToRow(updates as Partial<Task>);
}

// Legacy webhook contract: per-kind event names + payload keys, mapped from
// item.type. The payload keeps the legacy shape (no `type` field) so deployed
// plugin installs see byte-identical events.
function notifyItemChange(
  userId: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  notifyPlugins(userId, getItemTypeConfig(type).webhookEvent, payload);
}

function legacyPayload(item: Item): Record<string, unknown> {
  const { type: _type, ...legacy } = item;
  return legacy;
}

// ---- Item activity feed (item_events, migration 023) ----
// Write-through lives here because create/update/delete are already the single
// choke point every mutation flows through (same reason the webhooks fire
// here). Fire-and-forget: an event is a trace, never a reason a save fails.
// Availability follows the itemTypesAvailable pattern — if the table isn't
// there yet (migration not applied), flip a flag and go quiet instead of
// erroring on every mutation.

export interface ItemEvent {
  id: string;
  itemId: string;
  itemType: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

let itemEventsAvailable = true;
const missingEventsTable = (error: { code?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

/** False once a query proved the item_events table isn't deployed yet. */
export function getItemEventsAvailable(): boolean {
  return itemEventsAvailable;
}

function recordItemEvent(
  itemId: string,
  itemType: string,
  action: string,
  payload: Record<string, unknown>,
  userId?: string,
  client?: DbClient,
): void {
  if (!itemEventsAvailable) return;
  const supabase = client ?? createClient();
  // undefined values vanish in JSON serialization, which would turn an
  // unassign ({ assignee: undefined }) into an empty payload — keep the key,
  // as null, so the feed can say "Unassigned" instead of "Updated".
  const cleanPayload = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, v === undefined ? null : v])
  );
  supabase
    .from('item_events')
    // user_id defaults to auth.uid() for browser sessions; the service-role
    // path (agent API) has no auth context and must pass it explicitly.
    .insert({
      ...(userId ? { user_id: userId } : {}),
      item_id: itemId,
      item_type: itemType,
      action,
      payload: cleanPayload,
    })
    .then(
      ({ error }: { error: { code?: string } | null }) => {
        if (missingEventsTable(error)) itemEventsAvailable = false;
        else if (error) console.error('item_events insert failed', error);
      },
      () => {} // network failure — the trace is best-effort by design
    );
}

export async function fetchItemEvents(itemId: string, client?: DbClient): Promise<ItemEvent[]> {
  if (!itemEventsAvailable) return [];
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('item_events')
    .select('id, item_id, item_type, action, payload, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    if (missingEventsTable(error)) itemEventsAvailable = false;
    else console.error('item_events fetch failed', error);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    itemId: row.item_id as string,
    itemType: row.item_type as string,
    action: row.action as string,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

// ---- Item CRUD ----

/**
 * The relation every full-item READ goes through (migration 031): `items` with
 * completed_dates/skipped_dates trimmed to COMPLETION_READ_WINDOW_DAYS, and
 * every other column passed through. security_invoker=true, so the own-rows RLS
 * policy on items still applies exactly as it does to a direct read.
 *
 * WRITES NEVER USE THIS. They target `items`, and per-date writes go through the
 * intent RPCs — including reconcileDateArrays' read, which needs the UNTRIMMED
 * arrays to diff against and would otherwise treat everything outside the window
 * as a retraction.
 */
const ITEMS_READ_VIEW = 'items_windowed';

let itemsWindowAvailable = true;
/** False once a query proved migration 031 isn't applied yet. */
export function getItemsWindowAvailable(): boolean {
  return itemsWindowAvailable;
}

/**
 * The read relation, degrading to the base table when the view is absent.
 *
 * Vercel builds on push while `pnpm db:push` is a manual step, so an app that
 * hard-required the view would take out every read in that window — the same
 * hazard 027 documents on the write side, and the reason containerColumns and
 * pauseColumns exist. Falling back serves untrimmed arrays, which is the old
 * behaviour: bigger, never wrong.
 */
function itemsReadFrom(supabase: DbClient) {
  return supabase.from(itemsWindowAvailable ? ITEMS_READ_VIEW : 'items');
}

const missingItemsWindow = (error: { code?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

export async function fetchItems(userId: string, type?: string, client?: DbClient): Promise<Item[]> {
  const supabase = client ?? createClient();
  const run = async () => {
    let query = itemsReadFrom(supabase)
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (type) query = query.eq('type', type);
    return query
      .order('order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
  };

  let { data, error } = await run();
  if (missingItemsWindow(error) && itemsWindowAvailable) {
    itemsWindowAvailable = false;
    ({ data, error } = await run());
  }
  if (error) throw error;
  return (data as ItemRow[]).map(itemFromRow);
}

/**
 * Resolve a container NAME to its id, server-side (migration 027).
 *
 * THE AGENT PATH HAS NO STORE. Every client write goes through planner-store's
 * projectIdFor/groupIdFor, which read containers already in memory — but
 * /api/agent/tasks and /api/agent/habits never touch Zustand, and the create and
 * update schemas deliberately refuse an agent-supplied id (an agent holds no
 * id↔name map, so a body carrying both could only disagree with itself). Without
 * this, an agent naming a project got a row with the name and a NULL id, which
 * is invisible to the id-keyed rename fan-out — the exact orphaning Phase 0
 * exists to remove.
 *
 * Returning null for an unmatched name is a RESULT, not a failure, and callers
 * must write it: an agent moving an item to a container that has no row has to
 * clear the old id, or the fan-out will later drag the item back into the
 * container it was moved out of.
 *
 * A missing table (pre-027 clone, rolled-back migration) yields undefined, which
 * callers translate into "write no id column at all" — the PGRST204 guard.
 */
async function lookupContainerId(
  supabase: DbClient,
  table: 'projects' | 'habit_groups',
  name: string,
  userId?: string,
): Promise<string | null | undefined> {
  // Filters BEFORE .limit(): supabase-js returns a PostgrestTransformBuilder
  // from limit(), and that has no .eq() — chaining the other way round throws
  // at runtime, and DbClient is `any`, so nothing would have flagged it.
  //
  // Not filtered on deleted_at, matching 027's backfill: (user_id, name) is
  // unique across deleted rows too, so there is at most one candidate, and
  // keeping the link is what lets a Trash restore reconnect its members.
  try {
    let query = supabase.from(table).select('id, name').eq('name', name);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.limit(1);
    // Distinguish "no such container" (null — clear the id) from "cannot ask"
    // (undefined — leave the column out of the write entirely).
    if (error) return undefined;
    if (data?.[0]?.id) return data[0].id;

    // HABIT GROUPS FOLD CASE, and matching the store here is not tidiness. The
    // client resolver (groupIdFor), getHabitGroupEmoji, getHabitGroupColor and
    // addHabitGroup's de-dupe all normalise, so an agent naming "wellness"
    // against a row called "Wellness" is filing into a group the app considers
    // the same one. Exact-only, this returns null — and null does not merely
    // fail to link, it CLEARS an id that was already correct, putting the item
    // outside the rename fan-out. Projects stay exact, matching projectIdFor.
    //
    // A second round trip rather than `ilike`: a container legitimately named
    // "100%" or "a_b" would turn into a wildcard pattern and match the wrong
    // row. Container counts are small (10 projects, 3 groups on the live
    // database) and this only runs after an exact miss.
    if (table !== 'habit_groups') return null;
    let all = supabase.from(table).select('id, name');
    if (userId) all = all.eq('user_id', userId);
    const { data: rows, error: allError } = await all;
    if (allError) return undefined;
    const folded = name.toLowerCase();
    return (
      (rows as { id: string; name: string }[] | null)?.find(
        (r) => r.name.toLowerCase() === folded,
      )?.id ?? null
    );
  } catch {
    // Creating an item must never fail because a container lookup did. The
    // worst case here is the pre-027 behaviour — a row with a name and no id —
    // which is recoverable by re-running the migration's backfill. A thrown
    // lookup would instead lose the item the user just typed.
    return undefined;
  }
}

/**
 * Fill in the container id implied by a name-only PATCH. Agent path only —
 * `updateTask`/`updateHabit` are the legacy wrappers, and `lib/agent-api.ts` is
 * their only caller in the tree (the store calls `updateItem` directly, and
 * `planner().updateTask` is the unrelated store action).
 *
 * THAT SEPARATION IS THE WHOLE POINT, and putting this in `updateItem` was a
 * bug. A name-only patch does NOT reliably mean "re-file": undo sends one too.
 * Renaming a project rewrites its members' `project` text in the same set(), so
 * undo's `diffItem` produces exactly `{project: <old name>}` — no id, because
 * the member's id never moved. Resolved there, that patch looked like a re-file
 * into a container whose name had not been restored yet (the item loop runs
 * before `syncContainers`, and both are unawaited), so it wrote
 * `project_id = null` onto every member and silently unlinked the container it
 * was supposed to be restoring. Requiring an explicit agent entry point makes
 * that unrepresentable rather than merely unlikely.
 */
async function withResolvedUpdate(
  supabase: DbClient,
  kind: 'task' | 'habit',
  updates: Record<string, unknown>,
  userId?: string,
): Promise<Record<string, unknown>> {
  const nameKey = kind === 'habit' ? 'group' : 'project';
  const idKey = kind === 'habit' ? 'groupId' : 'projectId';
  // An explicit id wins; no name means nothing to re-file.
  if (!(nameKey in updates) || idKey in updates) return updates;
  const name = updates[nameKey];
  // Null, not "leave it": an agent moving an item to a container with no row
  // has to CLEAR the old id, or the fan-out drags the item back into the
  // container it was moved out of.
  const resolved =
    typeof name === 'string' && name
      ? await lookupContainerId(
          supabase,
          kind === 'habit' ? 'habit_groups' : 'projects',
          name,
          userId,
        )
      : null;
  return resolved === undefined ? updates : { ...updates, [idKey]: resolved };
}

/**
 * Fill in the container id for a create, when a name is present and no id is.
 * The store already resolves its own, so this only ever fires for agent writes.
 */
async function withResolvedContainer(
  supabase: DbClient,
  userId: string,
  item: Item,
): Promise<Item> {
  if (item.type === 'habit') {
    if (!item.group || item.groupId !== undefined) return item;
    const id = await lookupContainerId(supabase, 'habit_groups', item.group, userId);
    return id === undefined ? item : { ...item, groupId: id ?? undefined };
  }
  if (!item.project || item.projectId !== undefined) return item;
  const id = await lookupContainerId(supabase, 'projects', item.project, userId);
  return id === undefined ? item : { ...item, projectId: id ?? undefined };
}

/**
 * Columns added by migration 032 that a write may name before the migration has
 * run.
 *
 * reminderColumns (above) already omits them from an INSERT when no reminder is
 * set, and the update path cannot do even that: the ItemDialog's whole-item
 * save passes DRAFT_KEYS, which includes the reminder fields, so EVERY modal
 * edit names reminder_time. PostgREST rejects the entire statement with
 * PGRST204 when one named column is missing, so unguarded that means a deploy
 * landing before `pnpm db:push` breaks editing any item at all — and creating
 * one WITH a reminder loses it outright.
 *
 * The retry both paths use is loadSettings' fallback applied to items: drop the
 * not-yet-migrated columns and try once more, so the write lands and only the
 * reminder half is deferred.
 */
const REMINDER_WRITE_COLUMNS = ['reminder_time', 'reminder_anchor'] as const;

/** True only for "the database doesn't have a column we asked for". */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column\b.*\bdoes not exist/i.test(error.message ?? '');
}

export async function createItem(userId: string, item: Item, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const linked = await withResolvedContainer(supabase, userId, item);
  const row = itemToRow(userId, linked) as unknown as Record<string, unknown>;
  let { error } = await supabase.from('items').insert(row);

  // reminderColumns already omits these when no reminder is set, so a plain
  // create against a pre-029 database is fine. Creating an item WITH a reminder
  // is not: PostgREST rejects the whole insert with PGRST204 and the item is
  // lost outright — a worse outcome than the update path's, which this retry
  // was written for. Same fallback, applied to the insert.
  if (error && isMissingColumnError(error)) {
    const stable = { ...row };
    let dropped = false;
    for (const column of REMINDER_WRITE_COLUMNS) {
      if (column in stable) {
        delete stable[column];
        dropped = true;
      }
    }
    if (dropped) {
      console.warn(
        `[db] items is missing a column this build writes (${error.message}). ` +
          'Retrying the create without the migration-032 reminder columns — the item is ' +
          'saved, its reminder is not. Apply supabase/migrations/032_habit_reminders.sql.',
      );
      ({ error } = await supabase.from('items').insert(stable));
    }
  }

  if (error) throw error;
  const dbType = itemDbType(item);
  notifyItemChange(userId, dbType, {
    action: 'create',
    [getItemTypeConfig(dbType).webhookPayloadKey]: legacyPayload(item),
  });
  recordItemEvent(item.id, dbType, 'create', { title: item.title }, userId, client);
}

export async function updateItem(
  id: string,
  type: string,
  updates: Partial<Task> | Partial<Habit>,
  userId?: string,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  // Per-date arrays are applied as intents and removed from the body BEFORE
  // the allowlist sees it — they have no column mapping any more.
  const routedDates = 'completedDates' in updates || 'skippedDates' in updates;
  const reconciled = routedDates
    ? await reconcileDateArrays(supabase, id, type, updates as Record<string, unknown>)
    : (updates as Record<string, unknown>);

  const row = updatesToRow(type, reconciled as Partial<Task> | Partial<Habit>);
  if (Object.keys(row).length === 0) {
    // A body carrying ONLY completedDates/skippedDates leaves an empty row, but
    // it is not a no-op — the intents above already landed. Fall through to the
    // notify so it still emits the webhook and feed entry that an absolute-array
    // update used to, rather than going silent for exactly the agent bodies this
    // reconciliation exists to serve.
    if (!routedDates) return;
  } else {
    let { error } = await supabase.from('items').update(row).eq('id', id).eq('type', type);

    // Schema-behind fallback, applied AFTER reconciliation so it can only ever
    // drop reminder columns — the per-date arrays are already gone from `row`
    // by this point and are never candidates for it.
    if (error && isMissingColumnError(error)) {
      const stable: Record<string, unknown> = { ...row };
      let dropped = false;
      for (const column of REMINDER_WRITE_COLUMNS) {
        if (column in stable) {
          delete stable[column];
          dropped = true;
        }
      }
      if (dropped) {
        console.warn(
          `[db] items is missing a column this build writes (${error.message}). ` +
            'Retrying without the migration-032 reminder columns — the reminder was not saved. ' +
            'Apply supabase/migrations/032_habit_reminders.sql to fix this.',
        );
        if (Object.keys(stable).length > 0) {
          ({ error } = await supabase.from('items').update(stable).eq('id', id).eq('type', type));
        } else {
          error = null;
        }
      }
    }

    if (error) throw error;
  }
  // Reports the ORIGINAL updates, arrays included: the dates really are set now,
  // and the webhook payload is a pinned external contract — narrowing it to the
  // post-reconcile body would drop completion changes from tasks.updated.
  if (userId) notifyItemChange(userId, type, { action: 'update', id, updates });
  recordItemEvent(id, type, 'update', updates as Record<string, unknown>, userId, client);
}

export async function deleteItem(id: string, type: string, userId?: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: deletedAt })
    .eq('id', id)
    .eq('type', type);
  if (error) throw error;
  // Cascade to subtasks HERE, not only in the store's deleteTask: agent
  // deletes never pass through the store, and the store can only cascade
  // children it has fetched. The FK's ON DELETE SET NULL covers only the hard
  // purge — without this, a soft-deleted parent leaves live-but-unreachable
  // children that resurrect as free-floating tasks when the purge runs.
  // Idempotent alongside the store's own per-child deletes: those re-stamp the
  // child with their own instant, which is harmless because NOTHING keys on the
  // two stamps agreeing. Phase 4's restore cascade tried to and had to stop —
  // see restoreItem.
  if (type !== 'habit') {
    const { error: childError } = await supabase
      .from('items')
      .update({ deleted_at: deletedAt })
      .eq('parent_item_id', id)
      .is('deleted_at', null);
    if (childError) console.error('subtask delete cascade failed', childError);
  }
  if (userId) notifyItemChange(userId, type, { action: 'delete', id });
  recordItemEvent(id, type, 'delete', {}, userId, client);
}

/**
 * Referential guard for parentItemId writes (agent API): the parent must be
 * the caller's own live task-like item that is not itself a subtask — the
 * single-level rule is what makes cycles impossible — and an item can never
 * be its own parent. Returns a human-readable problem, or null when valid.
 */
export async function validateParentItemId(
  client: DbClient,
  userId: string,
  childId: string | null,
  parentId: string,
): Promise<string | null> {
  if (childId && parentId === childId) return 'an item cannot be its own parent';
  const { data, error } = await client
    .from('items')
    .select('id, type, parent_item_id, deleted_at')
    .eq('id', parentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data || data.deleted_at) return 'parent item not found';
  if (data.type === 'habit') return 'a habit cannot have subtasks';
  if (data.parent_item_id) return 'subtasks cannot be nested';
  return null;
}

// No plugin notify, matching the legacy restoreTask/restoreHabit exactly — a
// 'restore' webhook action would widen the pinned event contract (Phase 5).
//
// RESTORES THE SUBTASKS IN THE BIN UNDER IT, which deleteItem's cascade above
// made necessary and nothing supplied until Phase 4. Clearing one row is not
// the inverse of stamping N+1: a parent restored alone comes back with its
// checklist silently missing, and no surface anywhere would say so.
//
// EVERY trashed child, NOT the ones sharing the parent's deleted_at. The first
// version of this matched on the timestamp, reasoning that the cascade stamps
// co-deleted children with the parent's exact instant so a subtask thrown away
// EARLIER would correctly stay behind. Review killed it twice over:
//
//  1. The stamps are not reliably equal. planner-store's deleteTask fires its
//     own dbDeleteItem per child AFTER the parent's, each computing a fresh
//     `new Date().toISOString()`, and that per-child write is unguarded while
//     the parent's cascade is `.is('deleted_at', null)` — so the child's own
//     stamp always wins. Measured over 20k simulated gestures they diverge in
//     0.3–2% of deletes. An invariant held together by two clocks landing in
//     the same millisecond is not an invariant.
//  2. It produced a state with no way out. listDeleted skipped a child whenever
//     its parent was trashed, but rolled it up only when the stamps matched —
//     two predicates that are not complements. A subtask binned on Monday whose
//     parent followed on Tuesday appeared in NO row: not its own, not under the
//     parent, and the stamp-matched cascade would not restore it either.
//
// So the rule is now the same one in all three places — the bin, the roll-up
// and this cascade all ask only "is the parent in the bin too". The cost is
// that a subtask deleted deliberately before its parent comes back with the
// parent; the alternative was that it never came back at all.
export async function restoreItem(id: string, type: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('type', type);
  if (error) throw error;

  if (type !== 'habit') {
    const { error: childError } = await supabase
      .from('items')
      .update({ deleted_at: null })
      .eq('parent_item_id', id)
      .not('deleted_at', 'is', null);
    // Logged, never thrown: the parent is already back, and failing the whole
    // restore here would leave the user with no way to retry the half that
    // worked. Mirrors deleteItem's cascade exactly.
    if (childError) console.error('subtask restore cascade failed', childError);
  }
}

export async function toggleItemCompletedDate(id: string, type: string, dateStr: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.rpc('toggle_item_completed_date', {
    item_id: id,
    item_type: type,
    date_str: dateStr,
  });
  if (error) throw error;
}

/**
 * Declare the desired completion state for one date — idempotent under
 * retries, stale clients, and request reordering (unlike a parity toggle).
 * The RPC also owns the streak transition (moves only when the date array
 * actually changes); pass adjustStreak=false when restoring an absolute
 * snapshot (undo/redo) that patches streak separately.
 */
export async function setItemCompletion(
  id: string,
  type: string,
  dateStr: string,
  completed: boolean,
  adjustStreak = true,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.rpc('set_item_completion', {
    item_id: id,
    item_type: type,
    date_str: dateStr,
    completed,
    adjust_streak: adjustStreak,
  });
  if (error) throw error;
  reportCompletion(id, dateStr, completed);
}

/**
 * Tell the server a completion just landed, so a live stake can act on it.
 *
 * HOOKED HERE, at the DB boundary, and not in the store — which is the whole
 * point. There are at least five ways to tick a habit (the grid checkbox, the
 * bulk verb, the item panel, the EOD review, undo/redo), every one of them ends
 * up on this RPC, and hooking them individually is a list that would be wrong
 * within a month. One funnel, one report.
 *
 * Browser only, through a dynamic import: this same module is used by
 * /api/reminders/act on the server, where the two zustand stores the reporter
 * gates on do not exist and where a fetch back into our own deployment is the
 * pattern lib/push-send.ts exists to have removed. The act route calls
 * reportLiveCompletion directly instead.
 *
 * Deliberately not awaited and never able to reject. The completion is already
 * written; this is a report about it, and a Beeminder outage must not surface
 * as a failed checkbox.
 */
function reportCompletion(id: string, dateStr: string, completed: boolean): void {
  if (typeof window === 'undefined') return;
  void import('./stakes/live-client')
    .then((m) => m.reportCompletionFromClient(id, dateStr, completed))
    .catch(() => {
      /* Best-effort; the nightly settlement is the backstop. */
    });
}

/**
 * Declare the desired skip state for one date (migration 029) — the twin of
 * setItemCompletion, and idempotent for the same reasons.
 *
 * Skip exclusivity (a skipped occurrence is not a completed one) is NOT here:
 * callers that need it issue a setItemCompletion(false) alongside, because that
 * RPC owns the streak column and two RPCs with a claim on streak is the desync
 * migration 020 exists to prevent.
 */
export async function setItemSkip(
  id: string,
  type: string,
  dateStr: string,
  skipped: boolean,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.rpc('set_item_skip', {
    item_id: id,
    item_type: type,
    date_str: dateStr,
    skipped,
  });
  if (error) throw error;
}

/**
 * Translate an ABSOLUTE completedDates/skippedDates array in an update body
 * into per-date intents, and strip it from the updates the allowlist will see.
 *
 * THE HAZARD THIS CLOSES. Both arrays used to be written whole:
 * `row.completed_dates = updates.completedDates`. That makes the writer's copy
 * the new truth, which is only safe while every writer holds the complete
 * history. Two writers don't:
 *
 *   * The OpenClaw plugin's update_task sends "the full set of ISO date strings
 *     representing all completion dates" (openclaw-plugin/src/tools.ts) — a set
 *     a model composed from injected context, not one read from this row.
 *   * Every client, since migration 031: fetchItems now reads items_windowed,
 *     so what a browser holds is the last COMPLETION_READ_WINDOW_DAYS of a
 *     history that may run for years.
 *
 * HOW IT RESOLVES. Additions are unconditional: a date in the body that the row
 * lacks is set. Retractions are BOUNDED — a date on the row that the body omits
 * is cleared only if it falls inside COMPLETION_RETRACTION_WINDOW_DAYS. Outside
 * that window it is left alone, because "the writer retracted this date" and
 * "the writer was never sent this date" are indistinguishable in an absolute
 * array, and only one of those two readings is recoverable if you guess wrong.
 *
 * That bound is the other half of migration 031, which trims reads to
 * COMPLETION_READ_WINDOW_DAYS. THE TWO MUST NOT BE SEPARATED: windowing reads
 * without bounding retraction here turns every agent write into silent history
 * deletion, and the read window is what creates partial writers in the first
 * place. The retraction window is deliberately the larger of the two so that a
 * client whose fetch has gone stale can still retract what it was actually
 * served — see lib/completion-window.ts for why the gap exists.
 *
 * `streak` is untouched either way: a whole-array write never moved it, and the
 * reconciled intents pass adjustStreak=false so they don't either.
 *
 * What this buys beyond the windowing: the write goes through the atomic
 * per-date RPCs, so it no longer clobbers a concurrent toggle, no longer inverts
 * intent against a stale client (migration 020's two flaws, which skipped_dates
 * still had because it never got an RPC), and no longer has a column mapping
 * anything can reach by accident.
 *
 * planner-store's undo/redo path has open-coded this diff since the unified
 * items refactor (it deletes completedDates from the patch and replays it as
 * intents). This is that guard, moved to the boundary where nothing can bypass
 * it. The store still emits intents directly on its hot paths — it knows the
 * delta already and shouldn't pay for a read to rediscover it.
 */
async function reconcileDateArrays(
  supabase: DbClient,
  id: string,
  type: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hasCompleted = 'completedDates' in updates;
  const hasSkipped = 'skippedDates' in updates;
  if (!hasCompleted && !hasSkipped) return updates;

  const rest = { ...updates };
  delete rest.completedDates;
  delete rest.skippedDates;

  const { data, error } = await supabase
    .from('items')
    .select('completed_dates, skipped_dates')
    .eq('id', id)
    .eq('type', type)
    .maybeSingle();
  // No row (deleted, wrong type, another tenant's id under RLS) means there is
  // nothing to reconcile against. Returning `rest` lets the caller's remaining
  // fields take their normal path — including the no-op early return when the
  // body carried nothing else.
  if (error || !data) {
    if (error) console.error('completion reconcile read failed', error);
    return rest;
  }

  const row = data as { completed_dates: string[] | null; skipped_dates: string[] | null };
  const intents: Promise<void>[] = [];

  // The retraction bound. A date the body omits is cleared ONLY if it falls
  // inside the window an absolute writer could plausibly have been served;
  // anything older is untouchable through this path, because a writer that was
  // never sent a date cannot be retracting it. Dates are YYYY-MM-DD, so the
  // string compare is a chronological one.
  const cutoff = windowStart(COMPLETION_RETRACTION_WINDOW_DAYS);
  const retractable = (d: string) => d >= cutoff;

  if (hasCompleted) {
    const desired = new Set((updates.completedDates as string[] | null) ?? []);
    const current = new Set(row.completed_dates ?? []);
    // adjustStreak=false, matching the absolute write this replaces: a whole-array
    // update never moved streak (the allowlist carried it as its own field, and
    // callers that want it moved say so). Letting the reconciled intents adjust it
    // would make streak jump by the SIZE OF THE DIFF — an agent body that dropped a
    // year of dates would decrement it to zero — which is a new behavior smuggled
    // in under a mechanism change. Same reasoning as undo/redo's absolute restore.
    for (const d of desired) {
      if (!current.has(d)) intents.push(setItemCompletion(id, type, d, true, false, supabase));
    }
    for (const d of current) {
      if (!desired.has(d) && retractable(d)) {
        intents.push(setItemCompletion(id, type, d, false, false, supabase));
      }
    }
  }

  if (hasSkipped) {
    const desired = new Set((updates.skippedDates as string[] | null) ?? []);
    const current = new Set(row.skipped_dates ?? []);
    for (const d of desired) {
      if (!current.has(d)) intents.push(setItemSkip(id, type, d, true, supabase));
    }
    for (const d of current) {
      if (!desired.has(d) && retractable(d)) {
        intents.push(setItemSkip(id, type, d, false, supabase));
      }
    }
  }

  await Promise.all(intents);
  return rest;
}

/**
 * Service-role ownership pre-check for the agent API routes. The service
 * client bypasses RLS, so routes MUST call this before any write. The type
 * filter keeps per-kind endpoints scoped: /api/agent/tasks/:id 404s for a
 * habit id exactly as it did when the kinds lived in separate tables.
 */
export async function verifyItemOwnership(
  client: DbClient,
  id: string,
  type: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from('items')
    .select('user_id')
    .eq('id', id)
    .eq('type', type)
    .is('deleted_at', null)
    .single();
  return !!data && data.user_id === userId;
}

// ---- Item type definitions (user-defined types, migration 021) ----

interface ItemTypeDefRow {
  id: string;
  name: string;
  label: string;
  label_plural: string;
  icon?: string | null;
  color?: string | null;
  config?: Record<string, unknown> | null;
}

function itemTypeDefFromRow(row: ItemTypeDefRow): ItemTypeDef {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    labelPlural: row.label_plural,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    config: row.config ?? undefined,
  };
}

/**
 * Resilient on purpose: returns null if the table doesn't exist yet (deploy
 * raced ahead of migration 021) so the app degrades to built-in types
 * instead of failing its whole data load. null (vs []) lets the store gate
 * the WRITE path too — pre-migration, creating a type would optimistically
 * succeed and then silently vanish on reload.
 */
export async function fetchItemTypes(userId: string, client?: DbClient): Promise<ItemTypeDef[] | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('item_types')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('fetchItemTypes failed (migration 021 applied?):', error.message);
    return null;
  }
  return (data as ItemTypeDefRow[]).map(itemTypeDefFromRow);
}

export async function createItemType(userId: string, def: ItemTypeDef, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('item_types').insert({
    id: def.id,
    user_id: userId,
    name: def.name,
    label: def.label,
    label_plural: def.labelPlural,
    icon: def.icon ?? null,
    color: def.color ?? null,
    config: def.config ?? {},
  });
  if (error) throw error;
}

export async function updateItemType(
  id: string,
  updates: Partial<Omit<ItemTypeDef, 'id' | 'name'>>,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const row: Record<string, unknown> = {};
  if ('label' in updates) row.label = updates.label;
  if ('labelPlural' in updates) row.label_plural = updates.labelPlural;
  if ('icon' in updates) row.icon = updates.icon ?? null;
  if ('color' in updates) row.color = updates.color ?? null;
  if ('config' in updates) row.config = updates.config ?? {};
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('item_types').update(row).eq('id', id);
  if (error) throw error;
}

/**
 * Hard delete — item_types has no trash. Items of the type are NOT touched:
 * they keep their slug and fall back to the registry's default template.
 */
export async function deleteItemType(id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('item_types').delete().eq('id', id);
  if (error) throw error;
}

// ---- Official extensions (per-user toggles, migration 026) ----

/**
 * Enabled/disabled rows for official extensions. A row exists only once the
 * user has touched a toggle; absent slugs fall back to the manifest's
 * defaultEnabled (lib/extension-registry.ts).
 *
 * Contract (the programs/routines discrimination, not fetchItemTypes' loose
 * one): null means THE TABLE IS MISSING (migration 026 not applied) — the
 * store latches the feature off and its settings rows explain the migration.
 * Any other error (network blip, 5xx, auth hiccup) RETHROWS, because a
 * transient failure latched as "needs a database update" is a lie the user
 * cannot dispel for the whole session; the store catches and leaves itself
 * retryable instead.
 */
export async function fetchUserExtensions(
  userId: string,
  client?: DbClient,
): Promise<Record<string, boolean> | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('user_extensions')
    .select('slug, enabled')
    .eq('user_id', userId);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('fetchUserExtensions: migration 026 not applied yet — extensions latched off.');
      return null;
    }
    throw error;
  }
  return Object.fromEntries(
    (data as { slug: string; enabled: boolean }[]).map((row) => [row.slug, row.enabled]),
  );
}

/**
 * Per-extension settings (user_extensions.config), keyed by slug.
 *
 * A SEPARATE call from fetchUserExtensions rather than a wider select on it,
 * deliberately. That function's `Record<string, boolean> | null` return is the
 * availability latch the extensions store gates every write on, and widening it
 * would mean re-deriving "is the table there" from a different shape at the one
 * place that must never get it wrong. The two run in the same Promise.all, so
 * the extra call costs no wall-clock.
 *
 * Same missing-table contract as its sibling: null means "not deployed".
 */
export async function fetchUserExtensionConfigs(
  userId: string,
  client?: DbClient,
): Promise<Record<string, Record<string, unknown>> | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('user_extensions')
    .select('slug, config')
    .eq('user_id', userId);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw error;
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const row of data as { slug: string; config: unknown }[]) {
    if (row.config && typeof row.config === 'object') {
      out[row.slug] = row.config as Record<string, unknown>;
    }
  }
  return out;
}

/**
 * Replace one extension's config blob.
 *
 * Whole-object, not a merge: the caller (the store) already holds the merged
 * value, and a server-side merge would need a read-modify-write that races the
 * next keystroke. `enabled` is omitted from the upsert payload on purpose — the
 * column has a DB default of false, so naming it here would silently switch an
 * extension OFF whenever someone edited its settings before toggling it on.
 */
export async function setUserExtensionConfig(
  userId: string,
  slug: string,
  config: Record<string, unknown>,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('user_extensions')
    .upsert({ user_id: userId, slug, config }, { onConflict: 'user_id,slug', ignoreDuplicates: false });
  if (error) throw error;
}

export async function setUserExtensionEnabled(
  userId: string,
  slug: string,
  enabled: boolean,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('user_extensions')
    .upsert({ user_id: userId, slug, enabled }, { onConflict: 'user_id,slug' });
  if (error) throw error;
}

// ---- Programs & routines (migration 024) ----
//
// Two container kinds that gate VISIBILITY rather than describe an item, plus
// their membership join tables. Deliberately unlike projects/habit_groups in
// two ways: members are referenced by id (name references are why renaming
// those is still parked), and membership is many-to-many.
//
// No webhook notifications, unlike createProject/createHabitGroup below. The
// event-name enum is closed and notifyPlugins silently DROPS names a plugin
// never registered, so a 'programs.updated' would go nowhere; and a synthetic
// tasks.updated nudge is equally dead, because every write here is
// browser-initiated while the plugin registry is an in-memory Map that only
// ever exists server-side. Deployed plugins refresh on their own ~5-minute
// TTL. See plan decision 6.
//
// Like fetchItemTypes, the fetches return null (not []) when the migration
// isn't applied yet, so the store can gate the WRITE path too — a pre-migration
// create would otherwise appear to succeed and vanish on reload.

/**
 * A missing table means "migration 024 hasn't been applied here" — return null
 * so the store can gate the whole feature off, the fetchItemTypes contract.
 * ANY OTHER error rethrows: a transient network blip or an RLS misconfiguration
 * must not be indistinguishable from "the feature does not exist", because the
 * null latches the feature off (including its write path) until a reload. This
 * discriminates on the error code the way missingEventsTable already does,
 * rather than the looser catch-all fetchItemTypes uses.
 */
function unavailable(fn: string, error: { code?: string; message?: string }): null {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    console.warn(`${fn}: migration 024 not applied yet — programs/routines disabled.`);
    return null;
  }
  // Anything else rethrows, and from Phase 2 that propagates out of
  // initializeStore's Promise.all and fails the WHOLE load — deliberately.
  //
  // Swallowing it looks kinder and is the dangerous option: routines would
  // arrive empty, every member of a paused routine would resolve as live, and
  // the auto-age sweep would see a pile of suddenly-unprotected overdue items
  // and unschedule them in one batch. Failing the load instead sets `error`,
  // which is one of the sweep's own gates (use-overdue-sweep.ts:147), so a
  // transient blip costs a retry rather than a silent mass-unschedule.
  throw error;
}

interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  paused_at?: string | null;
  paused_until?: string | null;
  sort_order?: number | null;
}

interface ProgramRow {
  id: string;
  user_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  state: string;
  starts_on?: string | null;
  ends_on?: string | null;
  sort_order?: number | null;
  /** Trigger-maintained; read-only here. See ProgramSchema.updatedAt. */
  updated_at?: string | null;
}

/**
 * Reconcile one membership join table against the desired member list.
 *
 * Membership arrives from the app as an array on the container (routine.itemIds
 * and friends) but lives normalized in the DB, so a container "update" carrying
 * members is a set difference, not a column write — a column-mapper-style
 * update would silently drop the key and undo of a membership change would
 * never reach the DB.
 */
async function reconcileMembership(
  supabase: DbClient,
  table: string,
  ownerCol: string,
  ownerId: string,
  memberCol: string,
  userId: string,
  desired: string[],
  ordered = false,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select(memberCol)
    .eq(ownerCol, ownerId)
    .eq('user_id', userId);
  if (error) throw error;

  const current = new Set((data as Record<string, string>[] ?? []).map((r) => r[memberCol]));
  // Dedupe before building rows: a repeated id makes Postgres abort the whole
  // statement with 21000 ("ON CONFLICT DO UPDATE command cannot affect row a
  // second time"), and a multi-add UI can produce one trivially.
  const members = [...new Set(desired)];
  const desiredSet = new Set(members);
  const removed = [...current].filter((id) => !desiredSet.has(id));

  // Additions BEFORE removals. The two sets are disjoint by construction
  // (removed = current \ desired), so the order can never cause a collision —
  // but PostgREST gives no cross-request transaction, so if the second
  // statement never runs, this ordering leaves a SUPERSET of the intended
  // membership (visible in the manager, removable by the user) rather than
  // silently dropping members the user asked to keep.
  if (members.length > 0) {
    // Upsert rather than insert-the-difference: it adds new members AND
    // rewrites sort_order for existing ones in one statement, so a reorder
    // costs the same as an add.
    const rows = members.map((memberId, i) => ({
      [ownerCol]: ownerId,
      [memberCol]: memberId,
      user_id: userId,
      ...(ordered ? { sort_order: i } : {}),
    }));
    const onConflict = `${ownerCol},${memberCol}`;
    const { error: upsertError } = await supabase.from(table).upsert(rows, { onConflict });
    if (upsertError) {
      // Exactly ONE failure class is a per-row casualty worth surviving: a
      // member hard-purged since the store last read it (23503), which an undo
      // replaying a membership snapshot hits when the item left the 30-day
      // trash meanwhile. Everything else — RLS denial, missing table, bad
      // uuid, transport — is systemic and MUST surface, or the caller's
      // optimistic state silently diverges until the next reload.
      // (23505 is unreachable here: upsert resolves a PK conflict to an UPDATE,
      // and these tables carry no other unique constraint.)
      if (upsertError.code !== '23503') throw upsertError;
      for (const row of rows) {
        const { error: rowError } = await supabase.from(table).upsert(row, { onConflict });
        if (!rowError) continue;
        if (rowError.code !== '23503') throw rowError;
        console.warn(`${table}: member no longer exists, membership skipped`, row);
      }
    }
  }

  if (removed.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq(ownerCol, ownerId)
      .eq('user_id', userId)
      .in(memberCol, removed);
    if (deleteError) throw deleteError;
  }
}

export async function fetchRoutines(userId: string, client?: DbClient): Promise<Routine[] | null> {
  const supabase = client ?? createClient();
  const [routines, members] = await Promise.all([
    supabase
      .from('routines')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('routine_items')
      .select('routine_id, item_id, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      // Tiebreak: heap order is unspecified, so without this a future writer
      // that leaves sort_order null yields a member list that reshuffles
      // between reloads — which reads to a membership diff as a real change.
      .order('item_id', { ascending: true }),
  ]);
  const error = routines.error ?? members.error;
  if (error) return unavailable('fetchRoutines', error);
  const itemIdsByRoutine = new Map<string, string[]>();
  for (const row of (members.data ?? []) as { routine_id: string; item_id: string }[]) {
    const list = itemIdsByRoutine.get(row.routine_id);
    if (list) list.push(row.item_id);
    else itemIdsByRoutine.set(row.routine_id, [row.item_id]);
  }
  return (routines.data as RoutineRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    pausedUntil: row.paused_until ?? undefined,
    sortOrder: row.sort_order ?? undefined,
    itemIds: itemIdsByRoutine.get(row.id) ?? [],
  }));
}

export async function createRoutine(userId: string, routine: Routine, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('routines').insert({
    id: routine.id,
    user_id: userId,
    name: routine.name,
    icon: routine.icon ?? null,
    color: routine.color ?? null,
    paused_at: routine.pausedAt ?? null,
    paused_until: routine.pausedUntil ?? null,
    sort_order: routine.sortOrder ?? null,
  });
  if (error) throw error;
  if (routine.itemIds.length > 0) {
    try {
      await reconcileMembership(
        supabase, 'routine_items', 'routine_id', routine.id, 'item_id', userId, routine.itemIds, true,
      );
    } catch (membershipError) {
      // The container row is already committed and PostgREST offers no
      // cross-request transaction, so compensate by hand rather than leaving a
      // routine the user never asked for. Hard delete, not soft: as far as
      // anyone outside this function is concerned it never existed.
      await supabase.from('routines').delete().eq('id', routine.id).eq('user_id', userId);
      throw membershipError;
    }
  }
}

export async function updateRoutine(
  userId: string,
  id: string,
  updates: Partial<Routine>,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('icon' in updates) row.icon = updates.icon ?? null;
  if ('color' in updates) row.color = updates.color ?? null;
  if ('pausedAt' in updates) row.paused_at = updates.pausedAt ?? null;
  if ('pausedUntil' in updates) row.paused_until = updates.pausedUntil ?? null;
  if ('sortOrder' in updates) row.sort_order = updates.sortOrder ?? null;
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('routines').update(row).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }
  if (updates.itemIds) {
    await reconcileMembership(
      supabase, 'routine_items', 'routine_id', id, 'item_id', userId, updates.itemIds, true,
    );
  }
}

export async function deleteRoutine(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  // Soft delete only: membership rows deliberately survive so a restore within
  // the 30-day window brings the routine back intact. The resolver ignores
  // trashed containers, so the suppression they caused lifts meanwhile.
  const { error } = await supabase
    .from('routines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function restoreRoutine(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('routines')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchPrograms(userId: string, client?: DbClient): Promise<Program[] | null> {
  const supabase = client ?? createClient();
  const [programs, itemMembers, routineMembers] = await Promise.all([
    supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    // Program membership carries no sort_order (only routines order their
    // members), so sort by the member id purely for stability — see the
    // routine_items tiebreak above.
    supabase
      .from('program_items')
      .select('program_id, item_id')
      .eq('user_id', userId)
      .order('item_id', { ascending: true }),
    supabase
      .from('program_routines')
      .select('program_id, routine_id')
      .eq('user_id', userId)
      .order('routine_id', { ascending: true }),
  ]);
  const error = programs.error ?? itemMembers.error ?? routineMembers.error;
  if (error) return unavailable('fetchPrograms', error);
  const groupBy = (rows: Record<string, string>[], key: string) => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.program_id);
      if (list) list.push(row[key]);
      else map.set(row.program_id, [row[key]]);
    }
    return map;
  };
  const itemIdsByProgram = groupBy((itemMembers.data ?? []) as Record<string, string>[], 'item_id');
  const routineIdsByProgram = groupBy((routineMembers.data ?? []) as Record<string, string>[], 'routine_id');
  return (programs.data as ProgramRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    state: row.state as Program['state'],
    startsOn: row.starts_on ?? undefined,
    endsOn: row.ends_on ?? undefined,
    sortOrder: row.sort_order ?? undefined,
    itemIds: itemIdsByProgram.get(row.id) ?? [],
    routineIds: routineIdsByProgram.get(row.id) ?? [],
    updatedAt: row.updated_at ?? undefined,
  }));
}

export async function createProgram(userId: string, program: Program, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('programs').insert({
    id: program.id,
    user_id: userId,
    name: program.name,
    icon: program.icon ?? null,
    color: program.color ?? null,
    state: program.state,
    starts_on: program.startsOn ?? null,
    ends_on: program.endsOn ?? null,
    sort_order: program.sortOrder ?? null,
  });
  if (error) throw error;
  try {
    if (program.itemIds.length > 0) {
      await reconcileMembership(
        supabase, 'program_items', 'program_id', program.id, 'item_id', userId, program.itemIds,
      );
    }
    if (program.routineIds.length > 0) {
      await reconcileMembership(
        supabase, 'program_routines', 'program_id', program.id, 'routine_id', userId, program.routineIds,
      );
    }
  } catch (membershipError) {
    // See createRoutine. Both reconciles sit inside one try because the second
    // failing must also undo the first — the join rows go with the container
    // by CASCADE, so deleting it is enough.
    await supabase.from('programs').delete().eq('id', program.id).eq('user_id', userId);
    throw membershipError;
  }
}

export async function updateProgram(
  userId: string,
  id: string,
  updates: Partial<Program>,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('icon' in updates) row.icon = updates.icon ?? null;
  if ('color' in updates) row.color = updates.color ?? null;
  if ('state' in updates && updates.state != null) row.state = updates.state;
  if ('startsOn' in updates) row.starts_on = updates.startsOn ?? null;
  if ('endsOn' in updates) row.ends_on = updates.endsOn ?? null;
  if ('sortOrder' in updates) row.sort_order = updates.sortOrder ?? null;
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('programs').update(row).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }
  if (updates.itemIds) {
    await reconcileMembership(
      supabase, 'program_items', 'program_id', id, 'item_id', userId, updates.itemIds,
    );
  }
  if (updates.routineIds) {
    await reconcileMembership(
      supabase, 'program_routines', 'program_id', id, 'routine_id', userId, updates.routineIds,
    );
  }
}

export async function deleteProgram(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('programs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function restoreProgram(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('programs')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ---- Legacy task-named projections ----

// The `type` discriminator is stripped at runtime, not just in the type system:
// these objects flow into the pinned GET /api/agent/context response, which
// must stay byte-shape-identical to the pre-unification contract.
export function toLegacyTask(item: TaskItem): Task {
  const { type: _type, ...task } = item;
  return task;
}

export function toLegacyHabit(item: HabitItem): Habit {
  const { type: _type, ...habit } = item;
  return habit;
}

export async function fetchTasks(userId: string, client?: DbClient): Promise<Task[]> {
  const items = await fetchItems(userId, 'task', client);
  return items.filter((i): i is TaskItem => i.type === 'task').map(toLegacyTask);
}

export async function createTask(userId: string, task: Task, client?: DbClient): Promise<void> {
  return createItem(userId, { ...task, type: 'task' }, client);
}

export async function updateTask(id: string, updates: Partial<Task>, userId?: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const resolved = await withResolvedUpdate(supabase, 'task', updates as Record<string, unknown>, userId);
  return updateItem(id, 'task', resolved as Partial<Task>, userId, supabase);
}

export async function deleteTask(id: string, userId?: string, client?: DbClient): Promise<void> {
  return deleteItem(id, 'task', userId, client);
}

export async function restoreTask(id: string, client?: DbClient): Promise<void> {
  return restoreItem(id, 'task', client);
}

export async function dbToggleTaskCompletedDate(id: string, dateStr: string): Promise<void> {
  return toggleItemCompletedDate(id, 'task', dateStr);
}

// ---- Legacy habit-named projections ----

export async function fetchHabits(userId: string, client?: DbClient): Promise<Habit[]> {
  const items = await fetchItems(userId, 'habit', client);
  return items.filter((i): i is HabitItem => i.type === 'habit').map(toLegacyHabit);
}

export async function createHabit(userId: string, habit: Habit, client?: DbClient): Promise<void> {
  return createItem(userId, { ...habit, type: 'habit' }, client);
}

export async function updateHabit(id: string, updates: Partial<Habit>, userId?: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const resolved = await withResolvedUpdate(supabase, 'habit', updates as Record<string, unknown>, userId);
  return updateItem(id, 'habit', resolved as Partial<Habit>, userId, supabase);
}

export async function deleteHabit(id: string, userId?: string, client?: DbClient): Promise<void> {
  return deleteItem(id, 'habit', userId, client);
}

export async function restoreHabit(id: string, client?: DbClient): Promise<void> {
  return restoreItem(id, 'habit', client);
}

// ---- Project row type ----
interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color?: string | null;
  repeat_frequency?: string | null;
  repeat_days?: number[] | null;
  repeat_month_day?: number | null;
  time_bucket?: string | null;
  start_time?: string | null;
  duration?: number | null;
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color ?? undefined,
    repeatFrequency: (row.repeat_frequency ?? undefined) as Project['repeatFrequency'],
    repeatDays: row.repeat_days ?? undefined,
    repeatMonthDay: row.repeat_month_day ?? undefined,
    timeBucket: (row.time_bucket ?? undefined) as Project['timeBucket'],
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
  };
}

function projectToRow(userId: string, project: Project): ProjectRow {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    emoji: project.emoji,
    color: project.color ?? null,
    repeat_frequency: project.repeatFrequency ?? null,
    repeat_days: project.repeatDays ?? null,
    repeat_month_day: project.repeatMonthDay ?? null,
    time_bucket: project.timeBucket ?? null,
    start_time: project.startTime ?? null,
    duration: project.duration ?? null,
  };
}

function projectUpdatesToRow(updates: Partial<Project>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('emoji' in updates) row.emoji = updates.emoji;
  if ('color' in updates) row.color = updates.color ?? null;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency ?? null;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  return row;
}

export async function fetchProjects(userId: string, client?: DbClient): Promise<Project[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as ProjectRow[]).map(projectFromRow);
}

export async function createProject(userId: string, project: Project, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').insert(projectToRow(userId, project));
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'create', project });
}

export async function updateProject(userId: string, id: string, updates: Partial<Project>, client?: DbClient): Promise<void> {
  const row = projectUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').update(row).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'update', id, updates });
}

/**
 * Fan a rename out to the members' NAME column, keyed on the id (027).
 *
 * This is the whole point of Phase 0. Before the id existed, renaming a
 * container left every member holding the old string with nothing to resolve it
 * by, so the rename silently emptied the container — and the Organize console
 * turns renaming into a one-keystroke action.
 *
 * Keyed on project_id, never on the old name: a member whose text drifted (an
 * agent write, a half-applied earlier rename) still follows, and an item that
 * merely happens to share the old name but belongs to no row does not get
 * dragged along.
 *
 * Deliberately NOT filtered on deleted_at. A soft-deleted member is still a
 * member — it can come back out of the Trash, and it should come back holding
 * the container's current name rather than the one it had when it was deleted.
 */
export async function renameContainerMembers(
  userId: string,
  column: 'project_id' | 'group_id',
  id: string,
  name: string,
  client?: DbClient,
): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('items')
    .update({ [column === 'project_id' ? 'project' : 'group']: name })
    .eq('user_id', userId)
    .eq(column, id);
  if (error) throw error;
}

export async function deleteProject(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'delete', id });
}

// Restore by id, not name — names are mutable (rename) so a name-keyed
// restore silently no-ops against a renamed row.
//
// `client?` matches every other restore* and, more to the point, matches
// deleteProject directly above — which app/api/agent/projects/[id]/route.ts
// already calls with a serviceClient. Without the parameter, the obvious way to
// write a restore endpoint (copy the DELETE handler) passes a third argument
// that tsc rejects and `ignoreBuildErrors` waves through; the transpiled call
// then drops it, the anon client has no session, RLS matches zero rows, and
// PostgREST returns 204 with no error. The restore reports success and the row
// stays in the bin.
export async function restoreProject(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}

// ---- HabitGroup row type ----
interface HabitGroupRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color?: string | null;
}

function habitGroupFromRow(row: HabitGroupRow): HabitGroupType {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color ?? undefined,
  };
}

function habitGroupToRow(userId: string, group: HabitGroupType): HabitGroupRow {
  return {
    id: group.id,
    user_id: userId,
    name: group.name,
    emoji: group.emoji,
    color: group.color ?? null,
  };
}

function habitGroupUpdatesToRow(updates: Partial<HabitGroupType>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('emoji' in updates) row.emoji = updates.emoji;
  if ('color' in updates) row.color = updates.color ?? null;
  return row;
}

export async function fetchHabitGroups(userId: string, client?: DbClient): Promise<HabitGroupType[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('habit_groups')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as HabitGroupRow[]).map(habitGroupFromRow);
}

export async function createHabitGroup(userId: string, group: HabitGroupType, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').insert(habitGroupToRow(userId, group));
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'create', group });
}

export async function updateHabitGroup(userId: string, id: string, updates: Partial<HabitGroupType>, client?: DbClient): Promise<void> {
  const row = habitGroupUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').update(row).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'update', id, updates });
}

export async function deleteHabitGroup(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'delete', id });
}

/** See restoreProject on why `client?` is not optional-in-spirit. */
export async function restoreHabitGroup(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('habit_groups')
    .update({ deleted_at: null })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// The Trash (Organize console, Phase 4)
// ============================================================

export type TrashKind = 'item' | 'project' | 'group' | 'routine' | 'program';

/**
 * One row of the bin: what it is, what it was called, when it went, and the
 * whole entity ready to put back.
 *
 * DELIBERATELY NOT A SHARED SCHEMA. The plan said `packages/types` gains
 * `deletedAt?: string`; it should not, and the reasons compound:
 *
 *  - `TASK_FIELDS` is `Object.keys(taskShape)`, and that list drives BOTH
 *    `diffItem` and `tests/unit/db-allowlists.test.ts`. Adding the field turns
 *    the suite red ("TASK_FIELDS includes 'deletedAt' but taskUpdatesToRow
 *    drops it"), and the natural way to make it green — teaching
 *    `taskUpdatesToRow` the column — hands undo the ability to write
 *    `deleted_at`. A snapshot holding a stale stamp would then soft-delete a
 *    LIVE item on some later unrelated undo, invisibly, with the 30-day purge
 *    clock already part-spent.
 *  - Nothing would ever read it. `fetchItems` filters `.is('deleted_at', null)`
 *    and is the only producer of `Item[]` and of the frozen `tasks[]`/`habits[]`
 *    legacy projections, so the field would be permanently undefined in every
 *    Task the app or the OpenClaw plugin has ever seen.
 *  - `Program.updatedAt` is the in-repo precedent for exactly this trap, and it
 *    is kept OUT of `updateProgram`'s allowlist for exactly this reason.
 *
 * So the timestamp lives here, in the one file that has to own this anyway:
 * every row mapper it needs (`itemFromRow`, `projectFromRow`,
 * `habitGroupFromRow`, and the private `RoutineRow`/`ProgramRow`) is
 * module-private. `entity` is a clean, live-shaped object — it never carries a
 * deletion stamp, so nothing a restore hands the store can enter a snapshot and
 * come back as a write.
 */
export interface TrashEntry {
  kind: TrashKind;
  id: string;
  /** The item's title, or the container's name. */
  name: string;
  deletedAt: string;
  /** Containers store a glyph token; items do not. */
  icon?: string;
  color?: string;
  /**
   * The subtasks in the bin under this parent, which come back with it.
   *
   * Carried whole rather than counted, because the store has to seat them in
   * the same set() the parent lands in — the DB cascade puts them back, and an
   * in-session restore showing a parent with an empty checklist until the next
   * reload would read as the subtasks having been lost.
   */
  children?: Item[];
  /**
   * For a project or a habit group: the LIVE items still pointing at it by id.
   *
   * `removeProject`/`removeHabitGroup` clear the member's half in the store and
   * write nothing to `items`, so the DB link survives the delete on purpose
   * (027: "pointing a member at its soft-deleted container is what lets a Trash
   * restore reconnect the members it had"). The store has no record of them by
   * then, so the reconnection has to be read back out of the database here.
   */
  memberIds?: string[];
  entity: Item | Project | HabitGroupType | Routine | Program;
}

/** A row shape plus the stamp `select('*')` returns but the interface omits. */
type Trashed<T> = T & { deleted_at: string };

/**
 * Everything in the bin, newest first.
 *
 * A union across five tables rather than one view, because each needs its own
 * mapper and two of them need their membership joined — and that second part is
 * the load-bearing one.
 *
 * MEMBERSHIP IS NOT OPTIONAL HERE. `itemIds`/`routineIds` are not columns;
 * `fetchRoutines` assembles them from `routine_items`, and it hard-filters
 * `deleted_at`, so a trashed routine has no other source for them anywhere in
 * the codebase. Hand the store `{...routine, itemIds: []}` and the console's
 * member list treats that empty array as truth: `reconcileMembership` writes
 * membership ABSOLUTELY (`removed = current \ desired`), so the first member
 * added back — or a plain redo, which replays the full shape — issues a hard
 * DELETE of every join row. Those rows are the entire reason `deleteRoutine` is
 * a soft delete: "membership rows deliberately survive so a restore within the
 * 30-day window brings the routine back intact." A restore that hydrates them
 * empty would destroy the guarantee it exists to honour, permanently, with no
 * soft delete to recover from.
 *
 * SUBTASKS DO NOT GET THEIR OWN ROW when their parent is in the bin too. One
 * delete would otherwise deposit N+1 near-identical lines, and restoring the
 * child alone puts it nowhere a user can see — subtasks are excluded from the
 * `tasks` projection every canvas surface reads, and its parent is still
 * trashed. Every row here is one restorable unit that lands somewhere visible.
 * A subtask deleted on its own, under a live parent, keeps its row.
 *
 * The skip and the roll-up ask ONE question between them ("is the parent in the
 * bin"), so every trashed item appears in exactly one row. Keying either of
 * them on `deleted_at` equality is what produced a bin with an invisible
 * corner — see restoreItem.
 */
export async function listDeleted(
  userId: string,
  // 500 rather than 100, and the number is picked against the FILTER rather
  // than the list. The bin's search runs client-side over what this returned,
  // so anything past the cap is not merely below the fold — it is unfindable,
  // and a recovery surface that cannot find a thing is telling you it is gone.
  // The largest live account holds 63 trashed items; 500 puts the cap out of
  // reach of a personal planner's 30-day window while still bounding the query.
  // If it is ever hit for real, the answer is a date-ranged fetch, not a bigger
  // number — a paginated bin is a bin you have to hunt through twice.
  limit = 500,
  client?: DbClient,
): Promise<TrashEntry[]> {
  const supabase = client ?? createClient();
  const deleted = (q: DbClient) => q.eq('user_id', userId).not('deleted_at', 'is', null);

  const [initialItems, projects, groups, routines, routineMembers, programs, programItems, programRoutines] =
    await Promise.all([
      // Windowed like every other full-item read (031). Deliberately the SAME
      // relation as fetchItems: a bin serving untrimmed arrays while the live
      // store holds trimmed ones would put two shapes of the same item in one
      // store, and a restore-then-undo would diff them against each other.
      deleted(itemsReadFrom(supabase).select('*')).order('deleted_at', { ascending: false }),
      deleted(supabase.from('projects').select('*')).order('deleted_at', { ascending: false }),
      deleted(supabase.from('habit_groups').select('*')).order('deleted_at', { ascending: false }),
      deleted(supabase.from('routines').select('*')).order('deleted_at', { ascending: false }),
      supabase.from('routine_items').select('routine_id, item_id, sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('item_id', { ascending: true }),
      deleted(supabase.from('programs').select('*')).order('deleted_at', { ascending: false }),
      supabase.from('program_items').select('program_id, item_id')
        .eq('user_id', userId).order('item_id', { ascending: true }),
      supabase.from('program_routines').select('program_id, routine_id')
        .eq('user_id', userId).order('routine_id', { ascending: true }),
    ]);

  // The view may simply not be deployed yet (see itemsReadFrom). Latch and retry
  // the one query that used it, rather than failing a bin whose other seven
  // queries succeeded.
  let items = initialItems;
  if (missingItemsWindow(items.error) && itemsWindowAvailable) {
    itemsWindowAvailable = false;
    items = await deleted(itemsReadFrom(supabase).select('*'))
      .order('deleted_at', { ascending: false });
  }

  // One failure fails the lot. A partial bin is worse than an error: a user
  // hunting for a deleted routine would find a Trash that renders happily
  // without it and conclude it is gone for good.
  const failure =
    items.error ?? projects.error ?? groups.error ?? routines.error ??
    routineMembers.error ?? programs.error ?? programItems.error ?? programRoutines.error;
  if (failure) throw failure;

  const itemRows = (items.data ?? []) as Trashed<ItemRow>[];
  const trashedIds = new Set(itemRows.map((r) => r.id));

  const groupIds = (rows: Record<string, string>[], owner: string, member: string) => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row[owner]);
      if (list) list.push(row[member]);
      else map.set(row[owner], [row[member]]);
    }
    return map;
  };
  const itemsByRoutine = groupIds((routineMembers.data ?? []) as Record<string, string>[], 'routine_id', 'item_id');
  const itemsByProgram = groupIds((programItems.data ?? []) as Record<string, string>[], 'program_id', 'item_id');
  const routinesByProgram = groupIds((programRoutines.data ?? []) as Record<string, string>[], 'program_id', 'routine_id');

  const entries: TrashEntry[] = [];

  for (const row of itemRows) {
    // A child whose parent is also in the bin travels with the parent.
    if (row.parent_item_id && trashedIds.has(row.parent_item_id)) continue;
    // THE SAME PREDICATE, negated — and that is the point. These two lines used
    // to disagree: the skip asked "is the parent trashed" while the roll-up
    // asked "was it trashed at the same instant", so a subtask binned before its
    // parent satisfied the first and failed the second and rendered in NO row
    // at all. Complementary by construction now, so no item in the bin can be
    // invisible in it. See restoreItem for why the timestamp went.
    const children = itemRows.filter((c) => c.parent_item_id === row.id);
    entries.push({
      kind: 'item',
      id: row.id,
      name: row.title,
      deletedAt: row.deleted_at,
      ...(children.length > 0 && { children: children.map(itemFromRow) }),
      entity: itemFromRow(row),
    });
  }

  const projectRows = (projects.data ?? []) as Trashed<ProjectRow>[];
  const groupRows = (groups.data ?? []) as Trashed<HabitGroupRow>[];

  // A second round trip rather than a column on the first: scoped by `in` to
  // the handful of trashed container ids, so it reads a few rows rather than
  // every live item the account owns.
  const membersOf = async (column: 'project_id' | 'group_id', ids: string[]) => {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    const { data, error } = await supabase
      .from('items')
      .select(`id, ${column}`)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in(column, ids);
    // Empty on failure, not a throw: losing the reconnection degrades a restore
    // to today's behaviour (the members come back on the next reload, because
    // the DB link is untouched either way). Losing the whole Trash does not.
    if (error) return map;
    for (const row of (data ?? []) as Record<string, string>[]) {
      const owner = row[column];
      const list = map.get(owner);
      if (list) list.push(row.id);
      else map.set(owner, [row.id]);
    }
    return map;
  };
  const [projectMembers, groupMembers] = await Promise.all([
    membersOf('project_id', projectRows.map((r) => r.id)),
    membersOf('group_id', groupRows.map((r) => r.id)),
  ]);

  for (const row of projectRows) {
    entries.push({
      kind: 'project', id: row.id, name: row.name, deletedAt: row.deleted_at,
      icon: row.emoji, color: row.color ?? undefined,
      memberIds: projectMembers.get(row.id) ?? [],
      entity: projectFromRow(row),
    });
  }

  for (const row of groupRows) {
    entries.push({
      kind: 'group', id: row.id, name: row.name, deletedAt: row.deleted_at,
      icon: row.emoji, color: row.color ?? undefined,
      memberIds: groupMembers.get(row.id) ?? [],
      entity: habitGroupFromRow(row),
    });
  }

  for (const row of (routines.data ?? []) as Trashed<RoutineRow>[]) {
    entries.push({
      kind: 'routine', id: row.id, name: row.name, deletedAt: row.deleted_at,
      icon: row.icon ?? undefined, color: row.color ?? undefined,
      entity: {
        id: row.id,
        name: row.name,
        icon: row.icon ?? undefined,
        color: row.color ?? undefined,
        pausedAt: row.paused_at ?? undefined,
        pausedUntil: row.paused_until ?? undefined,
        sortOrder: row.sort_order ?? undefined,
        itemIds: itemsByRoutine.get(row.id) ?? [],
      },
    });
  }

  for (const row of (programs.data ?? []) as Trashed<ProgramRow>[]) {
    entries.push({
      kind: 'program', id: row.id, name: row.name, deletedAt: row.deleted_at,
      icon: row.icon ?? undefined, color: row.color ?? undefined,
      entity: {
        id: row.id,
        name: row.name,
        icon: row.icon ?? undefined,
        color: row.color ?? undefined,
        state: row.state as Program['state'],
        startsOn: row.starts_on ?? undefined,
        endsOn: row.ends_on ?? undefined,
        sortOrder: row.sort_order ?? undefined,
        itemIds: itemsByProgram.get(row.id) ?? [],
        routineIds: routinesByProgram.get(row.id) ?? [],
        updatedAt: row.updated_at ?? undefined,
      },
    });
  }

  // Sorted across the five tables, then capped — the per-table `order` above
  // only makes each slice internally newest-first. Capping BEFORE the merge
  // would silently hide a routine deleted a minute ago behind a hundred older
  // items.
  entries.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
  return entries.slice(0, limit);
}

/**
 * The names a container cannot take, because a trashed row is still holding
 * them.
 *
 * `projects_user_id_name_key` and `habit_groups_user_id_name_key` are PLAIN
 * unique indexes — no `WHERE deleted_at IS NULL` — so a deleted container
 * reserves its name for the full 30 days while being invisible to the store,
 * whose `projects`/`habitGroups` arrays come from `deleted_at`-filtered
 * fetches. That gap is a live bug on both the rename and the create path, and
 * the create half is the louder one: `addProject` de-dupes against live rows,
 * passes, `set()`s optimistically, and only THEN does the insert 23505 into a
 * `.catch(console.error)`. The user gets a project that opens, accepts a
 * colour, a glyph and a time block — all `.eq('id', …)` updates matching zero
 * rows — and every item filed into it fails its own write on
 * `items_project_id_fkey`. The whole thing evaporates on reload with nothing
 * shown anywhere.
 *
 * Rows rather than a Set of strings, because the console can then do more than
 * refuse: it names the holder, and the Trash is one rail row away.
 *
 * The NAMES ARE RETURNED AS STORED, deliberately. The index is case-SENSITIVE
 * (plain `text`, no `citext`, no lower() expression), so only an exact repeat
 * actually collides — a fold-only guard would refuse "work" against a trashed
 * "Work", a name Postgres would have accepted. The caller decides which
 * comparison each path needs; this just reports what is in the bin.
 */
export async function fetchTrashedNames(
  userId: string,
  client?: DbClient,
): Promise<{ projects: TrashedName[]; groups: TrashedName[] }> {
  const supabase = client ?? createClient();
  const read = async (table: 'projects' | 'habit_groups') => {
    const { data, error } = await supabase
      .from(table)
      .select('id, name')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null);
    // Empty on failure, never a throw: this guard exists to IMPROVE a create,
    // and a lookup outage must not become the thing that prevents one. Failing
    // open lands back on today's behaviour, which is the bug — but a bug that
    // only reappears when the network does, rather than a dead create row.
    if (error) return [];
    return (data ?? []) as TrashedName[];
  };
  const [projects, groups] = await Promise.all([read('projects'), read('habit_groups')]);
  return { projects, groups };
}

export interface TrashedName {
  id: string;
  name: string;
}

/* ── first-run container seeding (Phase 6) ─────────────────────────────── */

/**
 * Has this account already been considered for seeding?
 *
 * FAILS CLOSED — a read that did not work answers `true`, i.e. "already
 * seeded", which is the opposite of {@link fetchTrashedNames}'s fail-open and
 * for the opposite reason. There, a failed lookup costs a refusal the user can
 * work around. Here it would cost an automatic INSERT of containers into an
 * account whose state we could not read: a transient failure during a token
 * refresh would duplicate someone's starter set, and the second copy is
 * indistinguishable from rows they made themselves.
 *
 * `maybeSingle`, not `single`: `single()` errors with PGRST116 on zero rows,
 * which is exactly the brand-new account this feature exists for, and would
 * make it permanently unseedable. The same trap is documented on
 * isOnboardingComplete.
 */
export async function fetchContainersSeeded(
  userId: string,
  client?: DbClient,
): Promise<boolean> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('containers_seeded')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return true;
  return data?.containers_seeded ?? false;
}

/**
 * Latch the account as considered.
 *
 * Upsert rather than update: a brand-new account has no `user_settings` row at
 * all until something writes one, and an UPDATE matching zero rows reports
 * success — so the latch would silently never set and the seed would run again
 * on every load, stacking a fresh starter set each time.
 *
 * THROWS. Every other write in this module that nobody awaits swallows into a
 * console line; this one must not, because the caller's correctness depends on
 * knowing whether the latch is down. See seedStarterContainers, which sets the
 * latch BEFORE creating anything for the same reason.
 */
export async function markContainersSeeded(userId: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, containers_seeded: true }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Link existing items to a container that has just been created for the name
 * they were already carrying — 027's backfill, re-run for one container.
 *
 * 027 says in its own comments that this has to happen: its backfill left 119
 * group references NULL because the groups they name have only ever existed as a
 * client-side constant, and it is written re-runnable so that whatever creates
 * those rows can adopt them. A migration cannot do it, because the rows are
 * created by the app at an arbitrary later moment.
 *
 * `is null` on the id column is what makes this safe to call on any container,
 * including one the user creates by hand with a name that happens to match: it
 * only ever fills a blank, never re-points a member that already resolves.
 */
export async function adoptContainerMembers(
  userId: string,
  column: 'project_id' | 'group_id',
  id: string,
  name: string,
  client?: DbClient,
): Promise<number> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('items')
    .update({ [column]: id })
    .eq('user_id', userId)
    .is(column, null)
    .eq(column === 'project_id' ? 'project' : 'group', name)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
