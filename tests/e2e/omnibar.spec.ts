import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import {
  createTestTask,
  createTestHabit,
  cleanupTestData,
  cleanupByTitlePrefix,
  testTitle,
  apiKey,
} from './helpers/api';
import { reloadApp, omnibar, omnibarPanel } from './helpers/app';
import { getTodayStr } from './helpers/dates';

/**
 * Omnibar — the app's ONLY command surface (there is no ⌘K modal), and the only
 * route to ~15 commands including "Add habit", the EOD review, and group-by.
 *
 * Every locator here is a testid or a `data-command-id` / `data-item-id`, never
 * row copy. Command labels collide with their own group headings — `Settings` is
 * simultaneously a command and a group — so a text match resolves by scoring
 * accident and turns into a strict-mode violation the moment keywords change.
 */
test.describe('Omnibar', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('typing shows a matching item and opens its edit dialog', async ({ page }) => {
    const title = testTitle('search');
    const taskId = await createTestTask(page, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await reloadApp(page);
      await omnibar(page).fill(title);

      const result = omnibarPanel(page).locator(
        `[data-testid="omnibar-result"][data-item-id="${taskId}"]`
      );
      await expect(result).toBeVisible({ timeout: 5_000 });
      await expect(result).toHaveAttribute('data-item-type', 'task');

      // Click the row rather than relying on cmdk's implicit selection: which row
      // is selected depends on scoring, so Enter is a test of cmdk, not of ours.
      await result.click();

      const dialog = page.getByTestId('item-dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog).toHaveAttribute('data-mode', 'edit');
      await expect(dialog.getByTestId('item-dialog-title-input')).toHaveValue(title);
    } finally {
      await cleanupTestData(page, [taskId]);
    }
  });

  test('"task:" restricts results to tasks and hides habits (#93)', async ({ page }) => {
    // Both share the marker, so the filter is what separates them — not the query.
    const marker = testTitle('kw');
    const taskId = await createTestTask(page, { title: `${marker} task`, isScheduled: false });
    const habitId = await createTestHabit(page, { title: `${marker} habit`, timeBucket: 'morning' });

    try {
      await reloadApp(page);

      // Unfiltered: both types come back.
      await omnibar(page).fill(marker);
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${taskId}"]`)
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${habitId}"]`)
      ).toBeVisible({ timeout: 5_000 });

      // task: keeps the task and drops the habit.
      await omnibar(page).fill(`task:${marker}`);
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${taskId}"]`)
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${habitId}"]`)
      ).toHaveCount(0);

      // …and habit: is the mirror image.
      await omnibar(page).fill(`habit:${marker}`);
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${habitId}"]`)
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        omnibarPanel(page).locator(`[data-testid="omnibar-result"][data-item-id="${taskId}"]`)
      ).toHaveCount(0);
    } finally {
      await cleanupTestData(page, [taskId], [habitId]);
    }
  });

  test('the add-task row creates an unscheduled task in the braindump', async ({ page }) => {
    const title = testTitle('omniadd');

    try {
      await omnibar(page).fill(title);
      await omnibarPanel(page).getByTestId('omnibar-add-row').click();

      // Verify through the API, not only the DOM: this is a create and the
      // store's write is fire-and-forget, so "it rendered" and "it persisted"
      // are two separate claims and only the second one matters after a reload.
      let created: { id: string; isScheduled?: boolean } | null = null;
      await expect
        .poll(
          async () => {
            const res = await page.request.get('http://localhost:3000/api/agent/context', {
              headers: { Authorization: `Bearer ${apiKey()}` },
            });
            const body = await res.json();
            created = (body.tasks ?? []).find((t: { title: string }) => t.title === title) ?? null;
            return created?.id ?? null;
          },
          { message: `no task titled ${title} was persisted`, timeout: 10_000 }
        )
        .not.toBeNull();

      expect(created!.isScheduled).toBe(false);

      // And it is in the braindump, by id, after a reload.
      await reloadApp(page);
      await expect(
        page.getByTestId('braindump').locator(`[data-item-id="${created!.id}"]`)
      ).toHaveCount(1, { timeout: 10_000 });
    } finally {
      // Created through the UI, so there is no id to clean up by until after the
      // fact — sweep by prefix instead. Without this the row leaks into the
      // shared braindump on every run, forever.
      await cleanupByTitlePrefix(page, title);
    }
  });

  test('"/" filters to commands and running one opens its surface', async ({ page }) => {
    await omnibar(page).fill('/settings');

    const settings = omnibarPanel(page).locator('[data-command-id="app.settings"]');
    await expect(settings).toBeVisible({ timeout: 5_000 });
    // Non-matching commands are filtered out.
    await expect(omnibarPanel(page).locator('[data-command-id="app.feedback"]')).toHaveCount(0);

    await settings.click();
    // Settings is a route now, not a dialog — so this asserts the URL and the
    // page root rather than role="dialog". The test is still about "running a
    // command opens its surface"; only the surface changed.
    await expect(page).toHaveURL(/\/settings(\/|$)/, { timeout: 5_000 });
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10_000 });
  });

  test('the palette exposes an add-habit command (the only habit entry point)', async ({ page }) => {
    // Worth its own test: every AddIconButton in the chrome hardcodes 'task', so
    // this row is the only way to reach the dialog on its habit type.
    await omnibar(page).fill('/habit');
    const row = omnibarPanel(page).locator('[data-command-id="create.habit"]');
    await expect(row).toBeVisible({ timeout: 5_000 });

    await row.click();
    const dialog = page.getByTestId('item-dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveAttribute('data-mode', 'add');
    await expect(dialog).toHaveAttribute('data-item-type', 'habit');
  });

  test('Escape clears the query and closes the panel', async ({ page }) => {
    const input = omnibar(page);
    await input.fill('anything');
    await expect(omnibarPanel(page)).toBeVisible();

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(omnibarPanel(page)).toHaveCount(0);
  });
});

test.describe('Braindump', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('unscheduled tasks appear in the braindump list', async ({ page }) => {
    const title = testTitle('braindump');
    const taskId = await createTestTask(page, { title, isScheduled: false });

    try {
      await reloadApp(page);
      await expect(
        page.getByTestId('braindump').locator(`[data-item-id="${taskId}"]`)
      ).toHaveCount(1, { timeout: 10_000 });
    } finally {
      await cleanupTestData(page, [taskId]);
    }
  });
});
