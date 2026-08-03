-- 023_item_events: per-item activity feed (item-surface growth, Phase 3).
-- Written where the webhooks already fire (lib/db.ts create/update/delete);
-- rows are traces, never load-bearing app state. Idempotent by convention.

create table if not exists public.item_events (
  id uuid primary key default gen_random_uuid(),
  -- Browser sessions insert without user_id and the default fills it from the
  -- JWT; the agent API's service-role client passes it explicitly.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Deliberately NOT an FK to items: events must survive an item's hard delete
  -- (the 30-day trash purge) — the feed is a history, not a join table.
  item_id uuid not null,
  -- The DB type slug ('task' | 'habit' | custom slug), matching items.type.
  item_type text not null,
  -- 'create' | 'update' | 'delete' today; text (not CHECK) so a future action
  -- (completion, assignment, agent progress) is additive, not a migration.
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists item_events_user_item_idx
  on public.item_events (user_id, item_id, created_at desc);

alter table public.item_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_events'
      and policyname = 'item_events_select_own'
  ) then
    create policy item_events_select_own on public.item_events
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'item_events'
      and policyname = 'item_events_insert_own'
  ) then
    create policy item_events_insert_own on public.item_events
      for insert with check (auth.uid() = user_id);
  end if;
end
$$;
