-- ─────────────────────────────────────────────────────────────────────────────
-- 029_goals.sql — long-term goals, and the roles their members play
-- (memory/plans/long-term-goals.md, Phase 0)
--
-- A GOAL is a long-horizon container — "Learn Chinese", "Build a $3m business
-- by 2029" — holding the work that serves it. It is the fifth container table
-- and the third container ROLE: projects and habit groups CLASSIFY (what an
-- item is about), routines and programs GATE (when it counts), and a goal
-- ASPIRES (why it matters). A goal never suppresses anything and never writes a
-- member's fields; that is the whole seam, and lib/container-registry.ts states
-- it in types.
--
-- Members join through ONE table carrying a ROLE, rather than three tables or a
-- new entity:
--   'member'    — ordinary supporting work (the daily practice habit).
--   'milestone' — an achievement checkpoint. A one-shot item whose start_date
--                 IS its target date, so it renders on the grid that day, goes
--                 past due when missed, and completes through the normal paths.
--   'checkin'   — a recurring review ("Weekly Chinese review", every Sunday).
-- Role lives on the MEMBERSHIP, not the item: the same exam can be a milestone
-- of one goal and plain supporting work in another. Nothing on `items` changes,
-- which is why this migration adds no columns there and why the pinned legacy
-- projections (tasks[]/habits[]) cannot drift.
--
-- Safe to re-run (idempotent guards throughout). No backfill required.
--
-- DEPLOY ORDER: apply this before or after the app build, either is safe, and
-- for a stronger reason than 024 had. 024 needed a guard (pauseColumns) because
-- it added columns to `items` that itemToRow would name on every INSERT, and
-- PostgREST rejects an INSERT naming a column missing from its schema cache
-- (PGRST204). This migration touches no existing table's columns at all, so
-- every pre-existing write path is byte-identical against a pre-029 database.
-- The only new surface is fetchGoals, which returns null on a missing table
-- (42P01/PGRST205) so that the store can latch the whole feature off. Note the
-- CAN: the store slice, its `goalsAvailable` flag and the write-path gating
-- land with Phase 1 — this migration ships the read-side null and nothing else,
-- and the goal writers are simply uncalled until then. Do not "simplify" the
-- null-on-missing-table contract away; the gate is built on it.
--
-- LEDGER: the number must match the remote ledger's TIP, which is not the same
-- question as the highest number in this directory. 028's header records the
-- rule — ledger first, directory second — after versions arrived on the remote
-- from branches that had not merged here yet. Check `pnpm db:list` before
-- applying, and if this is applied out of band via the SQL editor or MCP,
-- record version 029 in supabase_migrations.schema_migrations immediately or
-- `db push` will try to replay it later.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. goals ─────────────────────────────────────────────────────────────────

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- The motivation line — the answer to "why does this exist?", rendered on the
  -- goal surface and handed to Beacon. A goal without one is legal; a goal
  -- whose why is worth writing down is the point of the feature.
  why text,
  -- icon:<LucideName> token, matching the container convention (IconPicker).
  icon text,
  -- CSS color, usually a var(--accent-N) token; unset → name-hash ramp.
  color text,
  -- Lifecycle, deliberately NOT a status vocabulary borrowed from items: task
  -- pending|completed|cancelled and habit pending|done|skipped are frozen
  -- external contracts, and a goal is not an item. 'achieved' and 'abandoned'
  -- both mean "no longer active work" but they are different history and the
  -- distinction is the user's to make.
  state text not null default 'active',
  -- Optional horizon. Inclusive, yyyy-MM-dd text like every other user-facing
  -- date here; timezone resolution stays app-side. target_on is what the
  -- countdown and the behind/ahead read are measured against.
  starts_on text,
  target_on text,
  -- Stamped when state becomes 'achieved', cleared when it returns to 'active'.
  -- App-writable (unlike programs.updated_at): it rides GOAL_FIELDS into undo's
  -- container diff, which is exactly what makes undo of "Mark achieved" restore
  -- the state AND clear the stamp in one replay. A same-state write must never
  -- restamp it — see resolveGoalStateWrite in lib/goals.ts (Phase 1).
  achieved_at timestamptz,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete, 30-day trash like every other container. Membership rows
  -- deliberately SURVIVE so a restore brings the goal back intact.
  deleted_at timestamptz
);

