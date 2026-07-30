import { readFileSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { SETUP_ARTIFACT, TEST_TITLE_PREFIX } from './env';

const BASE_URL = 'http://localhost:3000';

/**
 * Fixtures created through the agent API.
 *
 * The /api/agent/* routes authenticate with Bearer <anchor_api_key> (stored in
 * user_settings.openclaw_api_key). That key is resolved ONCE in globalSetup and
 * read from disk here.
 *
 * Why not fetch it per test, as before? The old getAccessToken() POSTed
 * /api/agent/apikey whenever GET returned null, and that route REGENERATES the
 * key. Under fullyParallel two workers could both see null, both mint a key, and
 * the loser's Bearer token would 401 — with cleanupTestData swallowing the
 * failure as a console.warn, leaking rows permanently.
 */

let cachedKey: string | null = null;

/** The test user's API key, resolved by globalSetup. */
export function apiKey(): string {
  if (cachedKey) return cachedKey;
  try {
    const { apiKey: key } = JSON.parse(readFileSync(SETUP_ARTIFACT, 'utf8'));
    if (!key) throw new Error('no apiKey in setup artifact');
    cachedKey = key as string;
    return cachedKey;
  } catch (err) {
    throw new Error(
      `Could not read the test API key from ${SETUP_ARTIFACT}. ` +
        'globalSetup should have written it — did the run start via playwright.config.ts? ' +
        `(${err instanceof Error ? err.message : String(err)})`
    );
  }
}

/** The test user's id, resolved by globalSetup. */
export function testUserId(): string {
  const { userId } = JSON.parse(readFileSync(SETUP_ARTIFACT, 'utf8'));
  return userId as string;
}

/**
 * Retained for specs that still ask for a token explicitly. Now a pure read of
 * the setup artifact — it makes no network call and cannot rotate the key.
 */
export async function getAccessToken(_page?: Page): Promise<string> {
  return apiKey();
}

/**
 * A collision-proof, sweepable title.
 *
 * The TEST_TITLE_PREFIX lets globalSetup recognise and delete litter from runs
 * that were aborted before their cleanup could run. The random suffix (not just a
 * timestamp) matters under parallelism: two workers starting in the same
 * millisecond used to be able to produce the same title, and every assertion here
 * matches on either id or exact title.
 */
export function testTitle(label: string): string {
  return `${TEST_TITLE_PREFIX}${label}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' };
}

function ctx(page: Page | APIRequestContext): APIRequestContext {
  return 'request' in page ? page.request : page;
}

/** Create a task via the agent API; returns its id. */
export async function createTestTask(
  page: Page | APIRequestContext,
  _accessTokenOrData: string | Record<string, unknown>,
  maybeData?: Record<string, unknown>
): Promise<string> {
  // Tolerates both the old (page, token, data) call shape and a terser
  // (page, data) one, so specs can be migrated incrementally.
  const data = (maybeData ?? (_accessTokenOrData as Record<string, unknown>)) ?? {};

  const response = await ctx(page).post(`${BASE_URL}/api/agent/tasks`, {
    headers: authHeaders(),
    data: { title: testTitle('task'), status: 'pending', isScheduled: false, order: 9999, ...data },
  });

  if (!response.ok()) {
    throw new Error(`createTestTask failed (${response.status()}): ${await response.text()}`);
  }
  const { task } = await response.json();
  return task.id as string;
}

/** Create a habit via the agent API; returns its id. */
export async function createTestHabit(
  page: Page | APIRequestContext,
  _accessTokenOrData: string | Record<string, unknown>,
  maybeData?: Record<string, unknown>
): Promise<string> {
  const data = (maybeData ?? (_accessTokenOrData as Record<string, unknown>)) ?? {};

  const response = await ctx(page).post(`${BASE_URL}/api/agent/habits`, {
    headers: authHeaders(),
    data: {
      title: testTitle('habit'),
      group: 'Personal',
      status: 'pending',
      repeatFrequency: 'daily',
      ...data,
    },
  });

  if (!response.ok()) {
    throw new Error(`createTestHabit failed (${response.status()}): ${await response.text()}`);
  }
  const { habit } = await response.json();
  return habit.id as string;
}

/** Patch a task through the agent API. */
export async function patchTestTask(
  page: Page | APIRequestContext,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await ctx(page).patch(`${BASE_URL}/api/agent/tasks/${id}`, {
    headers: authHeaders(),
    data,
  });
  if (!res.ok()) throw new Error(`patchTestTask failed (${res.status()}): ${await res.text()}`);
}

/** Read a task back through the agent API — for asserting what actually persisted. */
export async function fetchTestTask(
  page: Page | APIRequestContext,
  id: string
): Promise<Record<string, unknown> | null> {
  const res = await ctx(page).get(`${BASE_URL}/api/agent/context`, { headers: authHeaders() });
  if (!res.ok()) throw new Error(`fetchTestTask failed (${res.status()}): ${await res.text()}`);
  const body = await res.json();
  return (body.tasks ?? []).find((t: { id: string }) => t.id === id) ?? null;
}

/** Read a habit back through the agent API. */
export async function fetchTestHabit(
  page: Page | APIRequestContext,
  id: string
): Promise<Record<string, unknown> | null> {
  const res = await ctx(page).get(`${BASE_URL}/api/agent/context`, { headers: authHeaders() });
  if (!res.ok()) throw new Error(`fetchTestHabit failed (${res.status()}): ${await res.text()}`);
  const body = await res.json();
  return (body.habits ?? []).find((h: { id: string }) => h.id === id) ?? null;
}

/**
 * Delete fixtures. Never throws — a cleanup failure must not mask the assertion
 * failure that a test is actually reporting.
 */
export async function cleanupTestData(
  page: Page | APIRequestContext,
  _accessTokenOrTaskIds: string | string[],
  maybeTaskIds?: string[],
  maybeHabitIds: string[] = []
): Promise<void> {
  const taskIds = Array.isArray(_accessTokenOrTaskIds)
    ? _accessTokenOrTaskIds
    : (maybeTaskIds ?? []);
  const habitIds = Array.isArray(_accessTokenOrTaskIds) ? (maybeTaskIds ?? []) : maybeHabitIds;

  const headers = { Authorization: `Bearer ${apiKey()}` };
  const request = ctx(page);

  await Promise.allSettled([
    ...taskIds.filter(Boolean).map(async (id) => {
      const res = await request.delete(`${BASE_URL}/api/agent/tasks/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] task ${id}: ${res.status()}`);
      }
    }),
    ...habitIds.filter(Boolean).map(async (id) => {
      const res = await request.delete(`${BASE_URL}/api/agent/habits/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] habit ${id}: ${res.status()}`);
      }
    }),
  ]);
}

/**
 * Force the test user's settings back to the values globalSetup seeded.
 *
 * These columns are GLOBAL to the shared test user, so a spec that changes one
 * leaks into every other spec's fresh context — a leaked 24h clock or a leaked
 * `show_completed_tasks: false` makes unrelated assertions fail with no hint as to
 * why. Restoring through the UI is not enough: the write is debounced ~500ms with
 * only a fire-and-forget pagehide flush, and a failing test never reaches its
 * restore step at all. So write the row directly and don't depend on the app.
 */
export async function resetUserSettings(page: Page | APIRequestContext): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${url}/rest/v1/user_settings`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: testUserId(),
      onboarding_completed: true,
      morning_check_enabled: false,
      eod_review_enabled: false,
      show_completed_tasks: true,
      compact_mode: false,
      default_view: 'day',
      time_format: '12h',
      week_start_day: 'sunday',
    }),
  });
  if (!res.ok) console.warn(`[settings-reset] ${res.status}: ${await res.text()}`);
}

