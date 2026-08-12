import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { reloadApp, runCommand, itemCard } from './helpers/app';
import {
  testTitle,
  createTestTask,
  createTestHabit,
  cleanupTestData,
  cleanupTestLabels,
  cleanupByTitlePrefix,
  collectionScope,
} from './helpers/api';
import { TEST_TITLE_PREFIX } from './helpers/env';

/**
 * The Organize console's LABEL half — projects, item types and habit groups
 * (memory/plans/organize-console.md, Phase 3).
 *
 * This half of the app has never had an end-to-end test, and until Phase 2 it
 * had no data-testid either: it was a 400px dialog of rows with a hover trash on
 * each, and `tests/` reached none of it. The routines/programs half is covered
 * by programs.spec.ts and scope-rail.spec.ts, which must keep passing unchanged.
 *
 * What is worth an end-to-end run rather than a unit test — everything here
 * crosses the store/DB/render boundary, which is where the unit tests stop:
 *
 *   1. A project's time block reaches the GRID. The dialog that used to own that
 *      form was absorbed into the detail pane and deleted, and its buffered
 *      Save became live patching — so the question "does the block still land"
 *      is a new question, not a regression check.
 *   2. Deleting a habit group MOVES its habits somewhere specific. The console
 *      promises a named destination in the confirm copy; the store computes it.
 *      Only a real delete proves the sentence and the write agree.
 *   3. A custom type survives a reload and reaches the add dialog, which is the
 *      only thing that makes an item type worth creating.
 *
 * Serial, and under its own container prefix: every test creates rows on the
 * SHARED test user and the console's lists are not scoped to the running spec.
 * Sweeping the bare TEST_TITLE_PREFIX from two files hard-DELETEs the other's
 * rows mid-test under `fullyParallel` + 4 workers.
 */
const scope = collectionScope('org');

