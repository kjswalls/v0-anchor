import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Settings persistence', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('changing time format to 24h persists after page reload', async ({ page }) => {
    test.skip(true, 'implement once auth + settings helpers are wired up');
    // Open settings, switch time format to "24h", reload the page, and assert
    // the time format is still "24h" (check displayed time labels on timeline).
  });

  // Known bug: desktop sidebar scroll is broken — issue #92
  test.skip('settings sidebar scrolls on desktop viewport (#92 — scroll broken)', async ({ page }) => {
    // BUG #92: The settings/sidebar panel does not scroll properly on desktop.
    // Once fixed: set viewport to 1280×800, open settings panel, scroll to
    // bottom, assert the last setting item is visible.
  });

  test('toggling compact mode affects task card height', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Enable compact mode in settings, go back to planner, measure a task card
    // height, assert it is smaller than in normal mode.
  });
});
