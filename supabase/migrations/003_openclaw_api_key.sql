-- Add OpenClaw API key column to user_settings
alter table user_settings
  add column if not exists openclaw_api_key text default null;

-- Index for fast key lookups (server-to-server auth)
create unique index if not exists user_settings_openclaw_api_key_idx
  on user_settings (openclaw_api_key)
  where openclaw_api_key is not null;

-- RLS: users can read/write their own key via Supabase session
-- Server-to-server lookups use service role key (bypasses RLS)
