-- ============================================================
-- Migration 019: Unified items table (tasks + habits → items)
--
-- Creates the superset `items` table with a `type` discriminator, copies ALL
-- rows from tasks and habits (including soft-deleted trash — the 30-day
-- restore window must survive), keeps original UUIDs, generalizes the
-- completion RPC, and repoints the purge cron job.
--
-- The old tasks/habits tables are NOT dropped — they freeze as a rollback
-- backup for a bake window and are removed by a later cleanup migration.
-- The legacy toggle_task_completed_date RPC is deliberately NOT repointed:
-- clients deployed before the cutover keep reading AND writing the frozen
-- tables, staying internally consistent; their window writes are recovered
-- by the reconciliation step below.
--
-- CUTOVER RUNBOOK:
--   1. Close open Anchor tabs/PWA (stale bundles write to the old tables).
--   2. Apply this migration.
--   3. Deploy the app version whose lib/db.ts reads `items`.
--   4. Once the old bundle is drained, run the RECONCILIATION section at the
--      bottom of this file to recover any writes made during the window.
--
-- Structural statements are idempotent (IF NOT EXISTS / OR REPLACE / guarded
-- DO blocks). The backfill is ONE-SHOT: it runs only when `items` is empty,
-- so re-applying this file can never resurrect rows the purge cron has since
-- hard-deleted.
-- ============================================================

-- ─── 1. Table ─────────────────────────────────────────────────────────────────
-- Kind-specific columns are nullable; requiredness is enforced per-type in the
-- app's Zod discriminated union (@anchor-app/types ItemSchema), not here.
-- repeat_frequency has no DB default — per-type defaults (task 'none',
-- habit 'daily') moved to app code.

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  status text not null default 'pending',
  notes text,
  time_bucket text,
  start_time text,          -- HH:mm
  repeat_frequency text,
  repeat_days int[] default '{}',
  repeat_month_day int,
  completed_dates text[] default '{}',
  sort_order int,

  -- task-side (nullable superset)
  priority text,
  project text,
  start_date text,          -- yyyy-MM-dd
  duration int,
  is_scheduled boolean,
  "order" int,
  in_project_block boolean,
  previous_start_time text,
  previous_start_date text,
  assignee text,
  ai_result text,
  ai_status text,
  parent_item_id uuid,      -- FK added after backfill (parents may copy later than children)
  reminder_at timestamptz,
  external_id text,
  calendar_source text,
  completed_at timestamptz,
  duration_minutes int,

  -- habit-side (nullable superset)
  "group" text,
  streak int,
  skipped_dates text[] default '{}',
  daily_counts jsonb default '{}',
  times_per_day int,
  current_day_count int,
  color text,

  -- infra
  profile_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Dropped when user-defined types (item_types table) land.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_type_check') then
    alter table items
      add constraint items_type_check
      check (type in ('task', 'habit'));
  end if;
end$$;

-- NULL passes (habits keep NOT NULL semantics app-side only).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_repeat_frequency_check') then
    alter table items
      add constraint items_repeat_frequency_check
      check (repeat_frequency in ('none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'));
  end if;
end$$;

create index if not exists items_user_type_idx on items (user_id, type);
create index if not exists items_parent_item_idx on items (parent_item_id);

-- ─── 2. Backfill (ONE-SHOT: only into an empty items table) ──────────────────
-- No deleted_at filter: trash migrates too. Habits get an "order" backfilled
-- from insertion order (created_at) so a unified order-by can never reshuffle
-- them; start_date stays NULL (un-anchored — backfilling would retroactively
-- hide historical occurrences). Legacy status columns were free text; junk is
-- normalized to 'pending' so the vocabulary CHECK below can't make a migrated
-- row un-updatable (Postgres enforces CHECKs on every UPDATE).

do $$
declare
  src_tasks bigint;
  src_habits bigint;
