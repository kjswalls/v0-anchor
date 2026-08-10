import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData, testTitle } from './helpers/api';
import { getTodayStr } from './helpers/dates';
import { reloadApp,     currentDateStr } from './helpers/app';

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
    await reloadApp(page);
    await expect(page.locator('[data-dnd-id^="week:"]').first()).toBeVisible({ timeout: 10_000 });

    // Back to defaults for other tests
    await pick(page, 'Scope', 'Day');
    await expect(page.locator('[data-dnd-bucket="morning"]')).toBeVisible({ timeout: 5_000 });
  });

  test('type filter hides tasks in every layout', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = testTitle('matrix');
    const taskId = await createTestTask(page, accessToken, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);
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

  test('week-buckets marks today and moves the selection when a day is clicked', async ({
    page,
  }) => {
    // Two separate bugs used to live here. The 'today' text assertion could never
    // pass: that literal is rendered ONLY by week-LIST, and this test is in
    // week-BUCKETS. And the second half was named "selects days" but, after
    // clicking a header, only asserted that the morning bucket exists — true in
    // every possible state, so it proved nothing about selection at all.
    await pick(page, 'Scope', 'Week');
    await pick(page, 'Layout', 'Buckets');

    // Exactly one column is today, and it is the selected one on arrival.
    const columns = page.getByTestId('week-column');
    await expect(columns.first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="week-column"][data-today="true"]')).toHaveCount(1);
    const todayStr = await currentDateStr(page);
    await expect(
      page.locator(`[data-testid="week-column"][data-date="${todayStr}"]`)
    ).toHaveAttribute('data-selected', 'true');

    // Click a DIFFERENT column and the selection follows it.
    const other = page.locator(`[data-testid="week-column"]:not([data-date="${todayStr}"])`).first();
    const otherDate = await other.getAttribute('data-date');
    await other.getByTestId('week-column-header').click();

    await expect(
      page.locator(`[data-testid="week-column"][data-date="${otherDate}"]`)
    ).toHaveAttribute('data-selected', 'true');
    await expect(
      page.locator(`[data-testid="week-column"][data-date="${todayStr}"]`)
    ).toHaveAttribute('data-selected', 'false');
    // …and the header capsule agrees, which is what "selection" means downstream.
    expect(await currentDateStr(page)).toBe(otherDate);
  });
});
