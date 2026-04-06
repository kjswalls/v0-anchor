-- Add completed_dates column to tasks for per-date recurring task completion tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_dates text[] DEFAULT '{}';

-- Backfill: tasks with status=completed get their start_date as the single completed date (best-effort)
UPDATE tasks
SET completed_dates = ARRAY[start_date]
WHERE status = 'completed'
  AND start_date IS NOT NULL
  AND (completed_dates IS NULL OR completed_dates = '{}');
