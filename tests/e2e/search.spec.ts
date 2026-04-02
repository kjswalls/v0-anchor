import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';

test.describe('Search functionality', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('typing in search filters the task list to matching items', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Open the search input, type a unique task title, and assert only matching
    // tasks remain visible in the planner.
  });

  // Known bug: mobile search icon is missing — issue #91
  test.skip('search icon is visible on mobile viewport (#91 — missing icon)', async ({ page }) => {
    // BUG #91: The search trigger icon is missing on mobile breakpoints.
    // Once fixed: set viewport to 375×812, assert the search icon is visible.
  });

  // Known bug: "task:" and "habit:" keyword filters not implemented — issue #93
  test.skip('"task:" keyword filters results to tasks only (#93)', async ({ page }) => {
    // BUG #93: keyword prefix search is not implemented.
    // Once fixed: type "task:standup" and assert only task items are shown.
  });

  test('clearing search restores full task list', async ({ page }) => {
    test.skip(true, 'implement once auth helpers are wired up');
    // Search for something, then clear the input, assert all items are visible again.
  });
});