/**
 * Write specific columns on the test user's settings row.
 *
 * For asserting that a PERSISTED preference reaches the view, without depending on
 * the settings dialog's sectioned navigation (its selects are not mounted until
 * their section is chosen, so a locator can be looking at nothing).
 */
export async function setUserSetting(
  page: Page | APIRequestContext,
  columns: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${url}/rest/v1/user_settings`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: testUserId(), ...columns }),
  });
  if (!res.ok) {
    throw new Error(`setUserSetting failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Delete every item whose title starts with `prefix`.
 *
 * The id-based cleanup above only covers fixtures created through the API. Items
 * created through the UI have no id on the test side, so tests that add via the
 * dialog or the omnibar used to leak a row on every run — permanently, into a
 * braindump that renders all of them unvirtualized.
 */
export async function cleanupByTitlePrefix(
  page: Page | APIRequestContext,
  prefix: string
): Promise<void> {
  const request = ctx(page);
  const headers = { Authorization: `Bearer ${apiKey()}` };

  const res = await request.get(`${BASE_URL}/api/agent/context`, { headers });
  if (!res.ok()) {
    console.warn(`[cleanup] context fetch failed: ${res.status()}`);
    return;
  }
  const body = await res.json();

  const tasks = (body.tasks ?? []).filter((t: { title?: string }) => t.title?.startsWith(prefix));
  const habits = (body.habits ?? []).filter((h: { title?: string }) => h.title?.startsWith(prefix));

  await cleanupTestData(
    page,
    tasks.map((t: { id: string }) => t.id),
    habits.map((h: { id: string }) => h.id)
  );
}
