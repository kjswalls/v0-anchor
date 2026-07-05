import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/**
 * The scope × layout view matrix behind the header capsule (P5).
 * Buckets/List × Day/Week; Schedule lands in P5d.
 */
test.describe('View matrix', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('cycles day/week × buckets/list and persists the choice', async ({ page }) => {
    // Day × Buckets (default): bucket sections present
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 10_000 });

    // Day × List: bucket droppables gone
    await page.getByText('List', { exact: true }).click();
    await expect(page.locator('[data-dnd-bucket="morning"]')).toHaveCount(0, { timeout: 5_000 });

    // Week × List: seven day headings (one per weekday)
    await page.getByText('Week', { exact: true }).click();
    await expect(page.getByText('today', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Week × Buckets: week drop cells appear
    await page.getByText('Buckets', { exact: true }).click();
    await expect(page.locator('[data-dnd-id^="week:"]').first()).toBeVisible({ timeout: 5_000 });

    // Prefs persist across reload (view-store localStorage)
    await page.reload();
    await page.waitForURL('/');
    await expect(page.locator('[data-dnd-id^="week:"]').first()).toBeVisible({ timeout: 10_000 });

    // Back to defaults for other tests
    await page.getByText('Day', { exact: true }).click();
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 5_000 });
  });

  test('type filter hides tasks in every layout', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `Matrix_${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      const canvas = page.locator('[data-tour="timeline"]');
      await expect(canvas.getByText(title)).toBeVisible({ timeout: 10_000 });

      await page.getByText('Habits', { exact: true }).first().click();
      await expect(canvas.getByText(title)).toHaveCount(0, { timeout: 5_000 });

      await page.getByText('All', { exact: true }).first().click();
      await expect(canvas.getByText(title)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('week-buckets highlights and selects days', async ({ page }) => {
    await page.getByText('Week', { exact: true }).click();
    await page.getByText('Buckets', { exact: true }).click();
    await expect(page.getByText('today', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Clicking another day header moves the selection (capsule date changes)
    const headers = page.locator('button[title^="Select "]');
    await headers.first().click();
    await page.getByText('Day', { exact: true }).click();
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 5_000 });
  });
});
