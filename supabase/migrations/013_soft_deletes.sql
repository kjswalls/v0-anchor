ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE habit_groups ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Enable pg_cron (requires superuser; usually pre-enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule a nightly purge of items soft-deleted more than 30 days ago
SELECT cron.schedule('purge-deleted-items', '0 0 * * *', $$
  DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habit_groups WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
$$);
