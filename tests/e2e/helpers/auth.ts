import type { Page } from '@playwright/test';

/**
 * Log in the test user using credentials from process.env.
 * Requires TEST_USER_EMAIL and TEST_USER_PASSWORD to be set (via .env.test).
 */
export async function loginTestUser(page: Page): Promise<void> {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.test'
    );
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  // Wait for redirect to the main planner page
  await page.waitForURL('/');
}
