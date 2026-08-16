-- ─────────────────────────────────────────────────────────────────────────────
-- 026_user_extensions.sql — official extension toggles (plugins-themes plan,
-- Project B)
--
-- Per-user enabled/disabled rows for official extensions (the declarative
-- "plugin" surface — lib/extension-registry.ts holds the manifest catalog).
-- Sparse by design: a row exists only once the user touches a toggle; absent
-- slugs fall back to the manifest's defaultEnabled app-side. `config` is
-- reserved for per-extension settings the same way item_types.config is —
-- stored now, read when an extension earns options.
--
-- The app tolerates this table being missing (fetchUserExtensions returns null
-- and the store latches the feature off — the fetchItemTypes contract), so
-- deploy order vs db:push does not matter. Record 026 in the remote ledger if
-- applied out-of-band.
--
-- Safe to re-run (idempotent guards throughout). No backfill required.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_extensions (
  id uuid primary key default gen_random_uuid(),
  -- Browser sessions insert without user_id and the default fills it from the
  -- JWT; a service-role client would pass it explicitly (the 023 idiom).
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Permanent machine name from lib/extension-registry.ts — never renamed.
  slug text not null,
  -- Extensions are opt-in; the app always writes `enabled` explicitly, so this
  -- default only guards a hand-written insert — and it should match the
  -- default-OFF contract, not contradict it.
  enabled boolean not null default false,
  -- Per-extension settings, empty until an extension earns options. Open-shape
  -- on purpose; the app validates on read (the item_types.config pattern).
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_extensions_slug_check') then
    alter table public.user_extensions
      add constraint user_extensions_slug_check
      check (slug ~ '^[a-z][a-z0-9-]{0,63}$');
  end if;
end$$;

alter table public.user_extensions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_extensions' and policyname = 'Users can manage their own extensions'
  ) then
    create policy "Users can manage their own extensions"
      on public.user_extensions for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

drop trigger if exists user_extensions_updated_at on public.user_extensions;
create trigger user_extensions_updated_at before update on public.user_extensions
  for each row execute function update_updated_at();
