import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/**
 * Omnibar (sidebar bottom input) — search, quick-add, and /commands.
 * Replaces the retired top-nav search spec (search.spec.ts).
 */

const OMNIBAR = '[data-tour="omnibar"]';

function omnibarInput(page: import('@playwright/test').Page) {
  return page.getByLabel('Omnibar');
}

test.describe('Omnibar', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('typing shows matching results; Enter on a result opens its edit dialog', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const uniqueTitle = `SearchTarget_${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: uniqueTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      await omnibarInput(page).fill(uniqueTitle);

      const panel = page.locator(OMNIBAR);
      await expect(panel.getByText(uniqueTitle)).toBeVisible({ timeout: 5_000 });

      // Top result is selected by default; Enter opens the edit dialog.
      await omnibarInput(page).press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('dialog').getByDisplayValue(uniqueTitle)).toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('"task:" keyword filters results to tasks only (#93)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const marker = `Kw_${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: `${marker} task item`,
      isScheduled: false,
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      await omnibarInput(page).fill(`task:${marker}`);

      const panel = page.locator(OMNIBAR);
      await expect(panel.getByText(`${marker} task item`)).toBeVisible({ timeout: 5_000 });
      await expect(panel.getByText('Habits', { exact: true })).toHaveCount(0);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('Add-task action creates the task in the braindump', async ({ page }) => {
    const title = `OmniAdd_${Date.now()}`;

    await page.waitForURL('/');
    await omnibarInput(page).fill(title);

    const panel = page.locator(OMNIBAR);
    await panel.getByText('Add task').click();

    // New unscheduled task lands in the braindump list.
    await expect(
      page.locator('[data-dnd-id="sidebar"]').getByText(title).first()
    ).toBeVisible({ timeout: 10_000 });

    // Persisted, not just optimistic.
    await page.reload();
    await page.waitForURL('/');
    await expect(
      page.locator('[data-dnd-id="sidebar"]').getByText(title).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"/" prefix filters commands and runs them', async ({ page }) => {
    await page.waitForURL('/');
    await omnibarInput(page).fill('/settings');

    const panel = page.locator(OMNIBAR);
    await expect(panel.getByText('Settings', { exact: true })).toBeVisible({ timeout: 5_000 });
    // Non-matching commands are filtered out.
    await expect(panel.getByText('Report a bug')).toHaveCount(0);

    await panel.getByText('Settings', { exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('dialog').getByText('Settings').first()).toBeVisible();
  });

  test('Escape clears the query and closes the panel', async ({ page }) => {
    await page.waitForURL('/');
    const input = omnibarInput(page);
    await input.fill('anything');
    await input.press('Escape');

    await expect(input).toHaveValue('');
    await expect(page.locator(OMNIBAR).getByText('Add task')).toHaveCount(0);
  });
});

test.describe('Braindump', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('unscheduled tasks appear in the braindump list', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `Braindump_${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title,
      isScheduled: false,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await expect(
        page.locator('[data-dnd-id="sidebar"]').getByText(title).first()
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
