import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { reloadApp, runCommand, waitForAppReady } from './helpers/app';
import {
  cleanupByTitlePrefix,
  cleanupTestGoals,
  fetchTestGoal,
  fetchTestGoalMembers,
  specScope,
} from './helpers/api';

/**
 * GOALS — the aspire container (memory/plans/long-term-goals.md).
 *
 * What is worth an end-to-end run rather than a unit test is everything that
 * crosses the store/DB/render boundary, which is exactly where this feature's
 * two shipped blockers lived and where the unit suite could not see them:
 *
 *   1. **A goal's surfaces actually respond.** The `/goal/[id]` Organize button
 *      shipped INERT — it armed a dialog mounted only in AppShell, which that
 *      route does not render — and 1375 green unit tests said nothing, because
 *      nothing about it is a pure function. One assertion here is the whole
 *      cost of never shipping that class of bug again.
 *   2. **An inline-created milestone is FINDABLE.** It shipped bucketed, which
 *      removed it from the braindump (the only list undated work lives in) and
 *      added it to no day column, so it existed on no planner surface at all.
 *      The store test asserted the field; only a rendered surface asserts the
 *      consequence.
 *   3. **A role survives the round trip as a ROLE.** The arrays are an app-side
 *      view of one join table, and every path that flattens them — a bin
 *      snapshot, a partial patch — silently turns milestones into plain
 *      members. Reading `goal_items` back is the only proof.
 *
 * Serial, and under its OWN prefix. Every test writes rows on the shared test
 * user, and sweeping the bare TEST_TITLE_PREFIX from two files hard-DELETEs the
 * other's fixtures mid-test under `fullyParallel` with 4 workers — the lesson
 * scope-rail.spec.ts and programs.spec.ts each had to learn once.
 */
const scope = specScope('goal');

