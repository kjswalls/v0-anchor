-- ─────────────────────────────────────────────────────────────────────────────
-- 027_container_ids.sql — items point at their project and habit group by ID
-- (memory/plans/organize-console.md, Phase 0 — decision 5)
--
-- `items.project` and `items."group"` are NAME references. Renaming a container
-- therefore orphans every member: the row keeps the old string and the app can
-- no longer resolve it. That has always been true, but the Organize console
-- makes renaming a first-class, one-keystroke action, so it has to be fixed
-- before the console ships — hence Phase 0 arriving after Phases 1-3 were built.
--
-- THE TEXT COLUMNS ARE KEPT, NOT DROPPED. Two reasons, both hard:
--   * Rollback ballast, the same posture as the frozen tasks/habits tables.
--   * The permanent legacy projection has to emit a NAME. /api/agent/context's
--     tasks[]/habits[] and the tasks.updated/habits.updated webhooks are an
--     external contract — the OpenClaw plugin safeParses them and throws on
--     drift. A uuid would still PARSE, because both fields are z.string(), so
--     substituting one would fail silently and feed ids to a model with no
--     id↔name map. The id is the truth; the text is a mirror the rename
--     fan-out keeps correct.
--
-- Schema and backfill only. Nothing reads these columns until the app side
-- lands, so applying this on its own changes no behavior.
--
-- DEPLOY ORDER: database FIRST, app second — and unlike 024 that direction is
-- not optional. PostgREST rejects an INSERT naming a column absent from its
-- schema cache with PGRST204, which would take out every item create, not only
-- container-bearing ones. Applying this before the app build makes that window
-- impossible. The app is still written to tolerate the columns being missing
-- (see containerColumns in lib/db.ts), for the fresh-clone and rollback cases.
--
-- Safe to re-run. The two backfill statements only ever fill NULLs, so they are
-- re-runnable by design and NOT merely idempotent — see section 5.
--
-- Split into separate DO blocks on purpose: section 5 references columns
-- section 4 adds, and a single block would leave that resolution depending on
-- PL/pgSQL preparing each statement lazily. Separate top-level blocks make the
-- ordering explicit instead of implicit.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Version assert ────────────────────────────────────────────────────────
-- Section 6 needs `on delete set null (column_list)`, which is PostgreSQL 15+.
-- On an older server that clause is a syntax error, and the tempting "fix" is
-- to drop the column list — which is silently, expensively wrong: SET NULL
-- without a list nulls EVERY referencing column, and items.user_id is NOT NULL.
-- The nightly purge-deleted-items cron hard-deletes from projects and
-- habit_groups, so the first purged container that outlived a member would
-- abort the whole job with 23502, taking every later DELETE in it down too.
-- Fail loudly here instead.

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      '027_container_ids requires PostgreSQL 15+ for ON DELETE SET NULL (column); server is %',
      current_setting('server_version');
  end if;
end$$;

-- ─── 2 + 3. Composite-key targets, and the id columns ─────────────────────────
-- No migration in this directory CREATES projects or habit_groups — thirteen
-- tables are created across supabase/migrations/ and neither is among them.
-- They predate the ledger and live only in the stale schema.sql that CLAUDE.md
-- forbids authoring against. Everything below is therefore guarded on the
-- tables actually being there, the SQL mirror of 024's `unavailable()` posture.
--
-- The FK targets are (id, user_id) rather than id alone, for the reason 024
-- spells out at length: Postgres validates foreign keys with table-owner
-- privileges and IGNORES row level security, so `references projects(id)` plus
-- own-row RLS still lets a user point a member at ANOTHER user's container uuid
-- — the insert succeeds or raises 23503 depending on whether that uuid exists,
-- which is a cross-tenant existence oracle. Pairing the id with user_id makes
-- the cross-tenant reference unrepresentable rather than merely invisible.
-- id is already the primary key on each table, so these constraints are free.
--
-- The id columns are nullable, and permanently so: "no project" is the common
-- case, an item may name a container that has no row (see section 5), and the
-- purge cron nulls these on hard delete.

