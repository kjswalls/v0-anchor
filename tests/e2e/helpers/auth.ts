import type { Page } from '@playwright/test';

/**
 * Log in the test user by calling Supabase's REST API directly.
 *
 * This bypasses the login UI entirely — all E2E specs that aren't specifically
 * testing the authentication flow (magic link, OAuth, etc.) should use this.
 *
 * For real auth flow tests, see: https://github.com/kjswalls/v0-anchor/issues/117
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   — e.g. https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_USER_EMAIL
 *   TEST_USER_PASSWORD
 */
export async function loginTestUser(page: Page): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!supabaseUrl || !anonKey || !email || !password) {
    throw new Error(
      'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD'
    );
  }

  // Call Supabase token endpoint directly — no browser UI needed
  const response = await page.request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      data: { email, password },
    }
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Supabase signInWithPassword failed (${response.status()}): ${body}`);
  }

  const { access_token, refresh_token } = await response.json();

  // Inject the session into the browser's localStorage so the app picks it up
  await page.goto('/');
  await page.evaluate(
    ({ url, key, access, refresh }) => {
      const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: access,
          refresh_token: refresh,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        })
      );
    },
    {
      url: supabaseUrl,
      key: anonKey,
      access: access_token,
      refresh: refresh_token,
    }
  );

  // Reload so the app hydrates with the injected session
  await page.reload();
  await page.waitForURL('/');
}
