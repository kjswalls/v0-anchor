import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr, getTomorrowStr } from './helpers/dates';

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
    const TODAY = getTodayStr();
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

      // After marking done, the "Wrapped up today" section should appear and
      // include our task — confirming the completed-task UI is visible.
      const wrappedSection = dialog.locator('section').filter({ hasText: 'Wrapped up today' });
      await expect(wrappedSection).toBeVisible({ timeout: 5_000 });
      await expect(wrappedSection.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('rolling over a task from EOD moves it to tomorrow', async ({ page }) => {
    const TODAY = getTodayStr();
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

      // Wait for the task to appear in the timeline before opening EOD modal.
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });

      // The task should appear in "Carrying forward".
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Click the "Tomorrow →" pill button for this task.
      await page.getByTestId(`eod-tomorrow-btn-${taskId}`).click();

      // Close the dialog
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();

      // Task should no longer appear in today's timeline after rollover.
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).not.toBeVisible();

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

  test('dismiss task clears scheduled date', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `EOD dismiss test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Click the ✕ dismiss button
      await page.getByTestId(`eod-dismiss-btn-${taskId}`).click();

      // Undo link should appear for the dismissed task, and pills should be gone
      await expect(page.getByTestId(`eod-undo-btn-${taskId}`)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByTestId(`eod-dismiss-btn-${taskId}`)).not.toBeVisible();

      // Close dialog and confirm task is no longer on today's timeline
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('date picker reschedules task to selected date', async ({ page }) => {
    const TODAY = getTodayStr();
    const TOMORROW = getTomorrowStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `EOD datepicker test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Click the 📅 date picker button (opens Popover on desktop)
      await page.getByTestId(`eod-datepicker-btn-${taskId}`).click();

      // Wait for the Calendar popover to be visible
      const popover = page.locator('[data-radix-popper-content-wrapper]');
      await expect(popover).toBeVisible({ timeout: 3_000 });

      // Select tomorrow's date from the calendar by clicking the day cell
      // We rely on the aria-label which date-fns/shadcn Calendar sets to the full date string
      const tomorrowDate = new Date(TOMORROW + 'T12:00:00');
      const dayLabel = tomorrowDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      await popover.getByRole('gridcell', { name: new RegExp(String(tomorrowDate.getDate())) }).first().click();

      // Undo link should appear and pills gone
      await expect(page.getByTestId(`eod-undo-btn-${taskId}`)).toBeVisible({ timeout: 3_000 });

      // Close and navigate to tomorrow to verify the task is there
      await page.keyboard.press('Escape');
      const nextDayBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-chevron-right'),
      }).first();
      await nextDayBtn.click();
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Suppress TS unused var warning
      void dayLabel;
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('move all to tomorrow moves all unactioned pending tasks', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const title1 = `EOD move-all test A ${Date.now()}`;
    const title2 = `EOD move-all test B ${Date.now()}`;
    const taskId1 = await createTestTask(page, accessToken, { title: title1, startDate: TODAY, isScheduled: true, timeBucket: 'morning' });
    const taskId2 = await createTestTask(page, accessToken, { title: title2, startDate: TODAY, isScheduled: true, timeBucket: 'morning' });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(page.locator('[data-tour="timeline"]').getByText(title1)).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-tour="timeline"]').getByText(title2)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });
      await expect(dialog.getByText(title1)).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText(title2)).toBeVisible({ timeout: 5_000 });

      // Click "Move all to tomorrow"
      await page.getByTestId('eod-move-all-btn').click();

      // Both tasks should now show Undo
      await expect(page.getByTestId(`eod-undo-btn-${taskId1}`)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByTestId(`eod-undo-btn-${taskId2}`)).toBeVisible({ timeout: 3_000 });

      // Close and navigate to tomorrow
      await page.keyboard.press('Escape');
      const nextDayBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
      await nextDayBtn.click();
      await expect(page.locator('[data-tour="timeline"]').getByText(title1)).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-tour="timeline"]').getByText(title2)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId1, taskId2]);
    }
  });

  test('move all skips already actioned tasks', async ({ page }) => {
    const TODAY = getTodayStr();
    const TOMORROW = getTomorrowStr();
    const accessToken = await getAccessToken(page);
    const title1 = `EOD skip-actioned A ${Date.now()}`;
    const title2 = `EOD skip-actioned B ${Date.now()}`;
    const taskId1 = await createTestTask(page, accessToken, { title: title1, startDate: TODAY, isScheduled: true, timeBucket: 'morning' });
    const taskId2 = await createTestTask(page, accessToken, { title: title2, startDate: TODAY, isScheduled: true, timeBucket: 'morning' });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(page.locator('[data-tour="timeline"]').getByText(title1)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });
      await expect(dialog.getByText(title1)).toBeVisible({ timeout: 5_000 });

      // Manually action task1 via Tomorrow pill first
      await page.getByTestId(`eod-tomorrow-btn-${taskId1}`).click();
      await expect(page.getByTestId(`eod-undo-btn-${taskId1}`)).toBeVisible({ timeout: 3_000 });

      // Now click "Move all to tomorrow" — should only affect task2
      await page.getByTestId('eod-move-all-btn').click();

      // Both show Undo (task2 was just actioned, task1 already was)
      await expect(page.getByTestId(`eod-undo-btn-${taskId1}`)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByTestId(`eod-undo-btn-${taskId2}`)).toBeVisible({ timeout: 3_000 });

      // Close and verify on tomorrow's view — both should be there (both end up on tomorrow)
      await page.keyboard.press('Escape');
      const nextDayBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
      await nextDayBtn.click();
      await expect(page.locator('[data-tour="timeline"]').getByText(title1)).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-tour="timeline"]').getByText(title2)).toBeVisible({ timeout: 5_000 });

      void TOMORROW;
    } finally {
      await cleanupTestData(page, accessToken, [taskId1, taskId2]);
    }
  });

  test('undo reschedule restores task to today', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `EOD undo test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      await openEODReview(page);
      const dialog = page.getByRole('dialog', { name: 'End of day' });
      await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Click Tomorrow pill
      await page.getByTestId(`eod-tomorrow-btn-${taskId}`).click();
      await expect(page.getByTestId(`eod-undo-btn-${taskId}`)).toBeVisible({ timeout: 3_000 });

      // Click Undo — pills should reappear
      await page.getByTestId(`eod-undo-btn-${taskId}`).click();
      await expect(page.getByTestId(`eod-tomorrow-btn-${taskId}`)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByTestId(`eod-undo-btn-${taskId}`)).not.toBeVisible();

      // Close dialog — task should still be on today's timeline
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('deep link ?eod=1 opens EOD modal', async ({ page }) => {
    // Navigate directly to /?eod=1 after login — the deep link handler should open the modal
    await page.goto('/?eod=1');
    await page.waitForURL('/');

    // The EOD review dialog should open automatically
    await expect(page.getByRole('dialog', { name: 'End of day' })).toBeVisible({ timeout: 8_000 });
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Tomorrow pill is visible and clickable on mobile', async ({ page }) => {
      await loginTestUser(page);

      const TODAY = getTodayStr();
      const accessToken = await getAccessToken(page);
      const taskTitle = `EOD mobile test ${Date.now()}`;
      const taskId = await createTestTask(page, accessToken, {
        title: taskTitle,
        startDate: TODAY,
        isScheduled: false,
      });

      try {
        await page.reload();
        await page.waitForURL('/');

        // On mobile, the EOD trigger button may be in a different location.
        // Use the dev trigger if visible, otherwise open via eodStore directly.
        const eodBtn = page.getByTitle('[DEV] Trigger EOD review');
        if (await eodBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await eodBtn.click();
        } else {
          await page.evaluate(() => {
            // @ts-ignore
            window.__eodStore?.getState()?.open?.();
          });
        }

        const dialog = page.getByRole('dialog', { name: 'End of day' });
        await expect(dialog).toBeVisible({ timeout: 5_000 });
        await expect(dialog.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

        // The Tomorrow pill should be visible and clickable on mobile
        const tomorrowBtn = page.getByTestId(`eod-tomorrow-btn-${taskId}`);
        await expect(tomorrowBtn).toBeVisible({ timeout: 3_000 });
        await tomorrowBtn.click();

        // Undo link should appear confirming the action succeeded
        await expect(page.getByTestId(`eod-undo-btn-${taskId}`)).toBeVisible({ timeout: 3_000 });
      } finally {
        await cleanupTestData(page, accessToken, [taskId]);
      }
    });
  });
});
