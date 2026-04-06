-- Device auth sessions for the "openclaw anchor-context setup" device flow.
-- Inspired by OAuth 2.0 Device Authorization Grant (RFC 8628).
--
-- Flow:
--   1. Plugin calls POST /api/agent/connect/init → gets sessionId + userCode
--   2. Plugin prints URL: /connect?code=XXXX-XXXX, polls GET /api/agent/connect/poll
--   3. User opens URL in browser, sees confirmation, clicks "Authorize"
--   4. Browser calls POST /api/agent/connect/authorize (session-auth)
--   5. Poll returns { status: "authorized", apiKey, anchorUrl }, session consumed

create table if not exists connect_sessions (
  id uuid primary key default gen_random_uuid(),
  user_code text not null unique,          -- human-readable code: "ABCD-1234"
  status text not null default 'pending',  -- pending | authorized | expired | consumed
  user_id uuid references auth.users(id) on delete cascade,  -- set on authorize
  api_key text,                            -- set on authorize
  created_at timestamptz default now(),
  expires_at timestamptz not null,         -- 15-minute TTL
  consumed_at timestamptz,                 -- set when plugin polls and gets the key
  last_polled_at timestamptz               -- for poll rate limiting (1/2s per session)
);

alter table connect_sessions enable row level security;

-- Block all access by default for anon/authenticated — service_role bypasses RLS
revoke all on table connect_sessions from anon;

-- Authenticated users can authorize pending sessions (sets user_id + api_key + status)
create policy "Users can authorize pending sessions"
  on connect_sessions for update
  to authenticated
  using (status = 'pending' and expires_at > now())
  with check (user_id = auth.uid());

-- Authenticated users can read sessions they authorized (for UI feedback)
create policy "Users can read own sessions"
  on connect_sessions for select
  to authenticated
  using (user_id = auth.uid());