test.describe('goals', () => {
  // Each test drives the console through several open/edit/close round trips
  // against a dev server; each one is a palette invocation plus a Radix modal
  // transition. Same budget programs.spec.ts and organize.spec.ts take.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await cleanupTestGoals(scope.prefix);
    await cleanupByTitlePrefix(page, scope.prefix);
    await reloadApp(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestGoals(scope.prefix);
    await cleanupByTitlePrefix(page, scope.prefix);
  });

  /**
   * Through the palette by the command's own alias — the route every console
   * spec uses, because an unfiltered list truncates before it reaches the row
   * once a few dynamic commands exist.
   */
  async function openGoals(page: Page) {
    await runCommand(page, 'app.goals', { query: '/goals' });
    await expect(page.getByRole('tab', { name: 'Goals' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  }

  /** Close, and PROVE it closed — see programs.spec.ts on the two-Escape dance. */
  async function closeConsole(page: Page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  async function createGoal(page: Page, name: string) {
    await openGoals(page);
    await page.getByTestId('goal-new-name').fill(name);
    await page.getByTestId('goal-add').click();
    // The store write is fire-and-forget, so wait for the ROW rather than
    // assuming the click landed.
    await expect(page.getByTestId('goal-row').filter({ hasText: name })).toBeVisible();
  }

  test('a goal is created, persists, and opens its own page', async ({ page }) => {
    const name = scope.title('chinese');
    await createGoal(page, name);

    // Poll the DATABASE before reloading: a reload on the strength of a DOM
    // assertion can abort the INSERT still in flight, and the failure then
    // surfaces several steps later as something else entirely.
    await expect.poll(async () => (await fetchTestGoal(scope.prefix))?.name).toBe(name);

    await page.getByTestId('goal-row').filter({ hasText: name }).click();
    await page.getByTestId('goal-open-page').click();

    await expect(page).toHaveURL(/\/goal\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
  });

  test('the goal page’s Organize button actually reaches the console', async ({ page }) => {
    // The Phase 2 blocker, pinned. It armed a dialog that this route does not
    // mount, so the click did nothing — and because ui-store is a module
    // singleton, the armed dialog then sprang open on the NEXT navigation.
    const name = scope.title('organize');
    await createGoal(page, name);
    await page.getByTestId('goal-row').filter({ hasText: name }).click();
    await page.getByTestId('goal-open-page').click();
    await expect(page).toHaveURL(/\/goal\//);

    await page.getByTestId('goal-page-organize').click();

    await expect(page).toHaveURL(/\/$|\/\?/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Goals' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('an inline milestone is findable in the braindump, and stored AS a milestone', async ({
    page,
  }) => {
    const name = scope.title('milestones');
    const milestone = scope.title('hsk3');
    await createGoal(page, name);
    await page.getByTestId('goal-row').filter({ hasText: name }).click();

    await page.getByTestId('goal-new-milestone-new-name').fill(milestone);
    await page.getByTestId('goal-new-milestone-add').click();

    // Stored as a MILESTONE, not a plain member. The arrays are an app-side
    // view of one join table; only reading the table back proves the role.
    const goal = await fetchTestGoal(scope.prefix);
    expect(goal).not.toBeNull();
    await expect
      .poll(async () => {
        const rows = await fetchTestGoalMembers(goal!.id);
        return rows.find((r) => r.role === 'milestone') ? 'milestone' : rows[0]?.role ?? 'none';
      })
      .toBe('milestone');

    await closeConsole(page);

    // FINDABLE. It ships undated and unbucketed precisely so it lands here —
    // the first version bucketed it, which removed it from this list and added
    // it to no day column, leaving it visible on no planner surface at all.
    await expect(page.getByTestId('braindump').getByText(milestone)).toBeVisible();
  });

  test('completing the last dated milestone offers achievement without taking it', async ({
    page,
  }) => {
    const name = scope.title('celebrate');
    await createGoal(page, name);
    await page.getByTestId('goal-row').filter({ hasText: name }).click();

    const milestone = scope.title('exam');
    await page.getByTestId('goal-new-milestone-new-name').fill(milestone);
    await page.getByTestId('goal-new-milestone-add').click();
    await closeConsole(page);

    const row = page
      .getByTestId('braindump')
      .locator('[data-testid="item-card"]')
      .filter({ hasText: milestone });
    await expect(row).toBeVisible();
    await row.getByTestId('item-complete-button').click();

    // OFFERS. Achieving is a statement about a stretch of your life, and the
    // app must never make it for you — so the toast appears and the goal is
    // still active until the action is clicked.
    await expect(page.getByText(/milestone/i).first()).toBeVisible();
    await expect.poll(async () => (await fetchTestGoal(scope.prefix))?.state).toBe('active');

    await page.getByRole('button', { name: 'Mark achieved' }).click();
    await expect.poll(async () => (await fetchTestGoal(scope.prefix))?.state).toBe('achieved');
  });

  test('an ended goal names the work it leaves running', async ({ page }) => {
    // Decision 5's wind-down. An achieved goal stops appearing in chips and
    // lists, but its recurring members keep arriving forever with the reason
    // stripped away — and this is the last moment the connection is obvious.
    const name = scope.title('winddown');
    await createGoal(page, name);
    await page.getByTestId('goal-row').filter({ hasText: name }).click();

    const checkin = scope.title('review');
    await page.getByTestId('goal-new-checkin-new-name').fill(checkin);
    await page.getByTestId('goal-new-checkin-add').click();

    await page.getByTestId('goal-state-achieved').click();

    const windDown = page.getByTestId('goal-wind-down');
    await expect(windDown).toBeVisible();
    await expect(windDown.getByText(checkin)).toBeVisible();
    // It NAMES them and offers the verb; it never acts on the goal's behalf.
    await expect(windDown.getByTestId('goal-wind-down-delete')).toBeVisible();
  });

  test('deleting a goal leaves its members alone', async ({ page }) => {
    // The promise the delete confirm makes, and the whole point of the aspire
    // role: the goal is the WHY layer, so removing it must not remove the work.
    const name = scope.title('delete');
    const milestone = scope.title('survivor');
    await createGoal(page, name);
    await page.getByTestId('goal-row').filter({ hasText: name }).click();
    await page.getByTestId('goal-new-milestone-new-name').fill(milestone);
    await page.getByTestId('goal-new-milestone-add').click();

    await page.getByTestId('delete-goal').click();
    await page.getByRole('button', { name: 'Delete goal' }).click();

    await expect.poll(async () => await fetchTestGoal(scope.prefix)).toBeNull();
    await closeConsole(page);
    await waitForAppReady(page);
    await expect(page.getByTestId('braindump').getByText(milestone)).toBeVisible();
  });
});
