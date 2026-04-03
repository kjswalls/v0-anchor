-- OpenClaw Gateway credentials synced by plugin (server-side only; never exposed to browser)

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS openclaw_gateway_token text,
  ADD COLUMN IF NOT EXISTS openclaw_agent_id text DEFAULT 'main';
