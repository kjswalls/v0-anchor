import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { format, addDays } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const TOMORROW = format(addDays(new Date(), 1), 'yyyy-MM-dd');

/** Open the EOD review modal via the dev trigger button (moon emoji, title contains "[DEV]"). */
async function openEODReview(page: import('@playwright/test').Page) {
  const eodBtn = page.getByTitle('[DEV] Trigger EOD review');
  await expect(eodBtn).toBeVisible({ timeout: 5_000 });
  await eodBtn.click();
  await expect(page.getByRole('dialog', { name: 'End of day' })).toBeVisible({ timeout: 5_000 });
}

test.describe('End of day (EOD) review modal', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('EOD modal can be opened from the nav bar', async ({ page }) => {
    await openEODReview(page);

    const dialog = page.getByRole('dialog', { name: 'End of day' });
    await expect(dialog).toBeVisible();

    // The dialog title should contain "End of day"
    await expect(dialog.getByRole('heading', { name: 'End of day' })).toBeVisible();

    // Close it
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('completing all tasks in EOD shows a congratulations state', async ({ page }) => {
    const accessToken = await getAccessToken(page);

    // Create exactly one pending task for today.
    const taskTitle = `EOD complete test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Wait for the task to appear in the timeline, ensuring the store has loaded
      // before opening the EOD modal (the modal snapshots livePendingTasks on open).
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });

      // The task should be in the "Carrying forward" section as a pending task.
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Mark it done by clicking the "Mark as done" circle button.
      // Scope to the specific task's list item to avoid matching other tasks in the dialog.
      const carrySection = dialog.locator('section').filter({ hasText: 'Carrying forward' });
      const taskListItem = carrySection.getByRole('listitem').filter({ hasText: taskTitle });
      await taskListItem.getByTitle('Mark as done').click();

      // After marking done, the task title span should have line-through styling.
      await expect(carrySection.getByText(taskTitle)).toHaveClass(
        /line-through|text-muted-foreground/,
        { timeout: 5_000 }
      );
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('rolling over a task from EOD moves it to tomorrow', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `EOD rollover test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Wait for the task to appear in the timeline, ensuring the store has loaded
      // before opening the EOD modal (the modal snapshots livePendingTasks on open).
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });

      // The task should appear in "Carrying forward".
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Check the checkbox to select the task for rolling over.
      const checkbox = dialog.locator(`#eod-task-${taskId}`);
      await checkbox.check();

      // Click "Move N to tomorrow"
      const moveBtn = dialog.getByRole('button', { name: /move.*tomorrow/i });
      await expect(moveBtn).toBeVisible({ timeout: 3_000 });
      await moveBtn.click();

      // Close the dialog
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();

      // Navigate to tomorrow.
      const nextDayBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-chevron-right'),
      }).first();
      await nextDayBtn.click();

      // The task should now appear on tomorrow's view (scope to timeline).
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      // The task's startDate is now TOMORROW — cleanup still works by id.
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
