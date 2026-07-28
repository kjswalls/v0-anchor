-- ─────────────────────────────────────────────────────────────────────────────
-- 021_item_types.sql — user-defined item types (unified-items Phase 6)
--
-- Adds the per-user `item_types` table (custom types like "goal"), opens the
-- items.type column (drops the task|habit CHECK), and relaxes the
-- type-conditional status CHECK so custom types use the task status
-- vocabulary. Custom-type capability defaults live app-side in
-- lib/item-registry.ts (getItemTypeConfig fallback template); the `config`
-- jsonb column stores per-type overrides of that template.
--
-- Safe to re-run (idempotent guards throughout). No backfill required.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. item_types table ──────────────────────────────────────────────────────

create table if not exists item_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Machine name used as items.type — lowercase slug, unique per user.
  -- 'task'/'habit' are the built-ins; 'custom' is the app-side envelope
  -- discriminant. All three are reserved.
  name text not null,
  label text not null,
  label_plural text not null,
  icon text,
  color text,
  -- Capability overrides of the app-side custom-type template (empty = all
  -- defaults). Kept open-shape on purpose; the app validates on read.
  config jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'item_types_name_check') then
    alter table item_types
      add constraint item_types_name_check
      check (name ~ '^[a-z][a-z0-9_-]{0,31}$' and name not in ('task', 'habit', 'custom'));
  end if;
end$$;

alter table item_types enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'item_types' and policyname = 'Users can manage their own item types'
  ) then
    create policy "Users can manage their own item types"
      on item_types for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists item_types_updated_at on item_types;
create trigger item_types_updated_at before update on item_types
  for each row execute function update_updated_at();

-- ─── 2. Open items.type ───────────────────────────────────────────────────────
-- The closed CHECK was always Phase-6 scaffolding (plan: "the CHECK is dropped
-- when the custom-types phase adds a per-user item_types table"). Referential
-- integrity to item_types is deliberately NOT enforced: deleting a custom type
-- must not cascade-delete (or block on) its items — orphaned type names fall
-- back to the app-side default template.

alter table items drop constraint if exists items_type_check;

-- Custom types use the task status vocabulary (pending|completed|cancelled).
-- Rebuild the status CHECK with an else-branch; VALID immediately because
-- every existing row is task|habit and those branches are unchanged.
alter table items drop constraint if exists items_status_check;
alter table items
  add constraint items_status_check
  check (
    (type = 'task'  and status in ('pending', 'completed', 'cancelled')) or
    (type = 'habit' and status in ('pending', 'done', 'skipped')) or
    (type not in ('task', 'habit') and status in ('pending', 'completed', 'cancelled'))
  );
