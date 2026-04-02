import type { Page } from '@playwright/test';

/**
 * Log in the test user by calling Supabase's REST API directly, then
 * injecting the session via the Supabase JS client inside the browser context.
 *
 * This bypasses the login UI entirely — all E2E specs that aren't specifically
 * testing the authentication flow (magic link, OAuth, etc.) should use this.
 *
 * Why not localStorage? The app uses @supabase/ssr's createBrowserClient, which
 * stores sessions in cookies (not localStorage). We get tokens from the REST API
 * and then call supabase.auth.setSession() inside the page so the SDK writes the
 * cookies itself — no manual cookie construction needed.
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

  // 1. Get tokens from Supabase REST API (no UI, no magic link)
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

  const session = await response.json();
  const { access_token, refresh_token } = session;

  // 2. Navigate to the app so window/document are available
  await page.goto('/');

  // 3. Call supabase.auth.setSession() inside the browser — the SDK writes
  //    the session to cookies itself, which is what @supabase/ssr reads.
  await page.evaluate(
    async ({ url, key, accessToken, refreshToken }) => {
      const { createBrowserClient } = await import('@supabase/ssr');
      const supabase = createBrowserClient(url, key);
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw new Error(`setSession failed: ${error.message}`);
    },
    { url: supabaseUrl, key: anonKey, accessToken: access_token, refreshToken: refresh_token }
  );

  // 4. Reload so the app's SupabaseProvider hydrates with the session from cookies
  await page.reload();
  await page.waitForURL('/');
}
