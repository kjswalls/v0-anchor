-- ─────────────────────────────────────────────────────────────────────────────
-- 024_programs_routines.sql — programs, routines, membership, and pausing
-- (memory/plans/programs-routines.md, Phase 0)
--
-- Two container tables — `routines` (small reusable collections: a morning
-- routine, an exercise routine whose habits fall on different days) and
-- `programs` (period-of-life collections holding items and/or routines:
-- summer, school year, a vacation month) — three membership join tables, and
-- the item-level pause columns.
--
-- Phase 0 is schema + plumbing only: nothing reads these yet, so applying this
-- migration changes no app behavior. The resolver (lib/active.ts) and the
-- visibility surfaces land in Phase 1.
--
-- Naming: "program", never "schedule". The grid is already "the schedule"
-- app-wide (isScheduled, scheduleTask, ScheduleBlock, ScheduleSheet, "Add to
-- schedule"), so the entity took a collision-free noun — plan decision 12.
--
-- Pausing is NOT a status value: task pending|completed|cancelled and habit
-- pending|done|skipped are frozen external contracts (the OpenClaw plugin
-- safeParses the context response and throws on drift). Suppression lives in
-- these columns and in container state, the same way a skip lives in
-- skipped_dates — see plan decision 2.
--
-- Safe to re-run (idempotent guards throughout). No backfill required.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Composite-key targets on the parent tables ────────────────────────────
-- The join tables below reference (id, user_id) rather than id alone. Postgres
-- validates foreign keys with table-owner privileges and IGNORES row-level
-- security, so `references items(id)` plus own-row RLS would still let a user
-- insert a membership row pointing at ANOTHER user's item uuid: the insert
-- succeeds or raises 23503 depending on whether that uuid exists, which is a
-- cross-tenant existence oracle, and it leaves junk rows the item's real owner
-- can never see or clean up. Pairing each id with user_id in the FK makes a
-- cross-tenant membership unrepresentable rather than merely invisible.
-- id is already the primary key on each table, so these are free.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_id_user_id_key') then
    alter table public.items add constraint items_id_user_id_key unique (id, user_id);
  end if;
end$$;

-- ─── 2. routines ──────────────────────────────────────────────────────────────

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- icon:<LucideName> token, matching the container convention (IconPicker).
  icon text,
  -- CSS color, usually a var(--accent-N) token; unset → name-hash ramp.
  color text,
  -- Pause interval. paused_at is the instant the pause BEGAN and is
  -- load-bearing, not decorative: it is the resolver's lower bound, without
  -- which pausing in August would retro-suppress every unmarked occurrence
  -- back through July (plan decision 3).
  paused_at timestamptz,
  -- Resume date, yyyy-MM-dd text like every other user-facing date here, and
  -- EXCLUSIVE: "paused until Sep 1" is live again ON Sep 1. Auto-resume is a
  -- read-side predicate, so it needs no cron and no cleanup write.
  -- A manual resume sets this to today rather than clearing paused_at, so the
  -- interval survives on the row for the auto-age sweep's resume grace
  -- (plan decision 9) — the sweep would otherwise mass-unschedule everything
  -- the morning after a long pause ends.
  paused_until text,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete, 30-day trash like items/projects/habit_groups. Membership
  -- rows deliberately SURVIVE a soft delete so a restore brings the routine
  -- back intact; the resolver ignores trashed containers meanwhile.
  deleted_at timestamptz,
  unique (id, user_id)
);

create index if not exists routines_user_idx on public.routines (user_id);

alter table public.routines enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'routines'
      and policyname = 'Users can manage their own routines'
  ) then
    create policy "Users can manage their own routines"
      on public.routines for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists routines_updated_at on public.routines;
create trigger routines_updated_at before update on public.routines
  for each row execute function update_updated_at();

