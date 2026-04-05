import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';

test.describe('Undo / redo actions', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('undo/redo buttons in the UI are disabled when stacks are empty', async ({ page }) => {
    // On fresh load with no actions taken, both buttons must be disabled.
    // The buttons use title="Undo" / title="Redo" (from action-feed.tsx / mobile-header.tsx).
    const undoBtn = page.getByTitle('Undo').first();
    const redoBtn = page.getByTitle('Redo').first();

    await expect(undoBtn).toBeVisible();
    await expect(redoBtn).toBeVisible();
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();
  });

  test('Cmd/Ctrl+Z undoes the last task completion', async ({ page }) => {
    // Seed a task via API so it appears in today's timeline.
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `Undo test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      // Reload so the store picks up the new task.
      await page.reload();
      await page.waitForURL('/');

      // Find the completion button via XPath, scoped to the timeline.
      // Navigate: task-title <p> → ancestor div.group/card → first button child.
      const timeline = page.locator('[data-tour="timeline"]');
      await expect(timeline.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // The complete button is a round button (w-5 h-5 rounded-full border-2) scoped
      // to the task card. We locate the card by the task title text, then find the
      // circular complete button within it.
      const taskCard = timeline.locator('[class*="rounded-xl"]').filter({ hasText: taskTitle }).first();
      const getCompleteBtn = () => taskCard.locator('button[class*="rounded-full"][class*="border-2"]').first();

      await getCompleteBtn().click();

      // Verify the task became completed (button gets bg-primary class).
      await expect(getCompleteBtn()).toHaveClass(/bg-primary/, { timeout: 5_000 });

      // Undo with Ctrl+Z — the action-feed listens for this keydown.
      await page.keyboard.press('Control+Z');

      // After undo the task re-appears as pending — button should lose bg-primary.
      await expect(getCompleteBtn()).not.toHaveClass(/bg-primary/, { timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('Cmd/Ctrl+Shift+Z redoes the undone action', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = `Redo test ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      const timeline = page.locator('[data-tour="timeline"]');
      await expect(timeline.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Locate the circular complete button (w-5 h-5 rounded-full border-2) within the task card.
      const taskCard = timeline.locator('[class*="rounded-xl"]').filter({ hasText: taskTitle }).first();
      const getCompleteBtn = () => taskCard.locator('button[class*="rounded-full"][class*="border-2"]').first();

      // Complete → undo → redo
      await getCompleteBtn().click();
      await expect(getCompleteBtn()).toHaveClass(/bg-primary/, { timeout: 5_000 });

      await page.keyboard.press('Control+Z');
      await expect(getCompleteBtn()).not.toHaveClass(/bg-primary/, { timeout: 5_000 });

      await page.keyboard.press('Control+Shift+Z');
      await expect(getCompleteBtn()).toHaveClass(/bg-primary/, { timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
