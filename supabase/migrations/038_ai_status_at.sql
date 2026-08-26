-- 038_ai_status_at: when the agent's state last changed.
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
