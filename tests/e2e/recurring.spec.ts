import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, createTestHabit, fetchTestTask, cleanupTestData, testTitle } from './helpers/api';
import { format, nextSaturday, nextMonday, nextWednesday, addDays } from 'date-fns';
import { getTodayInTz, getTodayStr } from './helpers/dates';
import {
  reloadApp,
  navigateToDate as navigateToDateStr,
  currentDateStr,
  itemCard,
  expectCompleted,
  switchMobileTab,
} from './helpers/app';


/**
 * Date navigation, adapted to this spec's Date-based call sites.
 *
 * The two hand-rolled helpers this replaces were the single biggest source of
 * failure in the file. They looked for the date inside a <header> element —
 * desktop has none, the date is a bare button in HeaderCapsule — so all ten
 * tests timed out at their first navigation. Their fallback regex was also
 * UNANCHORED, so a target of "Friday, August 1" matched a header reading
 * "Fri, Aug 15": a 14-day overshoot read as success. And they slept 150ms per
 * click instead of waiting for anything.
 *
 * helpers/app.ts navigates against data-date and asserts exact equality.
 */
const asDateStr = (d: Date) => d.toISOString().slice(0, 10);

async function navigateToDate(page: import('@playwright/test').Page, targetDate: Date) {
  await navigateToDateStr(page, asDateStr(targetDate));
}

/** Shift the displayed date by N days from wherever the view currently is. */
async function navigateByDaysFromCurrent(page: import('@playwright/test').Page, days: number) {
  const [y, m, d] = (await currentDateStr(page)).split('-').map(Number);
  await navigateToDateStr(page, asDateStr(new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))));
}