-- Composite-FK target (see goal_items below). Guarded rather than inline in the
-- CREATE: `create table if not exists` on a table that somehow already exists
-- skips inline constraints silently, and the join table would then abort with
-- "no unique constraint matching given keys". This repo has applied migrations
-- out of band before (018-022, 025-026), so partial state is not hypothetical.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_id_user_id_key') then
    alter table public.goals add constraint goals_id_user_id_key unique (id, user_id);
  end if;
end$$;

-- Guarded for the same reason, and here the reason is sharper: a skipped inline
-- PRIMARY KEY fails LOUDLY at the first upsert ("no unique constraint matching
-- given keys"), but a skipped inline CHECK fails SILENTLY — arbitrary state
-- strings become storable and every consumer's switch quietly drops those rows.
-- 024 put programs_state_check in a DO block for exactly this reason.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_state_check') then
    alter table public.goals
      add constraint goals_state_check
      check (state in ('active', 'achieved', 'abandoned'));
  end if;
end$$;

create index if not exists goals_user_idx on public.goals (user_id);

alter table public.goals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goals'
      and policyname = 'Users can manage their own goals'
  ) then
    create policy "Users can manage their own goals"
      on public.goals for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists goals_updated_at on public.goals;
create trigger goals_updated_at before update on public.goals
  for each row execute function update_updated_at();

-- ─── 2. goal_items ────────────────────────────────────────────────────────────
-- ONE join table with a role column, not three tables. The primary key is
-- (goal_id, item_id), so an item holds exactly ONE role per goal by
-- construction — it cannot be both a milestone and plain supporting work in the
-- same goal, and no consumer has to decide which wins.
--
-- Members are referenced BY ID, like routines/programs and deliberately unlike
-- items.project / items."group" (which hold container NAMES — precisely why
-- renaming those was parked for so long). Goals support rename from day one.
--
-- No created_at/updated_at and NO updated_at trigger: the house trigger reads
-- NEW.updated_at, so attaching it to a table without the column makes every
-- UPDATE throw at runtime — and role changes UPDATE this table.
--
-- Both FKs are composite (id, user_id) and ON DELETE CASCADE — see the guarded
-- block below, where they are added and the reasoning lives.

create table if not exists public.goal_items (
  goal_id uuid not null,
  item_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'member' | 'milestone' | 'checkin'. Defaulted so an insert that forgets the
  -- column lands on the harmless role rather than a loud one: a mis-defaulted
  -- milestone would silently move a goal's progress denominator.
  role text not null default 'member',
  -- Milestone ordering (the timeline's sequence for same-dated or undated
  -- checkpoints). Item `order` is a per-type sequence and cannot serve here —
  -- cross-type values collide — so membership carries its own, exactly as
  -- routine_items does. Null for non-milestone roles.
  sort_order int
);

-- Everything structural about this table is added SEPARATELY and guarded, not
-- declared inline above — including the primary key and both foreign keys.
--
-- This departs from routine_items/program_items in 024, deliberately. The rest
-- of this file argues that `create table if not exists` skips inline
-- constraints silently on a table that already exists; leaving the PK and the
-- FKs inline would exempt from that argument the three constraints it matters
-- most for. A missing PK at least fails loudly (the first upsert's
-- `on_conflict=goal_id,item_id` raises 42P10), but a missing composite FK fails
-- SILENTLY, and those two FKs are the entire reason a membership row cannot be
-- forged across tenants (see the note below). A file that reports success on a
-- table with no cross-tenant protection is worse than one that fails.

