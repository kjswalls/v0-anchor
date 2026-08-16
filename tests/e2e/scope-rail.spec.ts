import { test, expect } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { reloadApp, itemCardIn } from './helpers/app';
import {
  testTitle,
  createTestHabit,
  cleanupTestData,
  cleanupByTitlePrefix,
  cleanupTestCollections,
  collectionScope,
  fetchTestCollections,
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
// Its own container prefix: cleanupTestCollections is a hard DELETE across the
// shared test user, and programs.spec sweeps containers too. Two files sweeping
// the bare TEST_TITLE_PREFIX delete each other's rows mid-test under
// `fullyParallel` + 4 workers, and describe-serial is file-scoped.
const scope = collectionScope('rail');

test.describe('scope rail', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await cleanupByTitlePrefix(page, TEST_TITLE_PREFIX);
    await cleanupTestCollections(scope.prefix);
    await reloadApp(page);
  });

  test.afterEach(async () => {
    await cleanupTestCollections(scope.prefix);
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
   *
   * BOTH overlays, because ResponsiveModal is a Radix dialog above `sm` and a
   * vaul drawer below it. Watching only `dialog-overlay` made this function a
   * no-op on mobile: it found zero overlays, returned, asserted success — and
   * every later tap was silently eaten by a sheet that was still open.
   */
  async function closeManager(page: import('@playwright/test').Page) {
    const overlay = page.locator('[data-slot="dialog-overlay"], [data-slot="drawer-overlay"]');
    for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
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

  /**
   * Touch gets the rail on the Braindump tab, and it is the ONLY route to the
   * containers there — no palette shortcut, no hover, and the item chips are
   * gated on already owning one. It also loses the hover preview entirely,
   * which is why the switch and the count carry the meaning rather than the
   * ghost. Worth its own run: the desktop tests pass in a viewport where none
   * of that is true.
   */
  test('@mobile reaches the containers from the Braindump tab', async ({ page }) => {
    const name = scope.title('Summer');
    // data-tour, not a role: the mobile dock's tabs are plain buttons, and
    // pause.spec's own @mobile test reaches them the same way.
    await page.click('[data-tour="tab-braindump"]');
    await expect(rail(page)).toBeVisible();

    await rail(page).getByTestId('scope-rail-add').click();
    await page.getByRole('tab', { name: 'Programs' }).click();
    await page.getByTestId('program-new-name').fill(name);
    await page.getByTestId('program-add').click();
    await expect(page.getByTestId('program-detail')).toBeVisible();
    await closeManager(page);

    const row = rowFor(page, name, 'program');
    await expect(row).toHaveAttribute('data-scope-effective', 'on');
    // Tap, not hover — the whole point of the mobile mount.
    await row.getByTestId('scope-switch').tap();
    await expect(row).toHaveAttribute('data-scope-effective', 'off');
  });

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
    const name = scope.title('Summer');
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

      // Read the row back before reloading, and NOT as belt-and-braces. The
      // container write is fire-and-forget, the three assertions above are
      // already true the instant the optimistic set() lands, and page.reload()
      // aborts a PATCH still in flight — so "survives a reload" was passing on
      // whether the network beat the navigation. This is also the assertion the
      // test's own name promises: through the DB, not optimistic state.
      await expect
        .poll(async () => (await fetchTestCollections('programs', scope.prefix))[0]?.state)
        .toBe('paused');

      await reloadApp(page);
      // Non-vacuous only because the rail proves the fetch landed first — an
      // item-card count of 0 is trivially true while the grid is still empty.
      await expect(rowFor(page, name, 'program')).toHaveAttribute('data-scope-effective', 'off');
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(0);

      await rowFor(page, name, 'program').getByTestId('scope-switch').click();
      await expect(itemCardIn(timeline(page), habitId)).toHaveCount(1);
    } finally {
      await cleanupTestData(page, [], [habitId]);
    }
  });

  /**
   * Member order is offered on routines and withheld from programs, and that is
   * a DATA rule, not a taste one: `routine_items` carries a `sort_order` column
   * and `program_items` does not, so an order arranged on a program would look
   * saved and reshuffle on the next fetch. A prop passed at one call site is
   * exactly the kind of thing that gets copied to the other by a later editor,
   * so it is pinned where it is visible rather than where it is typed.
   */
  test('reordering is offered on a routine and withheld from a program', async ({ page }) => {
    const first = testTitle('rail-order-a');
    const second = testTitle('rail-order-b');
    const routineName = scope.title('Order');
    const programName = scope.title('Holder');
    const idA = await createTestHabit(page, { title: first, timeBucket: 'morning' });
    const idB = await createTestHabit(page, { title: second, timeBucket: 'morning' });
    try {
      await reloadApp(page);
      await expect(itemCardIn(timeline(page), idA)).toHaveCount(1);

      await rail(page).getByTestId('scope-rail-add').click();
      await createContainer(page, 'routine', routineName);
      for (const title of [first, second]) {
        // The picker STAYS OPEN after an add (Phase 5d) so a run of them is one
        // gesture, which means the opener is gone by the second pass. Reaching
        // for it unconditionally is how this loop used to work and would now
        // time out on a control that is deliberately absent.
        const opener = page.getByTestId('routine-member-add');
        if (await opener.isVisible()) await opener.click();
        await page.getByTestId('routine-member-search').fill(title);
        await page.getByTestId('routine-member-candidate').first().click();
      }
      await expect(page.getByTestId('routine-member')).toHaveCount(2);
      await expect(page.getByTestId('routine-member-up')).toHaveCount(2);

      // Second row up: the pair swaps, and the order is what the list renders.
      await page.getByTestId('routine-member').nth(1).getByTestId('routine-member-up').click();
      await expect(page.getByTestId('routine-member').first()).toContainText(second);
      await expect
        .poll(async () => (await fetchTestCollections('routines', scope.prefix)).length)
        .toBe(1);

      await createContainer(page, 'program', programName);
      await page.getByTestId('program-member-add').click();
      await page.getByTestId('program-member-search').fill(first);
      await page.getByTestId('program-member-candidate').first().click();
      await expect(page.getByTestId('program-member')).toHaveCount(1);
      // No sort_order column behind it, so no control in front of it.
      await expect(page.getByTestId('program-member-up')).toHaveCount(0);
    } finally {
      await cleanupTestData(page, [], [idA, idB]);
    }
  });

  test('a routine held off by its program keeps its own switch on', async ({ page }) => {
    const title = testTitle('rail-split');
    const routineName = scope.title('Mornings');
    const programName = scope.title('Term');
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

      /**
       * PHASE 5's GATE: the console and the rail must answer the same question
       * the same way, about the same routine, in the same session.
       *
       * They did not. `RoutineDetail` resolved `isPausedOn` alone — the
       * routine's OWN switch — so this pane said `Active`, drew its members at
       * full contrast, and offered a delete confirm claiming nothing would come
       * back into view, while the row asserted three lines up says `off`. Both
       * were reading one store; only the rail resolved the whole rule.
       *
       * Both now go through `routineStandingOn`, so this is a test that the two
       * callers still share it rather than that two implementations still agree.
       */
      await rail(page).getByTestId('scope-rail-add').click();
      await page.getByRole('tab', { name: 'Routines' }).click();
      await page.getByTestId('routine-row').filter({ hasText: routineName }).click();

      // LOCAL on the switch, because that is the value the switch writes.
      await expect(page.getByTestId('routine-state-active')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      // EFFECTIVE in the prose, because that is what the rest of the app obeys.
      await expect(page.getByTestId('routine-held-note')).toContainText(programName);
      // And the reverse view names the program that is doing it — a route from
      // the routine to its holder that existed nowhere in the app before.
      const holder = page.getByTestId('routine-holder').filter({ hasText: programName });
      await expect(holder).toHaveAttribute('data-holder-state', 'off');

      await holder.click();
      await expect(page.getByTestId('program-detail')).toBeVisible();
      await expect(page.getByTestId('program-detail')).toContainText(programName);
      await closeManager(page);
    } finally {
      await cleanupTestData(page, [], [habitId]);
    }
  });

  test('a delete confirm hands the cursor back to the row it was opened from', async ({
    page,
  }) => {
    /**
     * The most commonly broken thing in a web console, and the most felt.
     *
     * The confirm is the app's ONE shared AlertDialog, driven by a store action
     * rather than an `<AlertDialogTrigger>` — so Radix's close-focus handler
     * (`preventDefault()` then `trigger?.focus()`) cancelled FocusScope's restore
     * and focused nothing. The cursor landed on `<body>` and the next Tab
     * restarted from the top of the document, which inside a modal means
     * nowhere useful.
     *
     * Run in a real browser as well as in jsdom because focus is exactly the
     * thing jsdom approximates: the unit test pins the mechanism, this pins that
     * the mechanism survives a portal, an overlay and a scroll lock.
     */
    const routineName = scope.title('Focus');
    await rail(page).getByTestId('scope-rail-add').click();
    await createContainer(page, 'routine', routineName);

    const trigger = page.getByTestId('routine-delete');
    await trigger.focus();
    await trigger.click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();

    // Escape is the keyboard's "no", and deciding not to delete is the ordinary
    // outcome of reading a delete prompt.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // The console itself is still open — that Escape was consumed by the
    // confirm, not passed through to the plate underneath it.
    await expect(page.getByTestId('organize-console')).toBeVisible();
    await closeManager(page);
  });
});
