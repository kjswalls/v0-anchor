import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { reloadApp, itemCardIn } from './helpers/app';
import {
  testTitle,
  createTestHabit,
  cleanupTestData,
  cleanupByTitlePrefix,
  cleanupTestCollections,
} from './helpers/api';
import { TEST_TITLE_PREFIX } from './helpers/env';

/**
 * The Scope Rail (memory/plans/programs-routines.md, Phase 5).
 *
 * It exists because the manager had no unconditional entry point — from a
 * standing start the palette was the only door, and the item chips that reveal
 * that door only appear once you have been through it. Three things cross the
 * store/DB/render boundary and so are worth an end-to-end run:
 *
 *   1. It is there from ZERO. That is the entire bug it fixes, and it is the
 *      one assertion a unit test structurally cannot make.
 *   2. Its switch really switches: the members leave the grid and come back,
 *      through the DB rather than through optimistic state.
 *   3. The local/effective split survives rendering. A routine held off by its
 *      program keeps its own switch ON — merge the two and resuming the program
 *      hands back a routine the user believes they turned off.
 *
 * Serial, for the same reason programs.spec is: every test creates containers
 * on a SHARED test user and the rail is not scoped to the running spec.
 */
test.describe('scope rail', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await cleanupByTitlePrefix(page, TEST_TITLE_PREFIX);
    await cleanupTestCollections(TEST_TITLE_PREFIX);
    await reloadApp(page);
  });

  test.afterEach(async () => {
    await cleanupTestCollections(TEST_TITLE_PREFIX);
  });

  const rail = (page: import('@playwright/test').Page) => page.getByTestId('scope-rail');

  /** The grid, scoped — an unscoped item-card locator also matches the Paused section. */
  const timeline = (page: import('@playwright/test').Page) =>
    page.locator('[data-tour="timeline"]');

  /**
   * Scoped by KIND as well as by name, and that is not belt-and-braces: a
   * blocked routine's state line names the program blocking it, so a bare
   * hasText for the program's name matches the routine's row too.
   */
  const rowFor = (
    page: import('@playwright/test').Page,
    name: string,
    kind: 'routine' | 'program'
  ) =>
    rail(page)
      .locator(`[data-testid="scope-row"][data-scope-kind="${kind}"]`)
      .filter({ hasText: name });

  /**
   * Same two-Escape dance programs.spec documents: a dialog opened from the
   * palette leaves the omnibar's dismissable layer underneath it. Opened from
   * the rail there is only one layer, but pressing until it is gone is correct
   * either way and asserts the outcome rather than assuming it.
   */
  async function closeManager(page: import('@playwright/test').Page) {
    const overlay = page.locator('[data-slot="dialog-overlay"]');
    for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    await expect(overlay).toHaveCount(0);
  }

  async function createContainer(
    page: import('@playwright/test').Page,
    kind: 'routine' | 'program',
    name: string
  ) {
    await page.getByRole('tab', { name: kind === 'program' ? 'Programs' : 'Routines' }).click();
    await page.getByTestId(`${kind}-new-name`).fill(name);
    await page.getByTestId(`${kind}-add`).click();
    await expect(page.getByTestId(`${kind}-detail`)).toBeVisible();
  }

  test('is present before any container exists, and is the way in', async ({ page }) => {
    // The bug in one assertion. Every other route to the manager is gated on
    // state a new user does not have.
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).getByTestId('scope-row')).toHaveCount(0);

    await rail(page).getByTestId('scope-rail-add').click();
    await expect(page.getByRole('tab', { name: 'Routines' })).toBeVisible();
    await closeManager(page);
  });

  test('its switch takes work off the grid and puts it back, through the DB', async ({ page }) => {
    const title = testTitle('rail-member');
    const name = testTitle('Summer');
    const habitId = await createTestHabit(page, { title, timeBucket: 'morning', streak: 4 });
    try {
      await reloadApp(page);
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(1);

      await rail(page).getByTestId('scope-rail-add').click();
      await page.getByRole('tab', { name: 'Programs' }).click();
      await page.getByTestId('program-new-name').fill(name);
      await page.getByTestId('program-add').click();
      await expect(page.getByTestId('program-detail')).toBeVisible();
      await page.getByTestId('program-member-add').click();
      await page.getByTestId('program-member-search').fill(title);
      await page.getByTestId('program-member-candidate').first().click();
      await expect(page.getByTestId('program-member')).toHaveCount(1);
      await closeManager(page);

      // A fresh program is 'auto' with no range, which resolves to always-on.
      const row = rowFor(page, name, 'program');
      await expect(row).toHaveAttribute('data-scope-effective', 'on');

      await row.getByTestId('scope-switch').click();
      await expect(row).toHaveAttribute('data-scope-effective', 'off');
      await expect(row).toContainText('Off');
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(0);

      // Survives a reload: the state write reached the DB.
      await reloadApp(page);
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(0);

      await rowFor(page, name, 'program').getByTestId('scope-switch').click();
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(1);
    } finally {
      await cleanupTestData(page, [], [habitId]);
    }
  });

  test('a routine held off by its program keeps its own switch on', async ({ page }) => {
    const title = testTitle('rail-split');
    const routineName = testTitle('Mornings');
    const programName = testTitle('Term');
    // A fixture and a baseline assertion, and NOT only so the consequence is
    // observable. `waitForAppReady` returns on hydration and can beat the items
    // fetch, and initializeStore's set() overwrites `routines` with what came
    // back — so a container created before that lands is silently erased and
    // the detail pane unmounts under the test. Asserting a row on the grid is
    // how a spec proves the fetch has happened. (The same trap cost Phase 3 an
    // afternoon; it is recorded in the plan.)
    const habitId = await createTestHabit(page, { title, timeBucket: 'morning' });
    try {
      await reloadApp(page);
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(1);

      await rail(page).getByTestId('scope-rail-add').click();
      await createContainer(page, 'routine', routineName);
      await page.getByTestId('routine-member-add').click();
      await page.getByTestId('routine-member-search').fill(title);
      await page.getByTestId('routine-member-candidate').first().click();
      await expect(page.getByTestId('routine-member')).toHaveCount(1);

      await createContainer(page, 'program', programName);
      await page.getByTestId('program-routine-add').click();
      await page.getByTestId('program-routine-candidate').first().click();
      // The routine is live and standalone, and the program is live too, so
      // this attach hides nothing and asks nothing.
      await expect(page.getByTestId('program-routine-member')).toHaveCount(1);
      await closeManager(page);

      await rowFor(page, programName, 'program').getByTestId('scope-switch').click();

      const routineRow = rowFor(page, routineName, 'routine');
      // The whole point: stored ON, resolving OFF, and the line names the cause.
      await expect(routineRow).toHaveAttribute('data-scope-local', 'on');
      await expect(routineRow).toHaveAttribute('data-scope-effective', 'off');
      await expect(routineRow).toContainText(`held with ${programName}`);
      // …and the split is not cosmetic: the program two levels up really is
      // carrying the item's visibility.
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(0);
    } finally {
      await cleanupTestData(page, [], [habitId]);
    }
  });
});