-- ─── 3. programs ──────────────────────────────────────────────────────────────

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  -- Tri-state activation. 'auto' follows the date range below (no range = on);
  -- 'active'/'paused' are explicit manual overrides that always win, because
  -- flipping a program by hand must never be second-guessed by a date. Several
  -- programs may be active at once — the resolver unions their members.
  state text not null default 'auto',
  -- Inclusive bounds, either end open, yyyy-MM-dd. Only meaningful for 'auto'.
  starts_on text,
  ends_on text,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programs_state_check') then
    alter table public.programs
      add constraint programs_state_check
      check (state in ('auto', 'active', 'paused'));
  end if;
end$$;

create index if not exists programs_user_idx on public.programs (user_id);

alter table public.programs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'programs'
      and policyname = 'Users can manage their own programs'
  ) then
    create policy "Users can manage their own programs"
      on public.programs for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists programs_updated_at on public.programs;
create trigger programs_updated_at before update on public.programs
  for each row execute function update_updated_at();

-- ─── 4. Membership join tables ────────────────────────────────────────────────
-- Members are referenced BY ID, deliberately departing from the older
-- container pattern (items.project / items."group" hold container NAMES) —
-- name references are precisely why renaming a project is still parked. These
-- support rename from day one.
--
-- No created_at/updated_at and NO updated_at trigger on these three: the house
-- trigger reads NEW.updated_at, so attaching it to a table without the column
-- makes every UPDATE throw at runtime — and Phase 5's routine-ordering UI
-- updates sort_order here.
--
-- Every FK is ON DELETE CASCADE in both directions. The item-side cascade is
-- load-bearing for the nightly purge: a RESTRICT/NO ACTION reference from a
-- membership row would abort the whole purge transaction (the same hazard that
-- made items_parent_item_id_fkey choose ON DELETE SET NULL in 019). Membership
-- rows are derived data, not user content, so cascading them is lossless.

create table if not exists public.routine_items (
  routine_id uuid not null,
  item_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Routine-internal ordering. Item `order` is a per-type sequence and cannot
  -- serve here (cross-type values collide), so membership carries its own.
  sort_order int,
  primary key (routine_id, item_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

-- The PK covers routine_id lookups; this covers the reverse (which routines is
-- this item in?) and the per-user hydration fetch.
create index if not exists routine_items_user_item_idx
  on public.routine_items (user_id, item_id);

create table if not exists public.program_items (
  program_id uuid not null,
  item_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (program_id, item_id),
  foreign key (program_id, user_id) references public.programs (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index if not exists program_items_user_item_idx
  on public.program_items (user_id, item_id);

create table if not exists public.program_routines (
  program_id uuid not null,
  routine_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (program_id, routine_id),
  foreign key (program_id, user_id) references public.programs (id, user_id) on delete cascade,
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade
);

create index if not exists program_routines_user_routine_idx
  on public.program_routines (user_id, routine_id);

alter table public.routine_items enable row level security;
alter table public.program_items enable row level security;
alter table public.program_routines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['routine_items', 'program_items', 'program_routines'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Users can manage their own memberships'
    ) then
      execute format(
        'create policy "Users can manage their own memberships" on public.%I '
        || 'for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t
      );
    end if;
  end loop;
end$$;

-- ─── 5. Item-level pause ──────────────────────────────────────────────────────
-- Nullable and unconstrained, like every kind-specific column on the unified
-- table. Same semantics as the routine columns above (see section 2): paused_at
-- bounds the interval below, paused_until is the exclusive resume date.

alter table public.items add column if not exists paused_at timestamptz;
alter table public.items add column if not exists paused_until text;

-- ─── 6. Trash purge ───────────────────────────────────────────────────────────
-- Extend the 019 job to the two new soft-deleting tables. Membership rows go
-- with their container by CASCADE, so they never need a line of their own.

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
  DELETE FROM routines WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM programs WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
$$);

comment on table public.routines is
  'Small reusable collections of items. Members join via routine_items; a routine may belong to several programs (program_routines) or none.';
comment on table public.programs is
  'Period-of-life collections (summer, school year, vacation). Hold items directly (program_items) and/or routines (program_routines). Named "program", not "schedule" — the grid owns that noun.';
