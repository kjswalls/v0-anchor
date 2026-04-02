import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Recurring tasks and habits', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  // Known bug: recurring tasks/habits may appear on wrong days — issue #90
  test.skip('daily habit appears on every day of the week (#90 — wrong-day bug)', async ({ page }) => {
    // BUG #90: habits with repeatFrequency="daily" show on incorrect dates.
    // Once fixed: create a daily habit, navigate through several days, and
    // assert the habit is visible on each day in the planner.
  });

  test('weekdays habit does not appear on Saturday', async ({ page }) => {
    test.skip(true, 'implement once auth + habit creation helpers are wired up');
    // Navigate to a Saturday, assert a "weekdays" habit is NOT rendered.
  });

  test('custom habit shows only on configured repeat days', async ({ page }) => {
    test.skip(true, 'implement once auth + habit creation helpers are wired up');
    // Create a habit with repeatDays=[1,3] (Mon/Wed), navigate through the week,
    // assert it is visible only on Mon and Wed.
  });
});
