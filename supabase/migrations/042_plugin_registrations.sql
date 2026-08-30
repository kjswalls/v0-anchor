-- 042_plugin_registrations: webhook registrations that survive a cold start.
--
-- lib/openclaw-registry.ts kept these in an in-process Map. On Vercel that dies
-- with the instance and is absent on every other one, so a plugin registered
-- against instance A never hears about a mutation served by instance B — change
-- notifications have been unreliable since the day the app left a single
-- long-lived process. Delegation makes it worse, because "the agent finished"
-- is exactly the event you would want pushed rather than polled.
--
-- Modelled on 021_item_types: per-user rows, one row per plugin, jsonb-free
-- because the shape is known.
--
-- SERVICE ROLE ONLY, like user_secrets (012). The row carries `secret`, the
-- HMAC key Anchor signs outgoing payloads with — a browser-readable copy would
-- let any script forge a change event to a plugin. Nothing in the app needs to
-- read these; only the server writes them and only the server sends with them.
--
-- Idempotent, per the repo rule.

create table if not exists public.plugin_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- e.g. 'anchor-context'. One registration per plugin per user; re-registering
  -- on plugin startup overwrites rather than accumulating.
  plugin_id text not null,
  webhook_url text not null,
  -- HMAC key for X-Anchor-Signature. Empty string means unsigned, which the
  -- sender still honours — the plugin decides whether it wants signing.
  secret text not null default '',
  -- Event names, or ['*']. Text array rather than jsonb: it is a flat list that
  -- is only ever membership-tested.
  events text[] not null default '{}',
  registered_at timestamptz not null default now(),
  unique (user_id, plugin_id)
);

create index if not exists plugin_registrations_user_idx
  on public.plugin_registrations (user_id);

alter table public.plugin_registrations enable row level security;

-- No policy is created on purpose. RLS with no policy denies everything to
-- `authenticated` and `anon`; the service role bypasses RLS entirely. The
-- explicit revokes below say the same thing at the grant level, so neither
-- mechanism is load-bearing alone.
revoke all on table public.plugin_registrations from authenticated;
revoke all on table public.plugin_registrations from anon;
grant select, insert, update, delete on table public.plugin_registrations to service_role;

comment on table public.plugin_registrations is
  'Where Anchor POSTs change events. Service-role only: rows carry the HMAC signing secret.';
