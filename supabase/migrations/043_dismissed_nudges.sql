-- One-time nudges — the per-user set of nudge ids a user has dismissed forever.
--
-- Reuses user_settings (one row per user, already RLS'd to auth.uid() = user_id),
-- the same home as the other one-time flag, onboarding_completed. A jsonb array
-- of slug-shaped nudge ids (see lib/nudges/registry.ts); empty by default so a
-- brand-new row is "has dismissed nothing", not null.
--
-- Deliberately its OWN column, not part of the settings blob read by
-- lib/settings-service.ts: that select's column list is a foot-gun (a name the
-- database lacks resets every setting), and a nudge flag has no business riding
-- it. Read/written by lib/nudges/service.ts alone.
--
-- Idempotent: safe to re-run.
alter table public.user_settings
  add column if not exists dismissed_nudges jsonb not null default '[]'::jsonb;
