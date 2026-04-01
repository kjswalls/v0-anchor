import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('End of day (EOD) review modal', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('EOD modal can be opened from the nav bar', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Click the EOD review trigger button in the top nav and assert the modal
    // opens (aria-modal visible, heading matches expected text).
  });

  test('completing all tasks in EOD shows a congratulations state', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Mark all pending tasks as done inside the EOD modal and assert the
    // completion/confetti state is rendered.
  });

  test('rolling over a task from EOD moves it to tomorrow', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Click "roll over" on an incomplete task, close the modal, navigate to
    // tomorrow's view, and assert the task appears there.
  });
});
