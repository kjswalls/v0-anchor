import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/** Open the search input in the top nav. */
async function openSearch(page: import('@playwright/test').Page) {
  // The search icon button (ghost, h-8 w-8) toggles the search input visible.
  // There is no aria-label — find it by its SVG child (Search icon).
  // It's the first button that opens the search (before the search input is shown).
  const searchToggle = page.locator('button').filter({
    has: page.locator('svg.lucide-search'),
  }).first();
  await searchToggle.click();
  // The input appears with this placeholder
  await expect(page.getByPlaceholder('Search tasks & habits...')).toBeVisible();
}

test.describe('Search functionality', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('typing in search filters the task list to matching items', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    // Use a unique title so the search will only match this task.
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

      // Open search and type the unique task title.
      await openSearch(page);
      await page.getByPlaceholder('Search tasks & habits...').fill(uniqueTitle);

      // The search results dropdown lives inside the <header> element, not the main timeline.
      // Scope assertions to the header to avoid matching a task card in the background.
      const searchDropdown = page.locator('header').locator('div').filter({ has: page.getByText(/Tasks \(\d+\)/) }).first();
      await expect(searchDropdown.getByText(uniqueTitle)).toBeVisible({ timeout: 5_000 });

      // Verify the "Tasks" section header appears in results
      await expect(searchDropdown.getByText(/Tasks \(\d+\)/)).toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  // Known bug: mobile search icon is missing — issue #91
  test.skip('search icon is visible on mobile viewport (#91 — missing icon)', async ({ page }) => {
    // BUG #91: The search trigger icon is missing on mobile breakpoints.
    // Once fixed: set viewport to 375×812, assert the search icon is visible.
  });

  // Known bug: "task:" and "habit:" keyword filters not implemented — issue #93
  test.skip('"task:" keyword filters results to tasks only (#93)', async ({ page }) => {
    // BUG #93: keyword prefix search is not implemented.
    // Once fixed: type "task:standup" and assert only task items are shown.
  });

  test('clearing search restores full task list', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const uniqueTitle = `SearchClear_${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: uniqueTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Open search and type something that returns results.
      await openSearch(page);
      const input = page.getByPlaceholder('Search tasks & habits...');
      await input.fill(uniqueTitle);
      // Search results dropdown is in the header, not main.
      const searchDropdown2 = page.locator('header').locator('div').filter({ has: page.getByText(/Tasks \(\d+\)/) }).first();
      await expect(searchDropdown2.getByText(uniqueTitle)).toBeVisible({ timeout: 5_000 });

      // Click the X / clear button to close search.
      // The clear button is the X icon button inside the search container.
      const clearBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-x'),
      }).first();
      await clearBtn.click();

      // Search input should be gone; the toggle button (search icon) should be back.
      await expect(input).not.toBeVisible();

      // The task should still be visible in the timeline (not filtered).
      await expect(page.getByRole('main').getByText(uniqueTitle).first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
