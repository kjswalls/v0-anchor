import type { Locator, Page } from '@playwright/test';

/**
 * Simulate a dnd-kit pointer drag from source to target.
 *
 * The app's PointerSensor uses an 8px activation distance (see
 * lib/dnd/CONTRACT.md), so we press, nudge past the threshold, then travel to
 * the target center in steps and release. Steps matter: dnd-kit computes
 * collisions on pointermove, and a single jump can skip the droppable.
 */
export async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error('dragTo: source has no bounding box');

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross the 8px activation threshold before targeting.
  await page.mouse.move(startX + 12, startY, { steps: 3 });

  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  if (!to) {
    await page.mouse.up();
    throw new Error('dragTo: target has no bounding box');
  }

  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  // Let dnd-kit register the final collision before dropping.
  await page.waitForTimeout(150);
  await page.mouse.up();
}
