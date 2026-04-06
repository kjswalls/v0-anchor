-- Atomic toggle for recurring task completed_dates
-- Avoids read-modify-write race conditions when toggling per-date completion
CREATE OR REPLACE FUNCTION toggle_task_completed_date(task_id uuid, date_str text)
RETURNS void AS $$
BEGIN
  IF date_str = ANY(SELECT unnest(completed_dates) FROM tasks WHERE id = task_id) THEN
    UPDATE tasks SET completed_dates = array_remove(completed_dates, date_str) WHERE id = task_id;
  ELSE
    UPDATE tasks SET completed_dates = array_append(completed_dates, date_str) WHERE id = task_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Normalize stale recurring tasks: completedDates is now source of truth, status should be pending
UPDATE tasks
SET status = 'pending'
WHERE repeat_frequency != 'none'
  AND status = 'completed';
