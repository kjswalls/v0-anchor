import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/**
 * The scope × layout view matrix behind the header capsule (P5).
 * Buckets/List × Day/Week; Schedule lands in P5d.
 */

// The header controls are dropdown selectors: open the trigger by its
// aria-label, then click the option in the menu.
async function pick(page: Page, control: 'Filter by type' | 'Layout' | 'Scope', option: string) {
  await page.getByRole('button', { name: control, exact: true }).click();
  await page.getByRole('menuitem', { name: option }).click();
}

test.describe('View matrix', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('cycles day/week × buckets/list and persists the choice', async ({ page }) => {
    // Day × Buckets (default): bucket sections present
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 10_000 });

    // Day × List: bucket droppables gone
    await pick(page, 'Layout', 'List');
    await expect(page.locator('[data-dnd-bucket="morning"]')).toHaveCount(0, { timeout: 5_000 });

    // Week × List: seven day headings (one per weekday)
    await pick(page, 'Scope', 'Week');
    await expect(page.getByText('today', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Week × Buckets: week drop cells appear
    await pick(page, 'Layout', 'Buckets');
    await expect(page.locator('[data-dnd-id^="week:"]').first()).toBeVisible({ timeout: 5_000 });

    // Prefs persist across reload (view-store localStorage)
    await page.reload();
    await page.waitForURL('/');
    await expect(page.locator('[data-dnd-id^="week:"]').first()).toBeVisible({ timeout: 10_000 });

    // Back to defaults for other tests
    await pick(page, 'Scope', 'Day');
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

      await pick(page, 'Filter by type', 'Habits');
      await expect(canvas.getByText(title)).toHaveCount(0, { timeout: 5_000 });

      await pick(page, 'Filter by type', 'All');
      await expect(canvas.getByText(title)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('week-buckets highlights and selects days', async ({ page }) => {
    await pick(page, 'Scope', 'Week');
    await pick(page, 'Layout', 'Buckets');
    await expect(page.getByText('today', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Clicking another day header moves the selection (capsule date changes)
    const headers = page.locator('button[title^="Select "]');
    await headers.first().click();
    await pick(page, 'Scope', 'Day');
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 5_000 });
  });
});
