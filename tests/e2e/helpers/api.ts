import type { Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

/**
 * Get the Anchor API key for the authenticated test user.
 *
 * The /api/agent/ routes authenticate via Bearer <anchor_api_key> (stored in
 * user_settings.openclaw_api_key). This helper fetches it via GET /api/agent/apikey
 * using the session cookies already injected by loginTestUser(). If the test user
 * doesn't have a key yet, it generates one via POST /api/agent/apikey.
 */
export async function getAccessToken(page: Page): Promise<string> {
  // GET the existing key (uses session cookies, not Bearer)
  const getRes = await page.request.get(`${BASE_URL}/api/agent/apikey`);
  if (!getRes.ok()) {
    const body = await getRes.text();
    throw new Error(`Failed to fetch API key (${getRes.status()}): ${body}`);
  }
  const { apiKey } = await getRes.json();
  if (apiKey) return apiKey as string;

  // No key yet — generate one via POST
  const postRes = await page.request.post(`${BASE_URL}/api/agent/apikey`);
  if (!postRes.ok()) {
    const body = await postRes.text();
    throw new Error(`Failed to generate API key (${postRes.status()}): ${body}`);
  }
  const { apiKey: newKey } = await postRes.json();
  if (!newKey) throw new Error('API key generation returned null');
  return newKey as string;
}

/**
 * Create a task via the agent API and return its id.
 *
 * @param page - Playwright Page (uses page.request so cookies are shared)
 * @param accessToken - OpenClaw API key returned by getAccessToken()
 * @param data - Task fields; title, status, isScheduled and order have defaults
 */
export async function createTestTask(
  page: Page,
  accessToken: string,
  data: Record<string, unknown>
): Promise<string> {
  const response = await page.request.post(`${BASE_URL}/api/agent/tasks`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      title: 'Test task',
      status: 'pending',
      isScheduled: false,
      order: 9999,
      ...data,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`createTestTask failed (${response.status()}): ${body}`);
  }

  const { task } = await response.json();
  return task.id as string;
}

/**
 * Create a habit via the agent API and return its id.
 *
 * @param page - Playwright Page (uses page.request so cookies are shared)
 * @param accessToken - OpenClaw API key returned by getAccessToken()
 * @param data - Habit fields; title, group, status and repeatFrequency have defaults
 */
export async function createTestHabit(
  page: Page,
  accessToken: string,
  data: Record<string, unknown>
): Promise<string> {
  const response = await page.request.post(`${BASE_URL}/api/agent/habits`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      title: 'Test habit',
      group: 'Personal',
      status: 'pending',
      repeatFrequency: 'daily',
      ...data,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`createTestHabit failed (${response.status()}): ${body}`);
  }

  const { habit } = await response.json();
  return habit.id as string;
}

/**
 * Delete test tasks and habits created during a test run.
 * Logs a warning on failure but does not throw — cleanup should not fail a test.
 */
export async function cleanupTestData(
  page: Page,
  accessToken: string,
  taskIds: string[],
  habitIds: string[] = []
): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  await Promise.all([
    ...taskIds.map(async (id) => {
      const res = await page.request.delete(`${BASE_URL}/api/agent/tasks/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] Failed to delete task ${id}: ${res.status()}`);
      }
    }),
    ...habitIds.map(async (id) => {
      const res = await page.request.delete(`${BASE_URL}/api/agent/habits/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] Failed to delete habit ${id}: ${res.status()}`);
      }
    }),
  ]);
}
