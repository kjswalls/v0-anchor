import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData, testTitle } from './helpers/api';
import { getTodayStr } from './helpers/dates';
import { reloadApp,   expectCompleted } from './helpers/app';

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
    const taskTitle = testTitle('undo');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      // Reload so the store picks up the new task.
      await reloadApp(page);

      // Find the completion button via XPath, scoped to the timeline.
      // Navigate: task-title <p> → ancestor div.group/card → first button child.
      const timeline = page.locator('[data-tour="timeline"]');
      await expect(timeline.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Locate the task card by data-testid, scoped to the card that contains the
      // task title. Then find the circular complete button within it via data-testid.
      const getTaskCard = () => timeline.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle }).first();
      const getCompleteBtn = () => getTaskCard().locator('[data-testid="item-complete-button"]');

      await getCompleteBtn().click();

      await expectCompleted(page, taskId, true);

      // Undo. MOD, not Control: lib/commands/keys.ts refuses to fold ctrl into
      // the primary modifier on Apple platforms ("a literal 'ctrl' matches no
      // binding, which is exactly what leaves the native behaviour alone"), so a
      // hardcoded Control+Z passed on Windows and failed on macOS.
      await page.keyboard.press('ControlOrMeta+z');

      await expectCompleted(page, taskId, false);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('Cmd/Ctrl+Shift+Z redoes the undone action', async ({ page }) => {
    const TODAY = getTodayStr();
    const accessToken = await getAccessToken(page);
    const taskTitle = testTitle('redo');
    const taskId = await createTestTask(page, accessToken, {
      title: taskTitle,
      startDate: TODAY,
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);

      const timeline = page.locator('[data-tour="timeline"]');
      await expect(timeline.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

      // Locate the task card by data-testid, scoped to the card that contains the
      // task title. Then find the circular complete button within it via data-testid.
      const getTaskCard = () => timeline.locator('[data-testid="item-card"][data-item-kind="task"]').filter({ hasText: taskTitle }).first();
      const getCompleteBtn = () => getTaskCard().locator('[data-testid="item-complete-button"]');

      // Complete → undo → redo
      await getCompleteBtn().click();
      await expectCompleted(page, taskId, true);

      await page.keyboard.press('ControlOrMeta+z');
      await expectCompleted(page, taskId, false);

      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expectCompleted(page, taskId, true);
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
