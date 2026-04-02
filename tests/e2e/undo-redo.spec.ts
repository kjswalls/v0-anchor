import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Undo / redo actions', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('Cmd/Ctrl+Z undoes the last task completion', async ({ page }) => {
    test.skip(true, 'implement once auth + task creation helpers are wired up');
    // Complete a task, press Ctrl+Z (or Meta+Z on Mac), assert the task returns
    // to "pending" state.
  });

  test('Cmd/Ctrl+Shift+Z redoes the undone action', async ({ page }) => {
    test.skip(true, 'implement once auth + task creation helpers are wired up');
    // Complete a task, undo it, redo it, assert the task is "completed" again.
  });

  test('undo/redo buttons in the UI are disabled when stacks are empty', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // On fresh load with no actions taken, undo button should be disabled (aria-disabled).
  });
});
