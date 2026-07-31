-- Gateway transport for Beacon chat (memory/plans/ai-vision.md).
--
-- Anchor talks to a user's OpenClaw gateway over its OpenAI-compatible HTTP
-- surface, proxied SERVER-SIDE from the Next.js route handlers. That replaces
-- the browser POSTing straight at the gateway with a bearer key, and it fixes
-- the real bug in the plugin chat path: it runs on runtime.subagent.run, and
-- subagent sessions auto-archive after archiveAfterMinutes (default 60), so the
-- assistant's server-side memory silently evaporates after about an hour.
--
-- Split across two tables on purpose, matching migration 012's reasoning:
--   * the URL is not a secret and lives in user_settings (RLS-readable by the
--     owning user, so the settings UI can show it back),
--   * the tokens are FULL OPERATOR ACCESS to the gateway and live in
--     user_secrets, which has no anon/authenticated policies at all — only the
--     service role reaches it, and nothing ever returns them to the browser.
--
-- Idempotent and additive: unapplied, the app keeps using the plugin chat path.

alter table user_settings
  add column if not exists openclaw_gateway_url text;

-- Separate from openclaw_gateway_token: the docs are explicit that the hooks
-- endpoint takes its own token and that gateway auth tokens must not be reused
-- for it. Added now (nullable, unused until delegation ships) so Phase 2 does
-- not need a migration just to hold a string.
alter table user_secrets
  add column if not exists openclaw_hooks_token text;
