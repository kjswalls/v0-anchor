import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { getAccessToken, createTestTask, cleanupTestData } from './helpers/api';
import { getTodayStr } from './helpers/dates';
import { dragTo } from './helpers/dnd';

/**
 * ACCEPTANCE GATE for the redesign view rewrites (P5a-d).
 *
 * These tests assert the droppable-ID contract documented in
 * lib/dnd/CONTRACT.md via the stable hooks:
 *   [data-dnd-bucket="{bucket}"]         — bucket section container
 *   [data-dnd-id="unscheduled:{bucket}"] — untimed drop section of a bucket
 *   [data-dnd-id="sidebar"]              — sidebar (Braindump) unschedule target
 *
 * View rewrites may change styling and structure freely but MUST carry these
 * attributes on the equivalent droppables. Do not edit the id grammar here
 * without updating CONTRACT.md and the views together.
 */
test.describe('Drag and drop flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  test('dragging a task to a different time bucket reassigns its bucket', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `DnD bucket task ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      const morning = page.locator('[data-dnd-bucket="morning"]');
      const afternoon = page.locator('[data-dnd-bucket="afternoon"]');
      const row = morning.getByText(title).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      // The measurable drop target is the unscheduled section, which mounts
      // for every bucket while a drag is active (see CONTRACT.md).
      await dragTo(page, row, page.locator('[data-dnd-id="unscheduled:afternoon"]'));

      await expect(afternoon.getByText(title).first()).toBeVisible({ timeout: 10_000 });
      await expect(morning.getByText(title)).toHaveCount(0);

      // Persisted, not just optimistic.
      await page.reload();
      await page.waitForURL('/');
      await expect(
        page.locator('[data-dnd-bucket="afternoon"]').getByText(title).first()
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('dragging a task to the sidebar unschedules it', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `DnD unschedule task ${Date.now()}`;
    const taskId = await createTestTask(page, accessToken, {
      title,
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      const morning = page.locator('[data-dnd-bucket="morning"]');
      const sidebar = page.locator('[data-dnd-id="sidebar"]');
      const row = morning.getByText(title).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      await dragTo(page, row, sidebar);

      // Task leaves the bucket and appears in the sidebar list.
      await expect(morning.getByText(title)).toHaveCount(0, { timeout: 10_000 });
      await expect(sidebar.getByText(title).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });

  test('dragging a sidebar task into a bucket schedules it there', async ({ page }) => {
    const accessToken = await getAccessToken(page);
    const title = `DnD schedule task ${Date.now()}`;
    // Unscheduled task lands in the sidebar list.
    const taskId = await createTestTask(page, accessToken, {
      title,
      isScheduled: false,
    });

    try {
      await page.reload();
      await page.waitForURL('/');

      const sidebar = page.locator('[data-dnd-id="sidebar"]');
      const evening = page.locator('[data-dnd-bucket="evening"]');
      const row = sidebar.getByText(title).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      await dragTo(page, row, evening);

      await expect(evening.getByText(title).first()).toBeVisible({ timeout: 10_000 });

      await page.reload();
      await page.waitForURL('/');
      await expect(
        page.locator('[data-dnd-bucket="evening"]').getByText(title).first()
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupTestData(page, accessToken, [taskId]);
    }
  });
});