do $$
begin
  if to_regclass('public.projects') is not null then
    if not exists (select 1 from pg_constraint where conname = 'projects_id_user_id_key') then
      alter table public.projects add constraint projects_id_user_id_key unique (id, user_id);
    end if;
    alter table public.items add column if not exists project_id uuid;
  end if;

  if to_regclass('public.habit_groups') is not null then
    if not exists (select 1 from pg_constraint where conname = 'habit_groups_id_user_id_key') then
      alter table public.habit_groups add constraint habit_groups_id_user_id_key unique (id, user_id);
    end if;
    alter table public.items add column if not exists group_id uuid;
  end if;
end$$;

-- ─── 4 + 5. Backfill ──────────────────────────────────────────────────────────
-- Keyed on (user_id, name), which is UNIQUE on both parent tables — verified
-- against the live database rather than assumed, since the point above is that
-- these tables' shape is not in this directory.
--
-- DELETED PARENTS ARE LINKED ON PURPOSE. The join does not filter deleted_at:
-- the unique constraint spans deleted rows too, so there is at most one
-- candidate either way and the link is unambiguous. Pointing a member at its
-- soft-deleted container is what lets a Trash restore reconnect the members it
-- had — the alternative silently strands them at the moment of restore.
--
-- `where <id> is null` makes these re-runnable, which is load-bearing rather
-- than tidy. On the live database 223 of 228 group references belong to an
-- account with ZERO habit_groups rows: the built-in groups are declared in
-- lib/planner-types.ts and imported nowhere, so they were never persisted.
-- Those rows correctly take a NULL group_id here and keep working off the text
-- column. When Phase 6 seeds the missing defaults, re-running this statement
-- adopts them — so Phase 6 must re-run it rather than assume this is finished.

do $$
begin
  if to_regclass('public.projects') is not null then
    update public.items i
       set project_id = p.id
      from public.projects p
     where i.project_id is null
       and i.project is not null
       and p.user_id = i.user_id
       and p.name = i.project;
  end if;

  if to_regclass('public.habit_groups') is not null then
    update public.items i
       set group_id = g.id
      from public.habit_groups g
     where i.group_id is null
       and i."group" is not null
       and g.user_id = i.user_id
       and g.name = i."group";
  end if;
end$$;

-- ─── 6. Foreign keys ──────────────────────────────────────────────────────────
-- The column list on SET NULL is the whole point — see section 1. Without it
-- the purge cron dies on the first container that outlives a member.
--
-- MATCH SIMPLE (the default) is what we want: once project_id is nulled the
-- constraint is satisfied regardless of user_id, so the cascade settles in one
-- step rather than requiring both columns to move together.

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'items_project_id_fkey') then
    alter table public.items
      add constraint items_project_id_fkey
      foreign key (project_id, user_id) references public.projects (id, user_id)
      on delete set null (project_id);
  end if;

  if to_regclass('public.habit_groups') is not null
     and not exists (select 1 from pg_constraint where conname = 'items_group_id_fkey') then
    alter table public.items
      add constraint items_group_id_fkey
      foreign key (group_id, user_id) references public.habit_groups (id, user_id)
      on delete set null (group_id);
  end if;
end$$;

-- ─── 7. Lookup indexes ────────────────────────────────────────────────────────
-- The rename fan-out and the delete unfile both run
-- `... where user_id = $1 and <id> = $2`. Partial, because the overwhelming
-- majority of items belong to no container and indexing those NULLs buys
-- nothing — 30 of 1643 items name a project on the live database.

do $$
begin
  if to_regclass('public.projects') is not null then
    create index if not exists items_user_project_id_idx
      on public.items (user_id, project_id) where project_id is not null;
  end if;

  if to_regclass('public.habit_groups') is not null then
    create index if not exists items_user_group_id_idx
      on public.items (user_id, group_id) where group_id is not null;
  end if;
end$$;
