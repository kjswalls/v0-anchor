import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Drag and drop flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('dragging a task to a different time bucket reassigns its bucket', async ({ page }) => {
    test.skip(true, 'implement once DnD helpers are ready');
    // Create a "morning" task, drag it to the "afternoon" bucket, assert that
    // the task's timeBucket field updates to "afternoon" in the UI.
  });

  test('dragging a task to unscheduled removes its time assignment', async ({ page }) => {
    test.skip(true, 'implement once DnD helpers are ready');
    // Drag a scheduled task to the unscheduled zone and assert isScheduled=false.
  });

  test('task order persists after drag-and-drop reorder within a bucket', async ({ page }) => {
    test.skip(true, 'implement once DnD helpers are ready');
    // Reorder two tasks within the same time bucket, reload the page, and assert
    // the new order is preserved (persisted to Supabase).
  });
});
