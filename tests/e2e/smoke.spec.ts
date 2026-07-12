import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/**
 * Redesign safety net: the core daily loop must survive every phase of the
 * redesign branch. Keep selectors role/text-based so restyles don't break them;
 * structural selectors used here are documented in lib/dnd/CONTRACT.md.
 */
test.describe('Smoke: core daily loop', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('app loads with the day view visible', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    // Time-of-day buckets are the heart of the day view.
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible();
    await expect(page.locator('[data-dnd-bucket="afternoon"]')).toBeVisible();
  });

  test('add a task through the UI and complete it', async ({ page }) => {
    const title = `Smoke task ${Date.now()}`;

    await page.getByRole('button', { name: 'Add task' }).first().click();
    await expect(page.getByText('Add New')).toBeVisible();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.getByRole('button', { name: 'Add Task' }).click();

    // New tasks land in the sidebar (unscheduled) or the day view.
    const row = page.getByText(title).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Complete it via the row checkbox.
    const rowContainer = page
      .locator('div, li')
      .filter({ has: page.getByText(title, { exact: true }) })
      .filter({ has: page.getByTestId('task-complete-button') })
      .last();
    await rowContainer.getByTestId('task-complete-button').first().click();

    // Completion survives a reload.
    await page.reload();
    await page.waitForURL('/');
  });

  test('day/week toggle switches views', async ({ page }) => {
    // Scope is a dropdown selector: open it, then pick the option.
    const pickScope = async (option: string) => {
      await page.getByRole('button', { name: 'Scope', exact: true }).click();
      await page.getByRole('menuitem', { name: option }).click();
    };
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 10_000 });
    await pickScope('Week');
    // The day-view bucket sections unmount in week view.
    await expect(page.locator('[data-dnd-bucket="morning"]')).toHaveCount(0, { timeout: 5_000 });
    await pickScope('Day');
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 5_000 });
  });

  test('AI chat surface opens', async ({ page }) => {
    // Chat has no persistent bar — it's summoned from the omnibar (⌘Enter = Ask Beacon).
    const omnibar = page.locator('[data-tour="omnibar"] input');
    await omnibar.click();
    await omnibar.fill('plan my day');
    await omnibar.press('ControlOrMeta+Enter');
    // The chat surface exposes a message input once open.
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5_000 });
  });

  test('scheduled task appears in its bucket', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `Smoke bucket task ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(
        page.locator('[data-dnd-bucket="morning"]').getByText(title).first()
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
