import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Task date assignment and display', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('task with today as start date appears in the current day view', async ({ page }) => {
    // TODO: Create a task via the UI, set its start date to today,
    // and assert it is visible in the day-view timeline.
    test.skip(true, 'implement once auth + task creation helpers are wired up');
  });

  test('task with a future start date does not appear in today view', async ({ page }) => {
    // TODO: Create a task with start_date = tomorrow, navigate to today's view,
    // and assert the task is NOT visible.
    test.skip(true, 'implement once auth + task creation helpers are wired up');
  });

  test('changing a task start date via edit dialog moves it to the new date', async ({ page }) => {
    // TODO: Edit an existing task, change the date, assert it disappears from
    // the original date view and appears on the new date.
    test.skip(true, 'implement once auth + task creation helpers are wired up');
  });
});
