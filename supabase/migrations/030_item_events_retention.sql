-- ─────────────────────────────────────────────────────────────────────────────
-- 030_item_events_retention — put the activity feed on the nightly purge
--
-- item_events (023) is the one table in the schema with no retention at all.
-- The nightly `purge-deleted-items` job covers items, projects, habit_groups,
-- routines, programs and the two frozen legacy tables — but the feed was added
-- after that job was last rewritten (024) and never joined it. Its rows are
-- deliberately FK-free so they survive the item's hard delete, which means
-- nothing else ever collects them either: the table only grows.
--
-- 180 DAYS, matching HEATMAP_WEEKS (26 weeks in
-- components/planner/item-detail-sections.tsx) — the deepest history any
-- surface in the app renders. A trace older than the longest view that could
-- show it has no reader left. The feed is also read 50 rows at a time
-- (fetchItemEvents), so this is a storage bound, not a behavioral change.
--
-- Deleting by created_at with no user scope is intentional: this is a global
-- housekeeping job, the same posture as every other line in the cron body.
--
-- NOTE ON THE REWRITE. cron.schedule cannot patch a job body, so the whole job
-- is unscheduled and re-created. Every DELETE from 024 is reproduced verbatim
-- below — dropping one here would silently retire that table's purge. If a
-- later migration touches this job again, it must carry all of these forward.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  perform cron.unschedule('purge-deleted-items');
exception when others then
  null; -- job absent (fresh database) — nothing to unschedule
end$$;

select cron.schedule('purge-deleted-items', '0 0 * * *', $$
  DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habit_groups WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM routines WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM programs WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM item_events WHERE created_at < NOW() - INTERVAL '180 days';
$$);

-- The feed index is (user_id, item_id, created_at desc) — good for reads, no
-- help to a global created_at sweep. One nightly seq scan on a table this size
-- is cheaper than carrying a second index, so this is deliberate.
comment on table public.item_events is
  'Per-item activity feed. Best-effort traces, never load-bearing app state. '
  'Purged nightly at 180 days by the purge-deleted-items cron job — the same '
  'horizon as the deepest history surface (the 26-week completion heatmap).';
