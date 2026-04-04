import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/** Open the settings dialog via the user profile dropdown. */
async function openSettings(page: import('@playwright/test').Page) {
  // The user avatar / profile button opens a dropdown with a "Settings" item.
  // UserProfileDropdown → DropdownMenuTrigger (aria-label="User menu") → DropdownMenuItem("Settings").
  await page.getByRole('button', { name: 'User menu' }).click();

  // If the dropdown opened, "Settings" should be visible.
  const settingsItem = page.getByRole('menuitem', { name: 'Settings' });
  await settingsItem.click();

  // Wait for the dialog to be visible.
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
}

test.describe('Settings persistence', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('changing time format to 24h persists after page reload', async ({ page }) => {
    await openSettings(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });

    // Find the "Time format" select and switch to 24-hour.
    const timeFormatSelect = dialog.getByRole('combobox').first();
    await timeFormatSelect.click();

    // Pick "24-hour"
    await page.getByRole('option', { name: /24.hour/i }).click();

    // Close the dialog
    await page.keyboard.press('Escape');

    // Reload and reopen to verify persistence.
    await page.reload();
    await page.waitForURL('/');

    // In 24h mode the morning bucket shows "00:00 - 12:00" instead of "12am - 12pm".
    await expect(page.getByText('00:00 - 12:00')).toBeVisible({ timeout: 10_000 });

    // Restore 12h so other tests aren't affected.
    await openSettings(page);
    const select2 = page.getByRole('dialog', { name: 'Settings' }).getByRole('combobox').first();
    await select2.click();
    await page.getByRole('option', { name: /12.hour/i }).click();
    await page.keyboard.press('Escape');
  });

  // Known bug: desktop sidebar scroll is broken — issue #92
  test.skip('settings sidebar scrolls on desktop viewport (#92 — scroll broken)', async ({ page }) => {
    // BUG #92: The settings/sidebar panel does not scroll properly on desktop.
    // Once fixed: set viewport to 1280×800, open settings panel, scroll to
    // bottom, assert the last setting item is visible.
  });

  test('toggling compact mode affects task card height', async ({ page }) => {
    // Seed a task so a task card is present in the timeline to measure.
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `Compact mode test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });
    await page.reload();
    await page.waitForURL('/');
    // Wait for the task card to appear before measuring.
    await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

    try {
    await openSettings(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });

    // The "Appearance" section is collapsed by default — expand it first.
    await dialog.getByRole('button', { name: 'Appearance' }).click();

    // Find the Compact mode row; navigate to its sibling switch.
    const compactRow = dialog.locator('div').filter({ hasText: /^Compact mode$/ }).first();
    await expect(compactRow).toBeVisible({ timeout: 5_000 });
    const compactSwitch = compactRow.locator('xpath=ancestor::div[contains(@class,"flex items-center justify-between")]').getByRole('switch');

    // Ensure compact mode is OFF before measuring normal height.
    const isChecked = await compactSwitch.getAttribute('data-state');
    if (isChecked === 'checked') {
      await compactSwitch.click();
      await page.waitForTimeout(300);
    }

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Measure a task card height in normal mode.
    // Task cards have class "group/card" (Tailwind named group).
    const taskCard = page.locator('[class*="group\\/card"]').first();
    await expect(taskCard).toBeVisible({ timeout: 5_000 });
    const normalBox = await taskCard.boundingBox();

    // Re-open settings, expand Appearance, and enable compact mode.
    await openSettings(page);
    const dialog2 = page.getByRole('dialog', { name: 'Settings' });
    await dialog2.getByRole('button', { name: 'Appearance' }).click();
    const compactRow2 = dialog2.locator('div').filter({ hasText: /^Compact mode$/ }).first();
    await expect(compactRow2).toBeVisible({ timeout: 5_000 });
    const compactSwitch2 = compactRow2.locator('xpath=ancestor::div[contains(@class,"flex items-center justify-between")]').getByRole('switch');
    const state2 = await compactSwitch2.getAttribute('data-state');
    if (state2 !== 'checked') {
      await compactSwitch2.click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Escape');
    await expect(dialog2).not.toBeVisible();

    // In compact mode the task card should be shorter (min-h-[52px] vs min-h-[72px]).
    const compactBox = await page.locator('[class*="group\\/card"]').first().boundingBox();

    // Verify compact mode reduced task card height.
    expect(compactBox!.height).toBeLessThan(normalBox!.height);

    // Restore: open settings, expand Appearance, turn compact mode off.
    await openSettings(page);
    const dialog3 = page.getByRole('dialog', { name: 'Settings' });
    await dialog3.getByRole('button', { name: 'Appearance' }).click();
    const compactRow3 = dialog3.locator('div').filter({ hasText: /^Compact mode$/ }).first();
    await expect(compactRow3).toBeVisible({ timeout: 5_000 });
    const compactSwitch3 = compactRow3.locator('xpath=ancestor::div[contains(@class,"flex items-center justify-between")]').getByRole('switch');
    const state3 = await compactSwitch3.getAttribute('data-state');
    if (state3 === 'checked') {
      await compactSwitch3.click();
    }
    await page.keyboard.press('Escape');
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
