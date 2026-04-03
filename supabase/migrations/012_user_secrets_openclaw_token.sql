-- Isolate OpenClaw gateway token from user_settings RLS (authenticated users can SELECT their row there).
-- user_secrets: no policies for anon/authenticated — only service_role bypasses RLS.

create table if not exists user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  openclaw_gateway_token text,
  updated_at timestamptz default now()
);

alter table user_secrets enable row level security;

-- Block JWT clients; service_role bypasses RLS and retains access for API routes.
revoke all on table user_secrets from authenticated;
revoke all on table user_secrets from anon;
grant select, insert, update, delete on table user_secrets to service_role;

create trigger user_secrets_updated_at
  before update on user_secrets
  for each row execute function update_updated_at();

-- Move existing tokens off user_settings (column added in 011).
insert into user_secrets (user_id, openclaw_gateway_token)
select user_id, openclaw_gateway_token
from user_settings
where openclaw_gateway_token is not null
on conflict (user_id) do update set
  openclaw_gateway_token = excluded.openclaw_gateway_token,
  updated_at = now();

alter table user_settings
  drop column if exists openclaw_gateway_token;
