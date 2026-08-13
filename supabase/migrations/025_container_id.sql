-- ─────────────────────────────────────────────────────────────────────────────
-- 025_container_id.sql — the stable half of the container reference
-- (memory/plans/display-menu.md, Phase B; organize-console.md, Phase 0 — these
-- are the SAME migration, scheduled once)
--
-- `items.project` and `items."group"` hold container NAMES. That is why
-- renaming a project or a habit group has been parked since unification: a
-- rename orphans every item pointing at the old string, and nothing in the
-- schema can notice. This adds `items.container_id`, backfills it from the
-- names, and leaves the names in place as a mirror.
--
-- ONE column for both kinds, not project_id + group_id. Project and Habit Group
-- are one axis with two namespaces (lib/container-registry.ts): an item answers
-- with exactly one container, and which table that container lives in is a
-- question about the item's TYPE, which the row already carries. Two nullable
-- columns would make "no container" and "the other kind's container" the same
-- state on both of them.
--
-- Safe to re-run (idempotent guards throughout).
--
-- DEPLOY ORDER: apply this BEFORE or AFTER the app build — either is safe, the
-- same tolerance 024 established and for the same reason (Vercel builds on push
-- while `pnpm db:push` is manual, so the window is real).
--   • Pre-app  — the column exists and stays null until the app writes it. The
--     app reads `container_id` through `itemFromRow`, which maps a missing value
--     to `undefined`, so nothing breaks.
--   • Post-app — the app is already dual-writing into a column that does not
--     exist yet. PostgREST rejects the whole row on an unknown column, so an
--     un-applied 025 breaks every item write. THIS is the asymmetric one:
--     prefer applying the migration first.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. The column ────────────────────────────────────────────────────────────
-- No FK. Deliberate, and not laziness: the referent is one of TWO tables chosen
-- by items.type, which a single foreign key cannot express, and neither
-- alternative is worth it here — a CHECK-plus-two-nullable-columns design loses
-- the one-axis property above, and a trigger validating against the right table
-- per row costs a lookup on every insert to enforce something the app resolves
-- from its own loaded container list anyway. The cost is that a deleted
-- container leaves a dangling id, which is EXACTLY the state the name column
-- has always been in (removeProject's sweep is in-session only), so this adds
-- no new class of inconsistency. Section 4 gives the repair query.
alter table if exists public.items
  add column if not exists container_id uuid;

comment on column public.items.container_id is
  'Row id in projects or habit_groups — which one is decided by items.type. Mirror of items.project / items."group" during the dual-write window.';

-- ─── 2. Index ─────────────────────────────────────────────────────────────────
-- Partial: the overwhelming majority of a mature table is NOT any one
-- container, and every query that uses this filters by user_id first anyway.
create index if not exists items_user_container_idx
  on public.items (user_id, container_id)
  where container_id is not null;

-- ─── 3. Backfill ──────────────────────────────────────────────────────────────
-- Guarded with to_regclass because NO MIGRATION IN THIS REPO CREATES `projects`
-- OR `habit_groups` — they were created out-of-band and survive only in the
-- stale supabase/schema.sql. A fresh Supabase project provisioned from
-- migrations alone therefore has neither table, and an unguarded UPDATE would
-- fail the whole push. This is the SQL mirror of the `unavailable()` pattern
-- migration 024 uses app-side.
--
-- Case: habit groups match case-INSENSITIVELY and projects match EXACTLY. Not a
-- preference — `makeAddDraft` writes a lowercase 'personal' against the seeded
-- 'Personal' whenever the groups list has not loaded yet, so both spellings are
-- real data and must resolve to one row. A project name is typed once by the
-- user and is compared exactly everywhere in the app. See `caseFold` in
-- lib/container-registry.ts; this predicate and that flag must agree, or the
-- backfill and the app's dual-write disagree about the same item.
do $$
begin
  if to_regclass('public.projects') is not null then
    update public.items i
       set container_id = p.id
      from public.projects p
     where i.container_id is null
       and i.project is not null
       and i.type <> 'habit'
       and p.user_id = i.user_id
       and p.name = i.project;
  end if;

  if to_regclass('public.habit_groups') is not null then
    update public.items i
       set container_id = g.id
      from public.habit_groups g
     where i.container_id is null
       and i."group" is not null
       and i.type = 'habit'
       and g.user_id = i.user_id
       and lower(g.name) = lower(i."group");
  end if;
end$$;

-- ─── 4. Repair query, for when a container is hard-deleted ────────────────────
-- Not run here and not a trigger — see section 1. Kept in the migration because
-- the app's own sweep (planner-store cleanupOrphanedReferences) is in-session
-- only and has no callers, so this is the durable version:
--
--   update public.items i set container_id = null
--    where i.container_id is not null
--      and not exists (
--        select 1 from public.projects p
--         where p.id = i.container_id and p.user_id = i.user_id)
--      and not exists (
--        select 1 from public.habit_groups g
--         where g.id = i.container_id and g.user_id = i.user_id);
--
-- Note it does NOT clear the name alongside. Clearing both is the app's verb and
-- a user-visible change; this only removes a reference that cannot resolve.

-- ─── 5. What this migration deliberately does NOT do ──────────────────────────
-- • It does not drop or stop writing `items.project` / `items."group"`. Those
--   are the legacy tasks[] / habits[] projections the OpenClaw plugin
--   safeParses and throws on drift from — an external contract, per CLAUDE.md.
--   The name stays for the whole dual-write window and beyond.
-- • It does not add NOT NULL. A habit whose group row was deleted, and every
--   item created while a client had not yet loaded its containers, legitimately
--   has a name and no id.
-- • It does not normalize the stored case of container names. Merging an
--   account's 'Work' and 'work' habit groups is a data decision with a visible
--   consequence (which colour and which icon survive), and it is not something
--   to do inside a schema migration.
