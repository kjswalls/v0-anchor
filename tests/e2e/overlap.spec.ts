import { test, expect, type Page } from '@playwright/test';
import { loginTestUser } from './helpers/auth';
import { setLayout, setScope, waitForAppReady } from './helpers/app';
import { createTestTask, cleanupByTitlePrefix, testTitle } from './helpers/api';
import { getTodayStr } from './helpers/dates';

/**
 * Overlapping schedule blocks — "Pocket & Channel" (memory/plans/overlap-blocks.md).
 *
 * The pass itself is pinned by tests/unit/schedule-overlap.test.ts, and the props
 * reaching the DOM by tests/unit/schedule-block-overlap.test.tsx. What only a real
 * browser can answer is the part that broke in review: whether you can actually
 * REACH both items. Hit-testing depends on live geometry, compositing and z-order
 * — none of which jsdom models — and the first implementation shipped a container
 * that latched `:hover` and made its own child unclickable.
 */

/**
 * Tall enough that a day holding several blocks fits without useFitHourPx
 * squeezing it to the 40px floor — and, more importantly, so every block is
 * inside the viewport. The hit-tests below go through `elementFromPoint`, which
 * takes VIEWPORT coordinates: a block scrolled below the fold reports a
 * bounding box the browser will happily hand to a different element.
 */
test.use({ viewport: { width: 1440, height: 1200 } });

const today = () => getTodayStr();

async function seed(
  page: Page,
  items: { title: string; startTime: string; duration: number; bucket: string }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const i of items) {
    ids.push(
      await createTestTask(page, {
        title: testTitle(i.title),
        isScheduled: true,
        startDate: today(),
        startTime: i.startTime,
        duration: i.duration,
        timeBucket: i.bucket,
      })
    );
  }
  return ids;
}

async function openDaySchedule(page: Page) {
  await loginTestUser(page);
  await waitForAppReady(page);
  await setLayout(page, 'Schedule');
  await setScope(page, 'Day');
  await expect(page.getByTestId('schedule-block').first()).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * A block's PANE box, scrolled into view so it can be hit-tested.
 *
 * The pane, not the wrapper: the wrapper is the block's band, and every member of
 * a double-booking shares one band — only the panes tile inside it. Measuring the
 * wrapper would put "the centre of B" inside A's pane and report a false overlap.
 */
async function boxOf(page: Page, id: string): Promise<Box> {
  const el = page.locator(`[data-item-id="${id}"] [data-slot="pane"]`);
  await el.scrollIntoViewIfNeeded();
  return (await el.boundingBox())!;
}

/** Which block owns the pixel at (x, y) — i.e. what a click there would hit. */
async function blockAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ({ px, py }) =>
      (document.elementFromPoint(px, py) as HTMLElement | null)
        ?.closest('[data-item-id]')
        ?.getAttribute('data-item-id') ?? null,
    { px: x, py: y }
  );
}

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test.beforeEach(async ({ page }) => {
  await cleanupByTitlePrefix(page, 'e2e_');
});
test.afterEach(async ({ page }) => {
  await cleanupByTitlePrefix(page, 'e2e_');
});

