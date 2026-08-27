-- 041_ai_status_at: when the agent's state last changed.
--
-- The item row can say "working" but not "working since when", and the gap
-- between those two is the whole signal: an agent four minutes into a task is
-- fine, an agent three hours in is stuck and nobody knows.
--
-- Why not `items.updated_at` (migration 019, trigger-maintained): it answers
-- "time since ANY edit". Renaming the task while the agent works would reset
-- the clock, and the row would confidently report a wrong number — worse than
-- reporting none. A dedicated stamp answers the question actually being asked.
--
-- Written by lib/db.ts as a COMPANION of `ai_status`, never on its own, so it
-- cannot drift from the status it timestamps. Idempotent, per the repo rule.

alter table public.items
  add column if not exists ai_status_at timestamptz;

comment on column public.items.ai_status_at is
  'When ai_status last changed. Stamped alongside ai_status by the app; never written alone.';

-- items_windowed freezes its column list at creation and fetchItems reads
-- `select('*')` from it, so a new column on `items` is invisible to the client
-- until the view is rebuilt. 031's header states the rule ("any later migration
-- that adds a column to items ends with this call") and 032 is the precedent;
-- this is the first migration since to add one. Without it the column exists,
-- every write succeeds, and every read returns undefined — silently, forever.
--
-- Guarded so the file still applies to a database predating 031.
do $$
begin
  if to_regprocedure('public.rebuild_items_windowed()') is not null then
    perform public.rebuild_items_windowed();
  end if;
end$$;

-- DELIBERATELY NOT BACKFILLED.
--
-- Rows already carrying an `ai_status` get a NULL stamp, so their row shows the
-- state with no elapsed reading until the next status change (which is the very
-- next thing a live agent does). The alternative — seeding from `updated_at` —
-- is the exact mistake this column exists to avoid: that timestamp moves on any
-- edit, so a task renamed since the agent started would report an elapsed time
-- shorter than the truth, and under-reporting HIDES the stuck run this feature
-- was built to surface. No number beats a wrong one.
