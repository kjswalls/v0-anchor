# Plan: Soft Deletes (#52)

## 1. Database Migration (with pg_cron)
Create a new Supabase migration (`013_soft_deletes.sql`) to add `deleted_at` to the primary tables and schedule a nightly trash bin purge:
```sql
ALTER TABLE tasks ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE habits ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE habit_groups ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE projects ADD COLUMN deleted_at timestamptz DEFAULT NULL;

-- Enable pg_cron if not already enabled (requires supabase dashboard or superuser, but usually enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule a job to run every day at midnight (UTC)
SELECT cron.schedule('purge-deleted-items', '0 0 * * *', $$
  DELETE FROM tasks WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habits WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM habit_groups WHERE deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM projects WHERE deleted_at < NOW() - INTERVAL '30 days';
$$);
```

## 2. API / Supabase Client Updates
- **`lib/db.ts`**:
  - Update `deleteTask`, `deleteHabit`, `deleteProject`, and `deleteHabitGroup` to perform an `UPDATE` setting `deleted_at = now()` instead of a `DELETE` query.
  - Create a new `restoreTask` (etc.) that sets `deleted_at = null`.
  - Update `fetchTasks` (and others) to append `.is('deleted_at', null)` so deleted items never reach the client.

## 3. Zustand Store Fix (Real Undo)
- Currently, `undo()` in `planner-store.ts` just swaps out local memory state. It doesn't sync restores back to the database.
- We will wire the undo system to accurately restore `deleted_at = null` for soft-deleted items so they persist across page reloads.

## 4. UI: Sonner Toast Close Buttons
- Update `app/layout.tsx` to add the `closeButton` prop to the `<Toaster />` component so users can dismiss the UI-blocking toasts immediately.