begin
  if exists (select 1 from items limit 1) then
    raise notice 'items already populated — skipping one-shot backfill';
    return;
  end if;

  insert into items (
    id, user_id, type, title, status, notes, time_bucket, start_time,
    repeat_frequency, repeat_days, repeat_month_day, completed_dates, sort_order,
    priority, project, start_date, duration, is_scheduled, "order",
    in_project_block, previous_start_time, previous_start_date,
    assignee, ai_result, ai_status, parent_item_id, reminder_at,
    external_id, calendar_source, completed_at, duration_minutes,
    profile_id, created_at, updated_at, deleted_at
  )
  select
    id, user_id, 'task', title,
    case when status in ('pending', 'completed', 'cancelled') then status else 'pending' end,
    notes, time_bucket, start_time,
    repeat_frequency, repeat_days, repeat_month_day, coalesce(completed_dates, '{}'), sort_order,
    priority, project, start_date, duration, is_scheduled, "order",
    in_project_block, previous_start_time, previous_start_date,
    assignee, ai_result, ai_status, parent_task_id, reminder_at,
    external_id, calendar_source, completed_at, duration_minutes,
    profile_id, created_at, updated_at, deleted_at
  from tasks;

  insert into items (
    id, user_id, type, title, status, notes, time_bucket, start_time,
    repeat_frequency, repeat_days, repeat_month_day, completed_dates, sort_order,
    "group", streak, skipped_dates, daily_counts, times_per_day,
    current_day_count, color, "order",
    profile_id, created_at, updated_at, deleted_at
  )
  select
    id, user_id, 'habit', title,
    case when status in ('pending', 'done', 'skipped') then status else 'pending' end,
    notes, time_bucket, start_time,
    repeat_frequency, repeat_days, repeat_month_day, coalesce(completed_dates, '{}'), sort_order,
    "group", streak, coalesce(skipped_dates, '{}'), coalesce(daily_counts, '{}'::jsonb), times_per_day,
    current_day_count, color,
    row_number() over (partition by user_id order by created_at, id) - 1,
    profile_id, created_at, updated_at, deleted_at
  from habits;

  -- Loud failure beats silent row loss (e.g. an id collision between tables).
  select count(*) into src_tasks from tasks;
  select count(*) into src_habits from habits;
  if (select count(*) from items where type = 'task') <> src_tasks then
    raise exception 'backfill mismatch: items has % task rows, tasks has %',
      (select count(*) from items where type = 'task'), src_tasks;
  end if;
  if (select count(*) from items where type = 'habit') <> src_habits then
    raise exception 'backfill mismatch: items has % habit rows, habits has %',
      (select count(*) from items where type = 'habit'), src_habits;
  end if;
end$$;

-- Self-FK now that all potential parents exist. SET NULL so hard-purging a
-- parent can never abort the purge cron or take live children with it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_parent_item_id_fkey') then
    alter table items
      add constraint items_parent_item_id_fkey
      foreign key (parent_item_id) references items(id) on delete set null;
  end if;
end$$;

-- Type-conditional status vocabularies. Safe to add as VALID because the
-- backfill normalized any junk in the legacy free-text columns.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_status_check') then
    alter table items
      add constraint items_status_check
      check (
        (type = 'task'  and status in ('pending', 'completed', 'cancelled')) or
        (type = 'habit' and status in ('pending', 'done', 'skipped'))
      );
  end if;
end$$;

-- ─── 3. RLS + trigger ─────────────────────────────────────────────────────────

alter table items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'items' and policyname = 'Users can manage their own items'
  ) then
    create policy "Users can manage their own items"
      on items for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists items_updated_at on items;
create trigger items_updated_at before update on items
  for each row execute function update_updated_at();

-- ─── 4. Completion RPC ────────────────────────────────────────────────────────
-- Atomic per-date completion toggle for any item type. The item_type argument
-- scopes the write the same way lib/db.ts guards every update with
-- .eq('type', …): a task-path caller can never flip a habit's completed_dates
-- (which would desync its streak/dailyCounts).
--
-- toggle_task_completed_date (migration 016) is intentionally left pointing at
-- the frozen tasks table — see header. The cleanup migration retires it.

create or replace function toggle_item_completed_date(item_id uuid, item_type text, date_str text)
returns void as $$
begin
  if date_str = any(select unnest(completed_dates) from items where id = item_id and type = item_type) then
    update items set completed_dates = array_remove(completed_dates, date_str)
      where id = item_id and type = item_type;
  else
    update items set completed_dates = array_append(completed_dates, date_str)
      where id = item_id and type = item_type;
  end if;
end;
$$ language plpgsql;