test.describe('overlapping schedule blocks', () => {
  test('a nested pair keeps both titles readable and both items reachable', async ({ page }) => {
    const [parentId, childId] = await seed(page, [
      { title: 'Plan a date', startTime: '10:00', duration: 300, bucket: 'morning' },
      { title: 'Log my food', startTime: '12:00', duration: 180, bucket: 'afternoon' },
    ]);
    await openDaySchedule(page);

    const parent = page.locator(`[data-item-id="${parentId}"]`);
    const child = page.locator(`[data-item-id="${childId}"]`);
    await expect(parent).toBeVisible();
    await expect(child).toBeVisible();

    // The container keeps its full extent: it is still 5h, not cut short at the
    // child. This is the thing the old silent overpaint destroyed.
    await expect(parent).toHaveAttribute('data-duration', '300');
    await expect(child).toHaveAttribute('data-duration', '180');

    // Both titles are on screen at rest — no hover, no tooltip.
    await expect(parent.getByText(/Plan a date/)).toBeVisible();
    await expect(child.getByText(/Log my food/)).toBeVisible();

    // The child is inset inside the parent on BOTH edges, so the pocket frames it.
    const pb = await boxOf(page, parentId);
    const cb = await boxOf(page, childId);
    expect(cb.x).toBeGreaterThan(pb.x);
    expect(cb.x + cb.width).toBeLessThan(pb.x + pb.width);

    // …and the child owns its own pixels.
    expect(await blockAt(page, centre(cb).x, centre(cb).y)).toBe(childId);
  });

  test('hovering the container does not make its child unreachable', async ({ page }) => {
    // Regression: every block used to lift to a flat z-7 on hover. The pointer has
    // to cross the parent to reach the child, so the parent latched :hover, sat on
    // top of the child at every point, and the child could never be hovered or
    // clicked at all.
    const [parentId, childId] = await seed(page, [
      { title: 'Deep work', startTime: '10:00', duration: 300, bucket: 'morning' },
      { title: 'Sync with Sam', startTime: '12:00', duration: 180, bucket: 'afternoon' },
    ]);
    await openDaySchedule(page);

    const pb = await boxOf(page, parentId);
    const cb = await boxOf(page, childId);

    // Enter over the parent's own free band, then travel down into the child.
    await page.mouse.move(pb.x + pb.width / 2, pb.y + 16);
    await page.waitForTimeout(150);
    await page.mouse.move(centre(cb).x, centre(cb).y);
    await page.waitForTimeout(250);

    expect(await blockAt(page, centre(cb).x, centre(cb).y)).toBe(childId);

    // And the parent is still reachable in the band it kept for itself.
    expect(await blockAt(page, pb.x + pb.width / 2, pb.y + 16)).toBe(parentId);
  });

  test('a double-booking tiles: neither item covers the other', async ({ page }) => {
    const [aId, bId] = await seed(page, [
      { title: 'Standup', startTime: '08:00', duration: 60, bucket: 'morning' },
      { title: 'Dentist', startTime: '08:00', duration: 60, bucket: 'morning' },
    ]);
    await openDaySchedule(page);

    const a = page.locator(`[data-item-id="${aId}"]`);
    const b = page.locator(`[data-item-id="${bId}"]`);
    await expect(a.getByText(/Standup/)).toBeVisible();
    await expect(b.getByText(/Dentist/)).toBeVisible();

    // Identical extents, so both must still report the true time.
    await expect(a).toHaveAttribute('data-start-min', '480');
    await expect(b).toHaveAttribute('data-start-min', '480');

    // Each owns its own pixels — the failure mode here is one pane painted over
    // the other, which leaves one of them entirely unclickable.
    const ab = await boxOf(page, aId);
    const bb = await boxOf(page, bId);
    expect(await blockAt(page, centre(ab).x, centre(ab).y)).toBe(aId);
    expect(await blockAt(page, centre(bb).x, centre(bb).y)).toBe(bId);
  });

  test('a crossing pair takes separate channels with grid showing between', async ({ page }) => {
    const [aId, bId] = await seed(page, [
      { title: 'Design review', startTime: '16:00', duration: 120, bucket: 'afternoon' },
      { title: 'Lunch with Ana', startTime: '17:00', duration: 120, bucket: 'evening' },
    ]);
    await openDaySchedule(page);

    const a = page.locator(`[data-item-id="${aId}"]`);
    const b = page.locator(`[data-item-id="${bId}"]`);
    const ab = await boxOf(page, aId);
    const bb = await boxOf(page, bId);

    // Side by side with a real gap, not stacked.
    const [left, right] = ab.x <= bb.x ? [ab, bb] : [bb, ab];
    expect(right.x).toBeGreaterThan(left.x + left.width);

    await expect(a.getByText(/Design review/)).toBeVisible();
    await expect(b.getByText(/Lunch with Ana/)).toBeVisible();
    expect(await blockAt(page, centre(ab).x, centre(ab).y)).toBe(aId);
    expect(await blockAt(page, centre(bb).x, centre(bb).y)).toBe(bId);
  });

  test('an uncrowded day is untouched by the overlap pass', async ({ page }) => {
    // The common case, and the one a layout pass could quietly regress: a block
    // with nothing overlapping it must render exactly as it always did.
    const [soloId] = await seed(page, [
      { title: 'Go to the gym', startTime: '08:00', duration: 60, bucket: 'morning' },
    ]);
    await openDaySchedule(page);

    const solo = page.locator(`[data-item-id="${soloId}"]`);
    await expect(solo).toBeVisible();
    await expect(solo).toHaveClass(/left-0/);
    await expect(solo).toHaveClass(/right-1/);
    await expect(solo.getByText(/Go to the gym/)).toBeVisible();
  });
});