test.describe('Recurring tasks and habits', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('recurring task appears on its start date', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('daily-start');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await page.waitForTimeout(500);

      // Should be visible on today (the start date)
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('recurring task appears on a future matching day (after start date)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('daily-future');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);

      // Navigate to tomorrow — daily task should still be visible
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('recurring task does NOT appear before its start date', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('future-only');
    const tomorrow = addDays(getTodayInTz(), 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: tomorrowStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await page.waitForTimeout(500);

      // Today: task should NOT be visible (startDate is tomorrow)
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('completing a recurring task on one day does not affect other days', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('isolated-completion');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await page.waitForTimeout(500);

      // Complete on today
      const taskCard = page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle });
      await expect(taskCard).toBeVisible({ timeout: 5_000 });
      await taskCard.locator('[data-testid="item-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow — task should appear un-completed (no strikethrough)
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(itemCard(page, taskId)).toBeVisible({ timeout: 5_000 });
      // data-completed, not a line-through class: completion had been asserted
      // through Tailwind, which a restyle silently breaks.
      await expectCompleted(page, taskId, false);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('one-off task is unaffected by recurring task changes', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const todayStr = getTodayStr();
    const taskTitle = testTitle('one-off');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await page.waitForTimeout(500);

      // One-off task should be visible today
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Navigate to tomorrow — one-off task should NOT appear (it's date-specific)
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  // Known bug: recurring tasks/habits may appear on wrong days — issue #90
  test.skip('daily habit appears on every day of the week (#90 — wrong-day bug)', async ({ page }) => {
    // BUG #90: habits with repeatFrequency="daily" show on incorrect dates.
    // Once fixed: create a daily habit, navigate through several days, and
    // assert the habit is visible on each day in the planner.
  });

  test('weekdays habit does not appear on Saturday', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = testTitle('weekdays-only');
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'weekdays',
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      // Navigate to next Saturday (use timezone-aware today so date-fns picks the right day).
      const saturday = nextSaturday(getTodayInTz());
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
    const habitTitle = testTitle('mon-wed-only');
    // repeatDays=[1,3] → Monday (1) and Wednesday (3)
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'custom',
      repeatDays: [1, 3],
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      // Navigate to next Monday — habit should be visible in the timeline.
      const monday = nextMonday(getTodayInTz());
      await navigateToDate(page, monday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).toBeVisible({ timeout: 5_000 });

      // Reset to today before navigating to Wednesday so the click count is correct.
      await reloadApp(page);

      // Navigate to next Wednesday — habit should also be visible in the timeline.
      const wednesday = nextWednesday(getTodayInTz());
      await navigateToDate(page, wednesday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).toBeVisible({ timeout: 5_000 });

      // Reset to today before navigating to Saturday so the click count is correct.
      await reloadApp(page);

      // Navigate to the Saturday after next Monday — habit should NOT be visible in the timeline.
      const saturday = nextSaturday(monday);
      await navigateToDate(page, saturday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });

  test('habit completion persists when navigating away and back', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = testTitle('persist-habit');
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'daily',
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);
      await page.waitForTimeout(500);

      // Find habit card in timeline and click its complete button
      const habitCard = page.locator('[data-tour="timeline"]').locator('[data-testid="item-card"][data-item-kind="habit"]').filter({ hasText: habitTitle });
      await expect(habitCard).toBeVisible({ timeout: 5_000 });
      await habitCard.locator('[data-testid="item-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);

      // Navigate back to today
      await navigateByDaysFromCurrent(page, -1);

      // Still completed after navigating away and back.
      await expectCompleted(page, habitId, true);
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });

  test('a recurring task can be skipped for one day and unskipped (#194)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: testTitle('daily-skip'),
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);

      const row = itemCard(page, taskId);
      await expect(row).toHaveAttribute('data-row-variant', 'default');

      // The skip control reveals on hover, exactly as it does for a habit.
      await row.hover();
      await row.getByTestId('item-skip-button').click();

      const skipped = itemCard(page, taskId);
      await expect(skipped).toHaveAttribute('data-row-variant', 'skipped');
      await expect(skipped.getByTestId('item-complete-button')).toHaveCount(0);

      // Per-DATE: tomorrow's occurrence of the same task is untouched.
      await navigateToDate(page, addDays(getTodayInTz(), 1));
      await expect(itemCard(page, taskId)).toHaveAttribute('data-row-variant', 'default');
      await navigateToDate(page, getTodayInTz());

      await reloadApp(page);
      await expect(itemCard(page, taskId)).toHaveAttribute('data-row-variant', 'skipped');

      // The skip lives in skippedDates and NOWHERE else — 'skipped' is not in
      // the task status vocabulary the OpenClaw plugin validates.
      const persisted = await fetchTestTask(page, taskId);
      expect(persisted?.skippedDates).toContain(todayStr);
      expect(persisted?.status).toBe('pending');

      await itemCard(page, taskId).getByTestId('item-unskip-button').click();
      await expect(itemCard(page, taskId)).toHaveAttribute('data-row-variant', 'default');
      await expectCompleted(page, taskId, false);

      const after = await fetchTestTask(page, taskId);
      expect((after?.skippedDates as string[]) ?? []).not.toContain(todayStr);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});

test.describe('Mobile @mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function openMobileSchedule(page: import('@playwright/test').Page) {
    // The redesigned mobile "Today" tab renders the dated day view (DayBuckets).
    // Reached through the dock's mode switcher since the tab bar retired.
    await switchMobileTab(page, 'today');
    await page.waitForTimeout(300);
  }

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('mobile: recurring task appears on future day', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('mobile-daily-future');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await openMobileSchedule(page);

      // Navigate to tomorrow — daily task should be visible
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(
        page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle })
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('mobile: completing recurring task marks it done, stays incomplete on other days', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('mobile-complete-recurring');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await openMobileSchedule(page);

      // Find task card on today and mark complete
      const taskCard = page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle });
      await expect(taskCard).toBeVisible({ timeout: 5_000 });
      await taskCard.locator('[data-testid="item-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow — task should appear un-completed
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(
        page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle })
      ).toBeVisible({ timeout: 5_000 });
      await expectCompleted(page, taskId, false);

      // Navigate back to today (schedule tab stays open — no need to re-open it)
      await navigateByDaysFromCurrent(page, -1);
      await expectCompleted(page, taskId, true);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('mobile: weekday-only habit does not appear on weekend', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = testTitle('mobile-weekdays-only');
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'weekdays',
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);
      await openMobileSchedule(page);

      // Navigate to next Saturday — weekday habit should NOT be visible
      const saturday = nextSaturday(getTodayInTz());
      await navigateToDate(page, saturday);
      await page.waitForTimeout(500);
      await expect(
        page.locator('[data-testid="item-card"][data-item-kind="habit"]').filter({ hasText: habitTitle })
      ).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });

  test('mobile: a skipped item renders minimized on the timeline (#195)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const todayStr = getTodayStr();
    // A recurring task, so this covers both issues at once: skipping is
    // reachable on touch (the row's control cluster is hover-only, so the
    // action lives in the ellipsis sheet) and the skipped row minimizes.
    const taskId = await createTestTask(page, accessToken, {
      title: testTitle('mobile-skip'),
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await openMobileSchedule(page);

      const row = itemCard(page, taskId);
      await expect(row).toHaveAttribute('data-row-variant', 'default');

      await row.getByTestId('item-actions-button').click();
      await page.getByTestId('sheet-skip-button').click();

      const skipped = itemCard(page, taskId);
      await expect(skipped).toHaveAttribute('data-row-variant', 'skipped');
      await expect(skipped.getByTestId('item-complete-button')).toHaveCount(0);

      await skipped.getByTestId('item-unskip-button').click();
      await expect(itemCard(page, taskId)).toHaveAttribute('data-row-variant', 'default');
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('mobile: task with today start date appears on correct day not yesterday (UTC off-by-one regression)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('mobile-today-only');
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await reloadApp(page);
      await openMobileSchedule(page);

      // Stay on today — task should be visible
      await expect(
        page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle })
      ).toBeVisible({ timeout: 5_000 });

      // Navigate to yesterday — task should NOT appear
      const yesterday = addDays(getTodayInTz(), -1);
      await navigateToDate(page, yesterday);
      await page.waitForTimeout(500);
      await expect(
        page.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle })
      ).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
