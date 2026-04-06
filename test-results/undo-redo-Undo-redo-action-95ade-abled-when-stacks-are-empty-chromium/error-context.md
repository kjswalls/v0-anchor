# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: undo-redo.spec.ts >> Undo / redo actions >> undo/redo buttons in the UI are disabled when stacks are empty
- Location: tests/e2e/undo-redo.spec.ts:11:7

# Error details

```
Error: Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
```

# Test source

```ts
  1   | import type { Page } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * Log in the test user by calling Supabase's REST API directly in Node, then
  5   |  * injecting the session into the browser context as cookies — no UI, no magic
  6   |  * link, no page.evaluate() imports.
  7   |  *
  8   |  * This bypasses the login UI entirely. All E2E specs that are not specifically
  9   |  * testing the authentication flow (magic link, OAuth, etc.) should use this.
  10  |  *
  11  |  * Why cookies instead of page.evaluate + import?
  12  |  * @supabase/ssr persists sessions in cookies (not localStorage). The previous
  13  |  * implementation tried to `import("@supabase/ssr")` inside page.evaluate(),
  14  |  * but Playwright's browser context cannot resolve Node modules — it throws
  15  |  * "TypeError: Failed to resolve module specifier @supabase/ssr".
  16  |  *
  17  |  * The fix: call the Supabase password auth REST endpoint from Node (using
  18  |  * page.request, which runs in Node), encode the returned session exactly the
  19  |  * way @supabase/ssr would (base64url, chunked at 3 180 bytes), and inject the
  20  |  * resulting cookies via page.context().addCookies() before the first navigation.
  21  |  * The server-side Supabase client picks them up on the very first request.
  22  |  *
  23  |  * Cookie encoding details (matches @supabase/ssr v0.9 defaults):
  24  |  *   name:  sb-<project-ref>-auth-token  (project-ref = URL subdomain)
  25  |  *   value: "base64-" + base64url( UTF-8( JSON.stringify(session) ) )
  26  |  *   chunked into multiple cookies (sb-…-auth-token.0, .1, …) if the
  27  |  *   URI-encoded value exceeds MAX_CHUNK_SIZE (3 180 bytes).
  28  |  *
  29  |  * For real auth flow tests, see: https://github.com/kjswalls/v0-anchor/issues/117
  30  |  *
  31  |  * Requires env vars:
  32  |  *   NEXT_PUBLIC_SUPABASE_URL   — e.g. https://xxxx.supabase.co
  33  |  *   NEXT_PUBLIC_SUPABASE_ANON_KEY
  34  |  *   TEST_USER_EMAIL
  35  |  *   TEST_USER_PASSWORD
  36  |  */
  37  | export async function loginTestUser(page: Page): Promise<void> {
  38  |   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  39  |   const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  40  |   const email = process.env.TEST_USER_EMAIL;
  41  |   const password = process.env.TEST_USER_PASSWORD;
  42  | 
  43  |   if (!supabaseUrl || !anonKey || !email || !password) {
> 44  |     throw new Error(
      |           ^ Error: Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
  45  |       'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD'
  46  |     );
  47  |   }
  48  | 
  49  |   // 1. Exchange credentials for tokens via the Supabase REST API.
  50  |   //    page.request runs in Node, so it can reach the Supabase origin directly.
  51  |   const response = await page.request.post(
  52  |     `${supabaseUrl}/auth/v1/token?grant_type=password`,
  53  |     {
  54  |       headers: {
  55  |         apikey: anonKey,
  56  |         'Content-Type': 'application/json',
  57  |       },
  58  |       data: { email, password },
  59  |     }
  60  |   );
  61  | 
  62  |   if (!response.ok()) {
  63  |     const body = await response.text();
  64  |     throw new Error(
  65  |       `Supabase signInWithPassword failed (${response.status()}): ${body}`
  66  |     );
  67  |   }
  68  | 
  69  |   const session = await response.json();
  70  | 
  71  |   // 2. Derive the cookie base name.
  72  |   //    @supabase/ssr defaults to `sb-<ref>-auth-token` where <ref> is the
  73  |   //    first segment of the Supabase hostname (the project reference ID).
  74  |   const ref = new URL(supabaseUrl).hostname.split('.')[0];
  75  |   const cookieBaseName = `sb-${ref}-auth-token`;
  76  | 
  77  |   // 3. Encode the session the same way @supabase/ssr does by default
  78  |   //    (cookieEncoding: "base64url"):
  79  |   //      encoded = "base64-" + base64url( UTF-8( JSON.stringify(session) ) )
  80  |   //    Node's Buffer base64url encoding is byte-for-byte identical to
  81  |   //    @supabase/ssr's stringToBase64URL() — both convert the JS string to
  82  |   //    UTF-8 bytes then base64url-encode without padding.
  83  |   const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  84  | 
  85  |   // 4. Chunk the value if it exceeds @supabase/ssr's MAX_CHUNK_SIZE.
  86  |   //    The library checks the *URI-encoded* length (encodeURIComponent) against
  87  |   //    3 180 bytes before deciding to chunk. Because the base64url alphabet is
  88  |   //    entirely URL-safe, encodeURIComponent won't inflate the value, so the
  89  |   //    check is effectively on the raw length.
  90  |   //
  91  |   //    Single chunk  → cookie named exactly `cookieBaseName`
  92  |   //    Multiple chunks → cookies named `cookieBaseName.0`, `.1`, `.2`, …
  93  |   const MAX_CHUNK_SIZE = 3180;
  94  |   const encodedValue = encodeURIComponent(cookieValue);
  95  | 
  96  |   // ~400-day expiry, matching DEFAULT_COOKIE_OPTIONS.maxAge in @supabase/ssr
  97  |   const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;
  98  |   const cookieDefaults = {
  99  |     domain: 'localhost',
  100 |     path: '/',
  101 |     httpOnly: false, // @supabase/ssr browser client reads cookies from JS
  102 |     secure: false,   // http in local dev / CI
  103 |     sameSite: 'Lax' as const,
  104 |     expires,
  105 |   };
  106 | 
  107 |   const cookies: Array<typeof cookieDefaults & { name: string; value: string }> = [];
  108 | 
  109 |   if (encodedValue.length <= MAX_CHUNK_SIZE) {
  110 |     // Common case: entire session fits in one cookie.
  111 |     cookies.push({ ...cookieDefaults, name: cookieBaseName, value: cookieValue });
  112 |   } else {
  113 |     // Large session: replicate @supabase/ssr's chunker (chunker.ts:createChunks).
  114 |     // Split along URI-encoded boundaries so we never cut inside a %-sequence.
  115 |     let remaining = encodedValue;
  116 |     let i = 0;
  117 | 
  118 |     while (remaining.length > 0) {
  119 |       let head = remaining.slice(0, MAX_CHUNK_SIZE);
  120 | 
  121 |       // If the last %-encoded sequence is truncated, back up to exclude it.
  122 |       const lastPct = head.lastIndexOf('%');
  123 |       if (lastPct > MAX_CHUNK_SIZE - 3) {
  124 |         head = head.slice(0, lastPct);
  125 |       }
  126 | 
  127 |       cookies.push({
  128 |         ...cookieDefaults,
  129 |         name: `${cookieBaseName}.${i}`,
  130 |         value: decodeURIComponent(head),
  131 |       });
  132 | 
  133 |       remaining = remaining.slice(head.length);
  134 |       i++;
  135 |     }
  136 |   }
  137 | 
  138 |   // 5. Inject the session cookies into the browser context before navigation.
  139 |   //    The server-side Supabase client (middleware / RSC) reads them on the
  140 |   //    very first request — no page.evaluate(), no Node module imports needed.
  141 |   await page.context().addCookies(cookies);
  142 | 
  143 |   // 5b. Mark onboarding complete for the test user so the onboarding tour
  144 |   //     never blocks UI interactions during E2E tests.
```