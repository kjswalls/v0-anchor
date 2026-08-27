-- ─────────────────────────────────────────────────────────────────────────────
-- 037_disk_io_hygiene.sql — cut background WRITE IO, not read IO
--
-- WHY THIS EXISTS. Supabase emailed that the project is draining its Disk IO
-- Budget. Measuring (pg_statio_user_tables) showed the whole database is ~1 MB
-- and reads are ~100% cache hits — so the budget is going to WRITES, not reads.
-- Two write sources this migration addresses:
--
--   1. Four indexes the planner never uses (confirmed by the performance
--      advisor, `unused_index`). An unused index still has to be maintained on
--      every INSERT/UPDATE/DELETE of its table — pure write amplification for
--      zero read benefit. Two guard the reminder feature (items_reminder_*), two
--      guard stakes (stake_events_*); nothing queries by those shapes today.
--      NOTE: if the reminders scan (lib/reminders/scan.ts) is ever pushed down
--      into SQL — filtering `reminder_time` server-side instead of reading every
--      item and filtering in memory — a targeted index may be worth re-adding
--      then. Until that query exists, these earn nothing.
--
--   2. pg_cron's own run log (cron.job_run_details) grows unbounded — one row
--      per job per fire, and this project fires two jobs every 5 minutes = 576
--      rows/day forever. A daily prune keeps it small so its autovacuum stays
--      cheap. (net._http_response is already bounded by pg_net.ttl = 6h, so it
--      is intentionally left alone.)
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Drop the unused indexes (write cost, no read benefit) ────────────────
-- CONCURRENTLY is unavailable inside the transaction a migration runs in, but
-- DROP INDEX takes only a brief lock and these tables are tiny.
drop index if exists public.items_reminder_time_idx;
drop index if exists public.items_reminder_snooze_idx;
drop index if exists public.stake_events_user_date_idx;
drop index if exists public.stake_events_pending_idx;

-- ─── 2. Keep pg_cron's run log from growing forever ──────────────────────────
-- Same idempotent idiom as 035: unschedule (raises if absent — the fresh-DB
-- case) before scheduling, so re-applying re-points rather than duplicating.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('prune-cron-log');
exception when others then null;
end$$;

-- 03:17 daily, an odd minute so it does not pile onto the top-of-hour ticks.
-- Keeps 3 days of history — enough to debug a failed tick, small enough that the
-- table never accumulates.
select cron.schedule(
  'prune-cron-log',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$
);