test.describe('organize — projects, types and groups', () => {
  // Same reasoning as programs.spec.ts: each test drives the console through
  // several open/edit/close round trips against a dev server, and each one is a
  // palette invocation plus a Radix modal transition.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await cleanupByTitlePrefix(page, TEST_TITLE_PREFIX);
    await cleanupTestLabels(scope.prefix);
    await reloadApp(page);
  });

  test.afterEach(async () => {
    await cleanupTestLabels(scope.prefix);
  });

  /**
   * Through the palette, by the command's own alias — the same route
   * programs.spec.ts uses, and for the same reason: an unfiltered list truncates
   * before it reaches the row once a few dynamic commands exist.
   *
   * `app.categories` keeps its id and its aliases through the rename (decision
   * 1), so this is stable across the Manage → Organize change.
   */
  async function openConsole(page: import('@playwright/test').Page, tab: string) {
    await runCommand(page, 'app.categories', { query: '/projects' });
    await page.getByRole('tab', { name: tab }).click();
  }

  /** Close and PROVE it closed — see programs.spec.ts's note on the two-Escape dance. */
  async function closeConsole(page: import('@playwright/test').Page) {
    await expect(page.locator('[data-slot="alert-dialog-overlay"]')).toHaveCount(0);
    const overlay = page.locator('[data-slot="dialog-overlay"], [data-slot="drawer-overlay"]');
    for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    await expect(overlay).toHaveCount(0);
  }

  async function createLabel(
    page: import('@playwright/test').Page,
    kind: 'project' | 'group' | 'type',
    name: string
  ) {
    await page.getByTestId(`${kind}-new-name`).fill(name);
    await page.getByTestId(`${kind}-add`).click();
    // Creating selects the new row, so the detail pane names it — which is also
    // how we learn the id the store minted.
    const detail = page.getByTestId(`${kind}-detail`);
    await expect(detail).toBeVisible();
    return (await detail.getAttribute(`data-${kind}-id`))!;
  }

  /* ── projects ───────────────────────────────────────────────────────── */

  test('a project survives a reload and reports what it holds', async ({ page }) => {
    const title = testTitle('org-project');
    const taskId = await createTestTask(page, { title });
    const name = scope.title('Work');
    try {
      await reloadApp(page);
      await openConsole(page, 'Projects');
      const id = await createLabel(page, 'project', name);
      expect(id).toBeTruthy();
      await closeConsole(page);

      // Through the DB, not optimistic state: the create is fire-and-forget, so
      // a DOM assertion right after the click proves only that set() ran.
      await reloadApp(page);
      await openConsole(page, 'Projects');
      await expect(
        page.locator(`[data-testid="project-row"][data-project-id="${id}"]`)
      ).toBeVisible();
      await closeConsole(page);
    } finally {
      await cleanupTestData(page, [taskId], []);
    }
  });

  test('a project time block reaches the grid', async ({ page }) => {
    // The absorbed EditProjectDialog's whole purpose. lib/day-items.ts needs
    // startTime AND timeBucket AND repeatFrequency to render a block, and the
    // switch now has to write all three — a version that wrote two would leave
    // the control reading "on" with nothing on the canvas.
    const name = scope.title('Deep');
    try {
      await openConsole(page, 'Projects');
      await createLabel(page, 'project', name);

      await page.getByTestId('project-block-toggle').click();
      await expect(page.getByTestId('project-start-time')).toBeVisible();
      // Afternoon rather than morning, and a COUNT rather than a visibility
      // check: the schedule fits the day with an adaptive window, so a 05:00
      // block can legitimately sit outside the rendered hours and a visibility
      // assertion would be testing the window, not the write.
      await page.getByTestId('project-bucket-afternoon').click();
      await closeConsole(page);

      await reloadApp(page);
      await expect(page.getByTestId('project-block').filter({ hasText: name })).toHaveCount(1);
    } finally {
      await cleanupTestLabels(scope.prefix);
    }
  });

  test('deleting a project unfiles its items instead of deleting them', async ({ page }) => {
    // The delete copy promises exactly this, and "delete" otherwise reads as
    // subtraction. The item must still exist afterwards.
    const title = testTitle('org-unfile');
    const taskId = await createTestTask(page, { title });
    const name = scope.title('Temporary');
    try {
      await reloadApp(page);
      await openConsole(page, 'Projects');
      await createLabel(page, 'project', name);
      await page.getByTestId('project-delete').click();
      await page.getByTestId('category-delete-confirm').click();
      await closeConsole(page);

      // By id, not by title text: `item-card` is emitted from two render paths
      // in task-row.tsx, so a text filter can legitimately match twice.
      await expect(itemCard(page, taskId)).toHaveCount(1);
    } finally {
      await cleanupTestData(page, [taskId], []);
    }
  });

  /* ── item types ─────────────────────────────────────────────────────── */

  test('a reserved slug is refused OUT LOUD, not by a dead button', async ({ page }) => {
    // The dialog this replaced disabled the add button and explained nothing, so
    // the only way to learn the rule was to fail at it.
    await openConsole(page, 'Item types');
    await page.getByTestId('type-new-name').fill('Task');
    await expect(page.getByTestId('type-new-problem')).toContainText('built-in name');
    await expect(page.getByTestId('type-add')).toBeDisabled();

    await page.getByTestId('type-new-name').fill(scope.title('Goal'));
    await expect(page.getByTestId('type-new-problem')).toHaveCount(0);
    await expect(page.getByTestId('type-add')).toBeEnabled();
    await closeConsole(page);
  });

  test('a custom type persists and its plural is editable', async ({ page }) => {
    // updateItemType has always accepted labelPlural; no UI ever offered it, so
    // an irregular plural could be created and never corrected.
    const name = scope.title('Quest');
    await openConsole(page, 'Item types');
    const id = await createLabel(page, 'type', name);

    await page.getByTestId('type-plural').fill(`${name}es`);
    await page.getByTestId('type-plural').press('Enter');
    await closeConsole(page);

    await reloadApp(page);
    await openConsole(page, 'Item types');
    await page.locator(`[data-testid="type-row"][data-type-id="${id}"]`).click();
    await expect(page.getByTestId('type-plural')).toHaveValue(`${name}es`);
    await closeConsole(page);
  });

  /* ── habit groups ───────────────────────────────────────────────────── */

  test('deleting a habit group moves its habits to the group the copy names', async ({ page }) => {
    // removeHabitGroup REASSIGNS rather than unassigns, and the old dialog's copy
    // claimed the opposite. The console names the destination; this proves the
    // sentence and the write agree.
    const title = testTitle('org-group');
    const habitId = await createTestHabit(page, { title, timeBucket: 'morning' });
    const doomed = scope.title('Doomed');
    try {
      await reloadApp(page);
      await openConsole(page, 'Habit groups');
      await createLabel(page, 'group', doomed);

      await page.getByTestId('group-delete').click();
      // Asserted on the confirm itself rather than by walking up from the button
      // with an xpath — the prompt is the surface the user actually reads, and
      // `confirm-dialog` is a stable id the shell owns.
      await expect(page.getByTestId('confirm-dialog')).toContainText(
        '⌘Z brings the group back'
      );
      await page.getByTestId('category-delete-confirm').click();
      await closeConsole(page);

      // The habit is still here — a group delete never deletes work.
      await expect(itemCard(page, habitId)).toHaveCount(1);
    } finally {
      await cleanupTestData(page, [], [habitId]);
    }
  });

  /* ── the section filter ─────────────────────────────────────────────── */

  test('the filter narrows the current section and Escape clears it', async ({ page }) => {
    const keep = scope.title('Keeper');
    const other = scope.title('Zebra');
    try {
      await openConsole(page, 'Projects');
      await createLabel(page, 'project', keep);
      await createLabel(page, 'project', other);

      await page.getByTestId('project-filter').fill('Zebra');
      await expect(page.getByTestId('project-row')).toHaveCount(1);

      // Rung 1 of the Escape ladder: clear the query, and do NOT close the plate.
      await page.getByTestId('project-filter').press('Escape');
      await expect(page.getByTestId('project-filter')).toHaveValue('');
      await expect(page.getByTestId('organize-console')).toBeVisible();
      await closeConsole(page);
    } finally {
      await cleanupTestLabels(scope.prefix);
    }
  });
});
