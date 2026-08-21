-- ─────────────────────────────────────────────────────────────────────────────
-- 032_reminder_cron.sql — drive the ticks from Postgres, not from the host
--
-- WHY THIS EXISTS. vercel.json declared both cron jobs at */5. On Vercel's Hobby
-- plan a cron expression that fires more than once a day is rejected AT DEPLOY
-- TIME — the deployment fails outright, it does not silently degrade. And
-- five-minute resolution is not a nicety here: both jobs exist to catch a moment
-- in the USER's local day (07:30 for a cue, 21:00 for the review), so a
-- once-a-day job fires at the right minute for one timezone and the wrong one
-- for every other.
--
-- pg_cron is already this project's scheduler (migration 013 introduced it, 019
-- and 024 have re-pointed it since) and it schedules to the minute regardless of
-- anyone's hosting plan. So the ticks move here, and vercel.json goes back to
-- declaring no crons at all. The routes are unchanged: they are still ordinary
-- authenticated GETs, so a Vercel cron, a GitHub Action or a curl in a terminal
-- can still drive them.
--
-- SECRETS. The URL and the shared secret live in Vault, not in this file, so
-- neither ends up in git and rotating one is a single SQL statement. Run these
-- ONCE per project, in the SQL editor, before or after applying this migration:
--
--   select vault.create_secret('https://your-app.vercel.app', 'anchor_app_url');
--   select vault.create_secret('<your CRON_SECRET>',          'anchor_cron_secret');
--
-- Until both exist the jobs are a deliberate no-op (see anchor_tick below) —
-- applying this migration on a project that has not set them costs nothing and
-- logs nothing, rather than erroring every five minutes forever.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
-- Async HTTP from Postgres. Pre-installed on Supabase; the guard is for a local
-- or self-hosted database where it may not be.
create extension if not exists pg_net;

/**
 * Fire one of the app's cron routes.
 *
 * A function rather than inline SQL in the job body for two reasons: the job
 * body is stored as text and would otherwise have to interpolate the secret at
 * schedule time (baking it into cron.job, where it survives every later
 * `select * from cron.job`), and a function can DECIDE NOT TO RUN — which is
 * what makes an un-configured project quiet instead of noisy.
 *
 * net.http_get is asynchronous: it queues the request and returns an id
 * immediately, so a slow tick can never hold a database worker open. Responses
 * land in net._http_response, which is where to look when a tick appears to
 * have done nothing.
 */
create or replace function public.anchor_tick(route text)
returns void
language plpgsql
security definer
-- Vault lives in its own schema and this runs as the definer; pinning the path
-- keeps it from resolving through a caller's.
set search_path = public, vault, net
as $$
declare
  app_url text;
  secret  text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'anchor_app_url';
  select decrypted_secret into secret  from vault.decrypted_secrets where name = 'anchor_cron_secret';

  -- Not configured yet. Silence is correct: this runs every five minutes, and a
  -- project that has not finished setup should not generate 288 errors a day.
  if app_url is null or secret is null then
    return;
  end if;

  perform net.http_get(
    url     := rtrim(app_url, '/') || route,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    -- Comfortably inside the route's own 60s budget; the call is async, so this
    -- only bounds how long pg_net waits before recording a timeout.
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.anchor_tick(text) from public, anon, authenticated;

comment on function public.anchor_tick(text) is
  'Calls one of Anchor''s /api/cron routes with the Bearer secret from Vault. No-ops until anchor_app_url and anchor_cron_secret are set.';

-- ─── The jobs ────────────────────────────────────────────────────────────────
-- Unscheduled first so re-applying re-points rather than duplicating (the 024
-- idiom); cron.unschedule raises when the job is absent, which is the normal
-- case on a fresh database.

do $$
begin
  perform cron.unschedule('anchor-reminders');
exception when others then null;
end$$;

do $$
begin
  perform cron.unschedule('anchor-eod-notify');
exception when others then null;
end$$;

-- Every five minutes. The scan itself decides whose local minute this is, and
-- claims each cue before delivering it, so an extra or overlapping tick costs
-- nothing.
select cron.schedule('anchor-reminders', '*/5 * * * *', $$select public.anchor_tick('/api/cron/reminders')$$);
select cron.schedule('anchor-eod-notify', '*/5 * * * *', $$select public.anchor_tick('/api/cron/eod-notify')$$);
