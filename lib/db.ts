import { createClient } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;
import type { Task, Habit, Item, ItemTypeDef, TaskItem, HabitItem, Project, HabitGroupType } from './planner-types';
import { ITEM_TYPES, getItemTypeConfig } from './item-registry';
import { notifyPlugins } from './openclaw-registry';

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
    };
  }
  if (row.type === 'habit') {
    return {
      type: 'habit',
      id: row.id,
      title: row.title,
      group: row.group ?? '',
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
    };
  }
  return {
    type: 'task',
    id: row.id,
    title: row.title,
    priority: (row.priority ?? undefined) as Task['priority'],
    project: row.project ?? undefined,
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
  };
}

// Per-type update allowlists — these are the ONLY field filter for the agent
// PATCH endpoints (bodies are unvalidated), so they must stay separate: a
// merged list would let habit fields be written onto tasks and vice versa.
// Fields the legacy tables declared NOT NULL keep that semantics via null
// guards here — the unified table is nullable-superset, so without the guard
// a PATCH {"group": null} would silently corrupt instead of erroring.
function taskUpdatesToRow(updates: Partial<Task>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('priority' in updates) row.priority = updates.priority ?? null;
  if ('project' in updates) row.project = updates.project ?? null;
  if ('startDate' in updates) row.start_date = updates.startDate ?? null;
  if ('status' in updates) row.status = updates.status;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  if ('isScheduled' in updates && updates.isScheduled != null) row.is_scheduled = updates.isScheduled;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency ?? null;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('completedDates' in updates) row.completed_dates = updates.completedDates ?? [];
  if ('skippedDates' in updates) row.skipped_dates = updates.skippedDates ?? [];
  if ('order' in updates && updates.order != null) row.order = updates.order;
  if ('inProjectBlock' in updates) row.in_project_block = updates.inProjectBlock ?? null;
  if ('previousStartTime' in updates) row.previous_start_time = updates.previousStartTime ?? null;
  if ('previousStartDate' in updates) row.previous_start_date = updates.previousStartDate ?? null;
  if ('notes' in updates) row.notes = updates.notes ?? null;
  if ('parentItemId' in updates) row.parent_item_id = updates.parentItemId ?? null;
  if ('assignee' in updates) row.assignee = updates.assignee ?? null;
  if ('aiStatus' in updates) row.ai_status = updates.aiStatus ?? null;
  if ('aiResult' in updates) row.ai_result = updates.aiResult ?? null;
  return row;
}

function habitUpdatesToRow(updates: Partial<Habit>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('group' in updates && updates.group != null) row.group = updates.group;
  if ('streak' in updates && updates.streak != null) row.streak = updates.streak;
  if ('status' in updates) row.status = updates.status;
  if ('completedDates' in updates && updates.completedDates != null) row.completed_dates = updates.completedDates;
  if ('skippedDates' in updates && updates.skippedDates != null) row.skipped_dates = updates.skippedDates;
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

export async function fetchItems(userId: string, type?: string, client?: DbClient): Promise<Item[]> {
  const supabase = client ?? createClient();
  let query = supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (type) query = query.eq('type', type);
  const { data, error } = await query
    .order('order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ItemRow[]).map(itemFromRow);
}

export async function createItem(userId: string, item: Item, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('items').insert(itemToRow(userId, item));
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
  const row = updatesToRow(type, updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('items').update(row).eq('id', id).eq('type', type);
  if (error) throw error;
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
  // Idempotent alongside the store's own per-child deletes.
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
export async function restoreItem(id: string, type: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('type', type);
  if (error) throw error;
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
  return updateItem(id, 'task', updates, userId, client);
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
  return updateItem(id, 'habit', updates, userId, client);
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

export async function deleteProject(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'delete', id });
}

// Restore by id, not name — names are mutable (rename) so a name-keyed
// restore silently no-ops against a renamed row.
export async function restoreProject(userId: string, id: string): Promise<void> {
  const supabase = createClient();
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

export async function restoreHabitGroup(userId: string, id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('habit_groups')
    .update({ deleted_at: null })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}
