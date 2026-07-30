import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import {
  createTestTask,
  createTestHabit,
  cleanupTestData,
  testTitle,
  resetUserSettings,
  setUserSetting,
} from './helpers/api';
import { getTodayStr } from './helpers/dates';
import {
  reloadApp,
  itemCard,
  completeButton,
  expectCompleted,
  setLayout,
  runCommand,
} from './helpers/app';

test.describe('Settings persistence', () => {
  // Serial: both tests mutate columns on the SHARED test user, so they must not
  // interleave with each other.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
  });

  // Hard-restore the shared settings row after EVERY test, straight to the DB.
  // A test that fails part-way never reaches its own restore step, and these
  // columns leak into every other spec's fresh context — a stray 24h clock or a
  // stray show_completed_tasks:false made unrelated specs fail with no clue why.
  test.afterEach(async ({ page }) => {
    await resetUserSettings(page);
  });

  test('a persisted 24-hour preference renders a 24-hour schedule gutter', async ({ page }) => {
    // What this asserts: the stored preference reaches the view. The old test
    // asserted "00:00 - 12:00" on a bucket header, which no component has rendered
    // since the redesign (formatBucketRange's only surviving caller is a unit
    // test), so it could never pass.
    //
    // SCOPE NOTE: this drives time_format through user_settings, not through the
    // settings dialog. The dialog has sectioned navigation whose selects are not
    // mounted until their section is chosen, and driving it via the palette command
    // did not take effect in a headless run — worth a look, and tracked as an
    // uncovered path rather than papered over with a passing-but-hollow assertion.
    await setLayout(page, 'Schedule');
    // 12h (the globalSetup default): the gutter prints "8 am".
    await expect(page.getByText(/^\d{1,2}\s(am|pm)$/i).first()).toBeVisible({ timeout: 10_000 });

    try {
      await setUserSetting(page, { time_format: '24h' });
      await reloadApp(page);
      await setLayout(page, 'Schedule');
      // formatHourLabel returns `HH:00` under 'HH:mm' (components/views/day-schedule.tsx).
      await expect(page.getByText(/^\d{2}:00$/).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/^\d{1,2}\s(am|pm)$/i)).toHaveCount(0);
    } finally {
      // afterEach hard-restores anyway; this keeps the failure mode local.
      await setUserSetting(page, { time_format: '12h' });
    }
  });

  // Known bug: desktop sidebar scroll is broken — issue #92
  test.skip('settings sidebar scrolls on desktop viewport (#92 — scroll broken)', async () => {
    // BUG #92: The settings/sidebar panel does not scroll properly on desktop.
    // Once fixed: set viewport to 1280x800, open settings, scroll to the bottom,
    // assert the last setting item is visible.
  });

  test('show-completed-tasks hides completed tasks and never habits', async ({ page }) => {
    // Replaces a compact-mode test that could not pass on two counts: it measured
    // [class*="group/card"], a Tailwind group that exists nowhere in the app, and
    // compactMode is one of the deliberately DEAD settings — it persists but no
    // view reads it (lib/commands/registry.ts says so outright), so no layout
    // assertion about it can ever be true.
    //
    // show_completed_tasks is the real equivalent: a persisted setting a view does
    // read, carrying a documented invariant — it gates TASKS only, never habits.
    const taskId = await createTestTask(page, {
      title: testTitle('showdone_task'),
      startDate: getTodayStr(),
      isScheduled: true,
      timeBucket: 'morning',
    });
    const habitId = await createTestHabit(page, {
      title: testTitle('showdone_habit'),
      timeBucket: 'morning',
    });

    // Driven through the palette rather than the settings dialog: the dialog has
    // sectioned navigation, so the switch is not mounted until its section is
    // selected — and settings.showCompleted is a first-class command with a
    // dynamic label, i.e. a real user path with a stable id.
    const toggleShowCompleted = () =>
      runCommand(page, 'settings.showCompleted', { query: '/completed' });

    try {
      await reloadApp(page);

      await completeButton(page, taskId).click();
      await expectCompleted(page, taskId, true);
      await completeButton(page, habitId).click();
      await expectCompleted(page, habitId, true);

      await toggleShowCompleted();

      try {
        // The completed TASK disappears…
        await expect(itemCard(page, taskId)).toHaveCount(0, { timeout: 10_000 });
        // …and the completed HABIT does not. That asymmetry is the invariant.
        await expect(itemCard(page, habitId)).toHaveCount(1);
        await expectCompleted(page, habitId, true);
      } finally {
        // Restore: every other spec relies on completed tasks being visible.
        await toggleShowCompleted();
        await page.waitForTimeout(700);
      }
    } finally {
      await cleanupTestData(page, [taskId], [habitId]);
    }
  });
});
