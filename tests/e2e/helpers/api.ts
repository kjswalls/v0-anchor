import type { Page, APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

/**
 * Get the OpenClaw API key for the authenticated test user.
 *
 * Note: The /api/agent/ routes authenticate via Bearer <openclaw_api_key>,
 * not Supabase access tokens. This helper calls GET /api/agent/apikey using
 * the session cookies already injected by loginTestUser() to retrieve the key.
 *
 * The returned key is used as the Bearer token for all direct API calls.
 */
export async function getAccessToken(page: Page): Promise<string> {
  const response = await page.request.get(`${BASE_URL}/api/agent/apikey`);
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to fetch OpenClaw API key (${response.status()}): ${body}`);
  }
  const { apiKey } = await response.json();
  if (!apiKey) {
    throw new Error(
      'No OpenClaw API key found for the test user. ' +
      'Open the app as the test user and generate an API key in Settings → AI.'
    );
  }
  return apiKey;
}

/**
 * Create a task via the agent API and return its id.
 *
 * @param request - Playwright APIRequestContext (from test fixture)
 * @param accessToken - OpenClaw API key returned by getAccessToken()
 * @param data - Task fields; title, status, isScheduled and order have defaults
 */
export async function createTestTask(
  request: APIRequestContext,
  accessToken: string,
  data: Record<string, unknown>
): Promise<string> {
  const response = await request.post(`${BASE_URL}/api/agent/tasks`, {
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
 * @param request - Playwright APIRequestContext (from test fixture)
 * @param accessToken - OpenClaw API key returned by getAccessToken()
 * @param data - Habit fields; title, group, status and repeatFrequency have defaults
 */
export async function createTestHabit(
  request: APIRequestContext,
  accessToken: string,
  data: Record<string, unknown>
): Promise<string> {
  const response = await request.post(`${BASE_URL}/api/agent/habits`, {
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
  request: APIRequestContext,
  accessToken: string,
  taskIds: string[],
  habitIds: string[] = []
): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  await Promise.all([
    ...taskIds.map(async (id) => {
      const res = await request.delete(`${BASE_URL}/api/agent/tasks/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] Failed to delete task ${id}: ${res.status()}`);
      }
    }),
    ...habitIds.map(async (id) => {
      const res = await request.delete(`${BASE_URL}/api/agent/habits/${id}`, { headers });
      if (!res.ok() && res.status() !== 404) {
        console.warn(`[cleanup] Failed to delete habit ${id}: ${res.status()}`);
      }
    }),
  ]);
}