alter table public.goal_items add column if not exists role text not null default 'member';
alter table public.goal_items add column if not exists sort_order int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goal_items_pkey') then
    alter table public.goal_items add constraint goal_items_pkey primary key (goal_id, item_id);
  end if;

  -- Composite (id, user_id) rather than plain id, in BOTH directions. Postgres
  -- validates foreign keys with table-owner privileges and IGNORES row level
  -- security, so `references items(id)` plus own-row RLS would still let a user
  -- insert a membership row pointing at another user's item uuid — the insert
  -- succeeding or raising 23503 depending on whether that uuid exists, which is
  -- a cross-tenant existence oracle, and it leaves junk rows the real owner can
  -- never see or clean up. Pairing each id with user_id makes a cross-tenant
  -- membership unrepresentable rather than merely invisible.
  --
  -- CASCADE because a RESTRICT/NO ACTION reference from a membership row would
  -- abort the whole nightly purge transaction (the hazard that made
  -- items_parent_item_id_fkey choose ON DELETE SET NULL back in 019).
  -- Membership rows are derived data, not user content, so cascading them is
  -- lossless.
  if not exists (select 1 from pg_constraint where conname = 'goal_items_goal_fkey') then
    alter table public.goal_items add constraint goal_items_goal_fkey
      foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'goal_items_item_fkey') then
    alter table public.goal_items add constraint goal_items_item_fkey
      foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade;
  end if;
end$$;

-- Guarded, not inline — see goals_state_check above. This is the CHECK whose
-- silent absence is worst: the app splits rows three ways by this column, so an
-- unconstrained value does not error anywhere, it just makes memberships
-- vanish from every array.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goal_items_role_check') then
    alter table public.goal_items
      add constraint goal_items_role_check
      check (role in ('member', 'milestone', 'checkin'));
  end if;
end$$;

-- The PK covers goal_id lookups; this covers the reverse (which goals is this
-- item in, and in what role?) — the index behind the item→roles lookup that
-- drives role glyphs, the auto-age sweep's milestone exclusion, and the
-- demotion rule — plus the per-user hydration fetch.
create index if not exists goal_items_user_item_idx
  on public.goal_items (user_id, item_id);

alter table public.goal_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goal_items'
      and policyname = 'Users can manage their own goal memberships'
  ) then
    create policy "Users can manage their own goal memberships"
      on public.goal_items for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

-- ─── 3. Trash purge ───────────────────────────────────────────────────────────
-- Extend the job to `goals`. Membership rows go with their goal by CASCADE, so
-- they never need a line of their own. The job is REPLACED whole, so every
-- table the 024 version purged is re-listed here — dropping one would silently
-- strand its trash forever.

-- NOTE the asymmetry, because the guard below reads like more protection than
-- it is: the unschedule tolerates a missing job, but the `cron.schedule` that
-- follows is UNGUARDED, so a database with no pg_cron extension fails this
-- whole file and neither table lands. That is not an oversight to fix here —
-- 019 and 024 have the identical shape, and 013 does `create extension if not
-- exists pg_cron`, so any ordered replay has it. It is written down so nobody
-- reads the exception handler as "safe on a bare database".
do $$
begin
  perform cron.unschedule('purge-deleted-items');
exception when others then
  null; -- job absent (already-unscheduled, or a replay) — nothing to undo
end$$;

select cron.schedule('purge-deleted-items', '0 0 * * *', $$
  DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habit_groups WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM routines WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM programs WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM goals WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
$$);

comment on table public.goals is
  'Long-horizon aspiration containers (learn Chinese, build a business). The third container role: they neither classify an item nor gate its visibility — they say why the work matters. Members join via goal_items, which carries the role each member plays.';
comment on column public.goal_items.role is
  'member | milestone | checkin. A milestone is a one-shot item whose items.start_date is its target date; a checkin is a recurring review. Role belongs to the membership, not the item — the same item can be a milestone of one goal and plain work in another.';