-- ─── 5. Purge cron ────────────────────────────────────────────────────────────
-- The 013 job hardcodes table names — replace it. The frozen tables keep
-- their trash purge during the bake window so the 30-day deletion promise
-- holds for rows trashed before the migration; live frozen rows are untouched
-- (they're the rollback backup).

do $$
begin
  perform cron.unschedule('purge-deleted-items');
exception when others then
  null; -- job absent (fresh database) — nothing to unschedule
end$$;

select cron.schedule('purge-deleted-items', '0 0 * * *', $$
  DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habit_groups WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
$$);

-- ─── 6. Freeze markers ────────────────────────────────────────────────────────

comment on table tasks is
  'FROZEN by migration 019 — superseded by items (type=''task''). Rollback backup only; do not write.';
comment on table habits is
  'FROZEN by migration 019 — superseded by items (type=''habit''). Rollback backup only; do not write.';
comment on table items is
  'Unified task/habit/… items. type discriminates; kind-specific columns are nullable; per-type requiredness lives in @anchor-app/types ItemSchema.';

-- ============================================================
-- RECONCILIATION — run ONCE, manually, after the new app is deployed and old
-- bundles are drained (step 4 of the runbook). Recovers writes stale clients
-- made to the frozen tables during the cutover window. NOT executed as part
-- of the migration.
-- ============================================================
-- -- 1) Rows created in the window (present in frozen tables, absent in items):
-- insert into items (id, user_id, type, title, status, notes, time_bucket, start_time,
--   repeat_frequency, repeat_days, repeat_month_day, completed_dates, sort_order,
--   priority, project, start_date, duration, is_scheduled, "order", in_project_block,
--   previous_start_time, previous_start_date, profile_id, created_at, updated_at, deleted_at)
-- select id, user_id, 'task', title,
--   case when status in ('pending','completed','cancelled') then status else 'pending' end,
--   notes, time_bucket, start_time, repeat_frequency, repeat_days, repeat_month_day,
--   coalesce(completed_dates, '{}'), sort_order, priority, project, start_date, duration,
--   is_scheduled, "order", in_project_block, previous_start_time, previous_start_date,
--   profile_id, created_at, updated_at, deleted_at
-- from tasks t where not exists (select 1 from items i where i.id = t.id);
--
-- insert into items (id, user_id, type, title, status, notes, time_bucket, start_time,
--   repeat_frequency, repeat_days, repeat_month_day, completed_dates, sort_order,
--   "group", streak, skipped_dates, daily_counts, times_per_day, current_day_count, color,
--   profile_id, created_at, updated_at, deleted_at)
-- select id, user_id, 'habit', title,
--   case when status in ('pending','done','skipped') then status else 'pending' end,
--   notes, time_bucket, start_time, repeat_frequency, repeat_days, repeat_month_day,
--   coalesce(completed_dates, '{}'), sort_order, "group", streak,
--   coalesce(skipped_dates, '{}'), coalesce(daily_counts, '{}'::jsonb), times_per_day,
--   current_day_count, color, profile_id, created_at, updated_at, deleted_at
-- from habits h where not exists (select 1 from items i where i.id = h.id);
--
-- -- 2) Rows edited/completed/trashed in the window (frozen copy newer than items):
-- update items i set
--   title = t.title, notes = t.notes, time_bucket = t.time_bucket, start_time = t.start_time,
--   repeat_frequency = t.repeat_frequency, repeat_days = t.repeat_days,
--   repeat_month_day = t.repeat_month_day, completed_dates = coalesce(t.completed_dates, '{}'),
--   priority = t.priority, project = t.project, start_date = t.start_date,
--   duration = t.duration, is_scheduled = t.is_scheduled, "order" = t."order",
--   in_project_block = t.in_project_block, previous_start_time = t.previous_start_time,
--   previous_start_date = t.previous_start_date, deleted_at = t.deleted_at,
--   status = case when t.status in ('pending','completed','cancelled') then t.status else 'pending' end
-- from tasks t where t.id = i.id and i.type = 'task' and t.updated_at > i.updated_at;
--
-- update items i set
--   title = h.title, notes = h.notes, time_bucket = h.time_bucket, start_time = h.start_time,
--   repeat_frequency = h.repeat_frequency, repeat_days = h.repeat_days,
--   repeat_month_day = h.repeat_month_day, completed_dates = coalesce(h.completed_dates, '{}'),
--   "group" = h."group", streak = h.streak, skipped_dates = coalesce(h.skipped_dates, '{}'),
--   daily_counts = coalesce(h.daily_counts, '{}'::jsonb), times_per_day = h.times_per_day,
--   current_day_count = h.current_day_count, deleted_at = h.deleted_at,
--   status = case when h.status in ('pending','done','skipped') then h.status else 'pending' end
-- from habits h where h.id = i.id and i.type = 'habit' and h.updated_at > i.updated_at;
