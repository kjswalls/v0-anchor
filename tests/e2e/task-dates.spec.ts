import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import {
  getAccessToken,
  createTestTask,
  cleanupTestData,
  fetchTestTask,
  testTitle,
} from './helpers/api';
import { getTodayStr, getTomorrowStr } from './helpers/dates';
import { reloadApp, itemCard, navigateToDate } from './helpers/app';

test.describe('Task date assignment and display', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('task with today as start date appears in the current day view', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('today-task');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      // The task should appear in the day view timeline for today.
      await expect(page.getByRole('main').getByText(taskTitle).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('task with a future start date does not appear in today view', async ({ page }) => {
    const TOMORROW = getTomorrowStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('future-task');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TOMORROW,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      // Ensure we're on today's day view (default) and the task is NOT visible.
      // Give the store a moment to hydrate, then assert absence.
      await page.waitForTimeout(2_000);
      await expect(page.getByRole('main').getByText(taskTitle).first()).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('changing a task start date via edit dialog moves it to the new date', async ({ page }) => {
    const TODAY = getTodayStr();
    const TOMORROW = getTomorrowStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('movable-task');
    // Create task for today
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      await expect(itemCard(page, taskId)).toBeVisible({ timeout: 10_000 });

      // Change the date through the REAL dialog. The previous version of this test
      // PATCHed the agent API and reloaded, under a comment reading "simulating a
      // date edit" — so despite its name it never touched the dialog, and the
      // off-by-one guard in its local-date parsing was untested.
      await itemCard(page, taskId).getByText(taskTitle, { exact: true }).click();
      const dialog = page.getByTestId('item-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('data-mode', 'edit');

      // The date chip's TOMORROW shortcut, not a calendar grid cell. The grid cell
      // never settled — Playwright retried 'visible, enabled and stable' 96 times —
      // because the calendar sits in an animating popover that the dialog portals
      // outside itself. The shortcut is the same code path (it patches startDate)
      // and is a plain button.
      await dialog.getByTestId('item-dialog-date-chip').click();
      const popover = page.locator('[data-slot="popover-content"]').last();
      await expect(popover).toBeVisible({ timeout: 5_000 });
      await popover
        .locator('[data-testid="item-dialog-date-shortcut"][data-value="tomorrow"]')
        .click();

      await dialog.getByTestId('item-dialog-submit').click();
      await expect(dialog).toHaveCount(0);

      // Gone from today…
      await expect(itemCard(page, taskId)).toHaveCount(0, { timeout: 10_000 });

      // …present tomorrow, and persisted there.
      await navigateToDate(page, TOMORROW);
      await expect(itemCard(page, taskId)).toBeVisible({ timeout: 10_000 });

      const persisted = await fetchTestTask(page, taskId);
      expect(persisted?.startDate).toBe(TOMORROW);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
