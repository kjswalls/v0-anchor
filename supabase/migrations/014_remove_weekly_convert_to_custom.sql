-- Migration: convert legacy 'weekly' repeat_frequency to 'custom' and enforce valid values

-- Convert weekly → custom in tasks (preserve repeat_days, default to {} if null)
UPDATE tasks
SET
  repeat_frequency = 'custom',
  repeat_days = COALESCE(repeat_days, ARRAY[]::integer[])
WHERE repeat_frequency = 'weekly';

-- Convert weekly → custom in habits (preserve repeat_days, default to {} if null)
UPDATE habits
SET
  repeat_frequency = 'custom',
  repeat_days = COALESCE(repeat_days, ARRAY[]::integer[])
WHERE repeat_frequency = 'weekly';

-- Add check constraint on tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_repeat_frequency_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_repeat_frequency_check
      CHECK (repeat_frequency IN ('none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'));
  END IF;
END$$;

-- Add check constraint on habits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'habits_repeat_frequency_check'
  ) THEN
    ALTER TABLE habits
      ADD CONSTRAINT habits_repeat_frequency_check
      CHECK (repeat_frequency IN ('none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'));
  END IF;
END$$;
