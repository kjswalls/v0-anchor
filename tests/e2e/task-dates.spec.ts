import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { format, addDays } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const TOMORROW = format(addDays(new Date(), 1), 'yyyy-MM-dd');

test.describe('Task date assignment and display', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('task with today as start date appears in the current day view', async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Today task ${Date.now()}`;
    const taskId = await createTestTask(request, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // The task should appear in the day view timeline for today.
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(request, accessToken, [taskId]);
    }
  });

  test('task with a future start date does not appear in today view', async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Future task ${Date.now()}`;
    const taskId = await createTestTask(request, accessToken, {
      title: taskTitle,
      startDate: TOMORROW,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Ensure we're on today's day view (default) and the task is NOT visible.
      // Give the store a moment to hydrate, then assert absence.
      await page.waitForTimeout(2_000);
      await expect(page.getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(request, accessToken, [taskId]);
    }
  });

  test('changing a task start date via edit dialog moves it to the new date', async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Movable task ${Date.now()}`;
    // Create task for today
    const taskId = await createTestTask(request, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Task should be visible today.
      const taskText = page.getByText(taskTitle).first();
      await expect(taskText).toBeVisible({ timeout: 10_000 });

      // Move it to tomorrow via the API (simulating a date edit).
      await page.request.patch(`http://localhost:3000/api/agent/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { startDate: TOMORROW },
      });

      // Reload so the store reflects the change.
      await page.reload();
      await page.waitForURL('/');

      // Task should no longer appear today.
      await page.waitForTimeout(2_000);
      await expect(page.getByText(taskTitle)).not.toBeVisible();

      // Navigate to tomorrow by clicking the ">" button.
      const nextDayBtn = page.getByRole('button').filter({
        has: page.locator('svg.lucide-chevron-right'),
      }).first();
      await nextDayBtn.click();

      // Task should appear on tomorrow's view.
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(request, accessToken, [taskId]);
    }
  });
});
