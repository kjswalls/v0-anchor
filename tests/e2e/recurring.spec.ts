import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, createTestHabit, cleanupTestData } from './helpers/api';
import { format, nextSaturday, nextMonday, nextWednesday, addDays } from 'date-fns';
import { getTodayInTz, getTodayStr } from './helpers/dates';


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

  // Determine direction: use timezone-aware today so diff matches the browser's view.
  const today = getTodayInTz();
  const diff = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const btn = diff >= 0 ? nextBtn : prevBtn;
  const clicks = Math.abs(diff);

  for (let i = 0; i < Math.min(clicks, 14); i++) {
    await btn.click();
    await page.waitForTimeout(150);
  }

  // Assert the date header in the top nav reflects the target date.
  // The header button shows the date as "EEEE, MMMM d" (e.g. "Saturday, April 5").
  const expectedLabel = format(targetDate, 'EEEE, MMMM d');
  await expect(page.locator('header').getByText(expectedLabel)).toBeVisible({ timeout: 3_000 });
}

test.describe('Recurring tasks and habits', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('recurring task appears on its start date', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Daily task start ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.waitForTimeout(500);

      // Should be visible on today (the start date)
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('recurring task appears on a future matching day (after start date)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Daily future ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');

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
    const taskTitle = `Future only ${Date.now()}`;
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
      await page.reload();
      await page.waitForURL('/');
      await page.waitForTimeout(500);

      // Today: task should NOT be visible (startDate is tomorrow)
      await expect(page.locator('[data-tour="timeline"]').getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('completing a recurring task on one day does not affect other days', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Isolated completion ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.waitForTimeout(500);

      // Complete on today
      const taskCard = page.locator('[data-testid="task-card"]').filter({ hasText: taskTitle });
      await expect(taskCard).toBeVisible({ timeout: 5_000 });
      await taskCard.locator('[data-testid="task-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow — task should appear un-completed (no strikethrough)
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      const tomorrowTaskCard = page.locator('[data-tour="timeline"]').getByText(taskTitle).first();
      await expect(tomorrowTaskCard).toBeVisible({ timeout: 5_000 });
      // Confirm not completed: title should not have line-through styling
      await expect(tomorrowTaskCard).not.toHaveClass(/line-through/);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('one-off task is unaffected by recurring task changes', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const todayStr = getTodayStr();
    const taskTitle = `One-off task ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
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
    const habitTitle = `Weekdays only ${Date.now()}`;
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'weekdays',
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

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
      const monday = nextMonday(getTodayInTz());
      await navigateToDate(page, monday);
      await page.waitForTimeout(500);
      await expect(page.locator('[data-tour="timeline"]').getByText(habitTitle)).toBeVisible({ timeout: 5_000 });

      // Reset to today before navigating to Wednesday so the click count is correct.
      await page.reload();
      await page.waitForURL('/');

      // Navigate to next Wednesday — habit should also be visible in the timeline.
      const wednesday = nextWednesday(getTodayInTz());
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

  test('habit completion persists when navigating away and back', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = `Persist habit ${Date.now()}`;
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'daily',
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.waitForTimeout(500);

      // Find habit card in timeline and click its complete button
      const habitCard = page.locator('[data-tour="timeline"]').locator('[data-testid="habit-card"]').filter({ hasText: habitTitle });
      await expect(habitCard).toBeVisible({ timeout: 5_000 });
      await habitCard.locator('[data-testid="habit-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);

      // Navigate back to today
      await navigateToDate(page, getTodayInTz());
      await page.waitForTimeout(500);

      // Habit title should still show as completed (line-through)
      const habitTitleEl = page.locator('[data-tour="timeline"]').locator('[data-testid="habit-card"]').filter({ hasText: habitTitle }).getByText(habitTitle).first();
      await expect(habitTitleEl).toHaveClass(/line-through/);
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });
});

test.describe('Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('mobile: recurring task appears on future day', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Mobile daily future ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.click('[data-tour="tab-schedule"]');
      await page.waitForTimeout(300);

      // Navigate to tomorrow — daily task should be visible
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('mobile: completing recurring task marks it done, stays incomplete on other days', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Mobile complete recurring ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      repeatFrequency: 'daily',
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.click('[data-tour="tab-schedule"]');
      await page.waitForTimeout(300);

      // Find task card on today and mark complete
      const taskCard = page.locator('[data-testid="mobile-task-card"]').filter({ hasText: taskTitle });
      await expect(taskCard).toBeVisible({ timeout: 5_000 });
      await taskCard.locator('[data-testid="mobile-task-complete-button"]').click();
      await page.waitForTimeout(300);

      // Navigate to tomorrow — task should appear un-completed
      const tomorrow = addDays(getTodayInTz(), 1);
      await navigateToDate(page, tomorrow);
      await page.waitForTimeout(500);
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
      // Confirm task title is not struck through on tomorrow
      const tomorrowTaskTitle = page.locator('[data-testid="mobile-task-card"]').filter({ hasText: taskTitle }).getByText(taskTitle).first();
      await expect(tomorrowTaskTitle).not.toHaveClass(/line-through/);

      // Navigate back to today — task should show as completed
      await navigateToDate(page, getTodayInTz());
      await page.waitForTimeout(500);
      const todayTaskTitle = page.locator('[data-testid="mobile-task-card"]').filter({ hasText: taskTitle }).getByText(taskTitle).first();
      await expect(todayTaskTitle).toHaveClass(/line-through/);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('mobile: weekday-only habit does not appear on weekend', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const habitTitle = `Mobile weekdays only ${Date.now()}`;
    const habitId = await createTestHabit(page, accessToken, {
      title: habitTitle,
      repeatFrequency: 'weekdays',
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.click('[data-tour="tab-schedule"]');
      await page.waitForTimeout(300);

      // Navigate to next Saturday — weekday habit should NOT be visible
      const saturday = nextSaturday(getTodayInTz());
      await navigateToDate(page, saturday);
      await page.waitForTimeout(500);
      await expect(page.getByText(habitTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [], [habitId]);
    }
  });

  test('mobile: task with today start date appears on correct day not yesterday (UTC off-by-one regression)', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const taskTitle = `Mobile today only ${Date.now()}`;
    const todayStr = getTodayStr();
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: todayStr,
      timeBucket: 'morning',
      isScheduled: true,
    });

    try {
      await page.reload();
      await page.waitForURL('/');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.click('[data-tour="tab-schedule"]');
      await page.waitForTimeout(300);

      // Stay on today — task should be visible
      await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 5_000 });

      // Navigate to yesterday — task should NOT appear
      const yesterday = addDays(getTodayInTz(), -1);
      await navigateToDate(page, yesterday);
      await page.waitForTimeout(500);
      await expect(page.getByText(taskTitle)).not.toBeVisible();
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
