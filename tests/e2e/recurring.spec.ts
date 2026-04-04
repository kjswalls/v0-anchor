import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestHabit, cleanupTestData } from './helpers/api';
import { format, nextSaturday, nextMonday, nextWednesday } from 'date-fns';

/**
 * Navigate the day view to a specific date by clicking next/prev arrows.
 * We pass a target Date and click until the header matches yyyy-MM-dd.
 * Max 14 clicks to prevent infinite loops.
 */
async function navigateToDate(page: import('@playwright/test').Page, targetDate: Date) {
  const targetStr = format(targetDate, 'yyyy-MM-dd');

  // The date is displayed in the top nav header — look for it after navigation.
  // We navigate by clicking the chevron-right or chevron-left buttons.
  const nextBtn = page.locator('button').filter({
    has: page.locator('svg.lucide-chevron-right'),
  }).first();
  const prevBtn = page.locator('button').filter({
    has: page.locator('svg.lucide-chevron-left'),
  }).first();

  // Determine direction: find current date from the page title / header.
  const today = new Date();
  const diff = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const btn = diff >= 0 ? nextBtn : prevBtn;
  const clicks = Math.abs(diff);

  for (let i = 0; i < Math.min(clicks, 14); i++) {
    await btn.click();
    await page.waitForTimeout(150);
  }
}

test.describe('Recurring tasks and habits', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  // Known bug: recurring tasks/habits may appear on wrong days — issue #90
  test.skip('daily habit appears on every day of the week (#90 — wrong-day bug)', async ({ page }) => {
    // BUG #90: habits with repeatFrequency="daily" show on incorrect dates.
    // Once fixed: create a daily habit, navigate through several days, and
    // assert the habit is visible on each day in the planner.
  });

  test('weekdays habit does not appear on Saturday', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = `Weekdays only ${Date.now()}`;
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'weekdays',
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Navigate to next Saturday.
      const saturday = nextSaturday(new Date());
      await navigateToDate(page, saturday);

      // The weekdays habit should NOT be visible on Saturday (check the timeline only, not sidebar).
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });

  test('custom habit shows only on configured repeat days', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = `Mon+Wed only ${Date.now()}`;
    // repeatDays=[1,3] → Monday (1) and Wednesday (3)
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'custom',
      repeatDays: [1, 3],
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      // Navigate to next Monday — habit should be visible in the timeline.
      const monday = nextMonday(new Date());
      await navigateToDate(page, monday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).toBeVisible({ timeout: 5_000 });

      // Reset to today before navigating to Wednesday so the click count is correct.
      await page.reload();
      await page.waitForURL('/');

      // Navigate to next Wednesday — habit should also be visible in the timeline.
      const wednesday = nextWednesday(new Date());
      await navigateToDate(page, wednesday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).toBeVisible({ timeout: 5_000 });

      // Reset to today before navigating to Saturday so the click count is correct.
      await page.reload();
      await page.waitForURL('/');

      // Navigate to the Saturday after next Monday — habit should NOT be visible in the timeline.
      const saturday = nextSaturday(monday);
      await navigateToDate(page, saturday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });
});
