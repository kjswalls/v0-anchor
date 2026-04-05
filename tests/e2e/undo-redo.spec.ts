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
      const completeBtn = timeline
        .locator('p')
        .filter({ hasText: taskTitle })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"group/card")][1]/button[1]');
      await completeBtn.click();

      // Verify the task became completed (button gets bg-primary class).
      await expect(completeBtn).toHaveClass(/bg-primary/, { timeout: 5_000 });

      // Undo with Ctrl+Z — the action-feed listens for this keydown.
      await page.keyboard.press('Control+Z');

      // The button should revert to non-completed state.
      await expect(completeBtn).not.toHaveClass(/bg-primary/, { timeout: 5_000 });
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
      const completeBtn = timeline
        .locator('p')
        .filter({ hasText: taskTitle })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"group/card")][1]/button[1]');

      // Complete → undo → redo
      await completeBtn.click();
      await expect(completeBtn).toHaveClass(/bg-primary/, { timeout: 5_000 });

      await page.keyboard.press('Control+Z');
      await expect(completeBtn).not.toHaveClass(/bg-primary/, { timeout: 5_000 });

      await page.keyboard.press('Control+Shift+Z');
      await expect(completeBtn).toHaveClass(/bg-primary/, { timeout: 5_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
