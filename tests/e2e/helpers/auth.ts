import type { Page } from '@playwright/test';

/**
 * Log in the test user by calling Supabase's REST API directly in Node, then
 * injecting the session into the browser context as cookies — no UI, no magic
 * link, no page.evaluate() imports.
 *
 * This bypasses the login UI entirely. All E2E specs that are not specifically
 * testing the authentication flow (magic link, OAuth, etc.) should use this.
 *
 * Why cookies instead of page.evaluate + import?
 * @supabase/ssr persists sessions in cookies (not localStorage). The previous
 * implementation tried to `import("@supabase/ssr")` inside page.evaluate(),
 * but Playwright's browser context cannot resolve Node modules — it throws
 * "TypeError: Failed to resolve module specifier @supabase/ssr".
 *
 * The fix: call the Supabase password auth REST endpoint from Node (using
 * page.request, which runs in Node), encode the returned session exactly the
 * way @supabase/ssr would (base64url, chunked at 3 180 bytes), and inject the
 * resulting cookies via page.context().addCookies() before the first navigation.
 * The server-side Supabase client picks them up on the very first request.
 *
 * Cookie encoding details (matches @supabase/ssr v0.9 defaults):
 *   name:  sb-<project-ref>-auth-token  (project-ref = URL subdomain)
 *   value: "base64-" + base64url( UTF-8( JSON.stringify(session) ) )
 *   chunked into multiple cookies (sb-…-auth-token.0, .1, …) if the
 *   URI-encoded value exceeds MAX_CHUNK_SIZE (3 180 bytes).
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

  // 1. Exchange credentials for tokens via the Supabase REST API.
  //    page.request runs in Node, so it can reach the Supabase origin directly.
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
    throw new Error(
      `Supabase signInWithPassword failed (${response.status()}): ${body}`
    );
  }

  const session = await response.json();

  // 2. Derive the cookie base name.
  //    @supabase/ssr defaults to `sb-<ref>-auth-token` where <ref> is the
  //    first segment of the Supabase hostname (the project reference ID).
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  const cookieBaseName = `sb-${ref}-auth-token`;

  // 3. Encode the session the same way @supabase/ssr does by default
  //    (cookieEncoding: "base64url"):
  //      encoded = "base64-" + base64url( UTF-8( JSON.stringify(session) ) )
  //    Node's Buffer base64url encoding is byte-for-byte identical to
  //    @supabase/ssr's stringToBase64URL() — both convert the JS string to
  //    UTF-8 bytes then base64url-encode without padding.
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

  // 4. Chunk the value if it exceeds @supabase/ssr's MAX_CHUNK_SIZE.
  //    The library checks the *URI-encoded* length (encodeURIComponent) against
  //    3 180 bytes before deciding to chunk. Because the base64url alphabet is
  //    entirely URL-safe, encodeURIComponent won't inflate the value, so the
  //    check is effectively on the raw length.
  //
  //    Single chunk  → cookie named exactly `cookieBaseName`
  //    Multiple chunks → cookies named `cookieBaseName.0`, `.1`, `.2`, …
  const MAX_CHUNK_SIZE = 3180;
  const encodedValue = encodeURIComponent(cookieValue);

  // ~400-day expiry, matching DEFAULT_COOKIE_OPTIONS.maxAge in @supabase/ssr
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;
  const cookieDefaults = {
    domain: 'localhost',
    path: '/',
    httpOnly: false, // @supabase/ssr browser client reads cookies from JS
    secure: false,   // http in local dev / CI
    sameSite: 'Lax' as const,
    expires,
  };

  const cookies: Array<typeof cookieDefaults & { name: string; value: string }> = [];

  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    // Common case: entire session fits in one cookie.
    cookies.push({ ...cookieDefaults, name: cookieBaseName, value: cookieValue });
  } else {
    // Large session: replicate @supabase/ssr's chunker (chunker.ts:createChunks).
    // Split along URI-encoded boundaries so we never cut inside a %-sequence.
    let remaining = encodedValue;
    let i = 0;

    while (remaining.length > 0) {
      let head = remaining.slice(0, MAX_CHUNK_SIZE);

      // If the last %-encoded sequence is truncated, back up to exclude it.
      const lastPct = head.lastIndexOf('%');
      if (lastPct > MAX_CHUNK_SIZE - 3) {
        head = head.slice(0, lastPct);
      }

      cookies.push({
        ...cookieDefaults,
        name: `${cookieBaseName}.${i}`,
        value: decodeURIComponent(head),
      });

      remaining = remaining.slice(head.length);
      i++;
    }
  }

  // 5. Inject the session cookies into the browser context before navigation.
  //    The server-side Supabase client (middleware / RSC) reads them on the
  //    very first request — no page.evaluate(), no Node module imports needed.
  await page.context().addCookies(cookies);

  // 5b. Mark onboarding complete for the test user so the onboarding tour
  //     never blocks UI interactions during E2E tests.
  const userId = session.user?.id;
  if (userId) {
    const onboardingRes = await page.request.post(`${supabaseUrl}/rest/v1/user_settings`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      data: { user_id: userId, onboarding_completed: true },
    });
    if (!onboardingRes.ok()) {
      const body = await onboardingRes.text();
      throw new Error(
        `Failed to mark onboarding complete (${onboardingRes.status()}): ${body}`
      );
    }
  }

  // 6. Navigate to the app. The cookies are already present, so the server
  //    hydrates the session on this first request — no reload required.
  await page.goto('/');
  await page.waitForURL('/');
}
