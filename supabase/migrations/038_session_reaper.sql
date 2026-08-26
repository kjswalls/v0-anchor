-- ─────────────────────────────────────────────────────────────────────────────
-- 038_session_reaper.sql — free-plan replacement for the Pro "session timeout"
--
-- WHY THIS EXISTS. Supabase's built-in session inactivity timeout / time-box is
-- a paid (Pro) feature. Without it, auth.sessions accumulates forever: the
-- project had ~5,500 sessions for 3 users (see the Disk-IO work in 037), because
-- every full sign-in writes a session + refresh_token + mfa_amr_claims row and
-- nothing ever expires them. That steady write + autovacuum churn is real
-- Disk-IO cost on a small compute tier.
--
-- This schedules the DIY equivalent: a daily pg_cron job that deletes sessions
-- with no activity in 14 days. GoTrue bumps auth.sessions.updated_at on every
-- token refresh (hourly for an active user), so updated_at is a true "last seen"
-- — active sessions are never touched, only idle ones. The DELETE cascades to
-- refresh_tokens + mfa_amr_claims (ON DELETE CASCADE), the same way the one-time
-- cleanup did. The job runs as its owner (postgres), which has DELETE on auth.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- Same idempotent idiom as 035/037: unschedule (raises if absent — the fresh-DB
-- case) before scheduling, so re-applying re-points rather than duplicating.
do $$
begin
  perform cron.unschedule('reap-stale-sessions');
exception when others then null;
end$$;

-- 03:30 daily — an idle hour, offset from prune-cron-log (03:17) so the two
-- maintenance jobs never fire on the same minute. 14 days matches the one-time
-- cleanup already run against prod.
select cron.schedule(
  'reap-stale-sessions',
  '30 3 * * *',
  $$delete from auth.sessions where coalesce(updated_at, created_at) < now() - interval '14 days'$$
);
