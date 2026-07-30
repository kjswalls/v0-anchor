import type { Cookie } from '@playwright/test';

/**
 * Encode a Supabase session the way @supabase/ssr stores it, so a session
 * obtained in Node can be injected into a browser context as cookies.
 *
 * Extracted from the old helpers/auth.ts so globalSetup and per-test login share
 * ONE implementation — a drift here silently breaks the entire suite, and the
 * app has no auth gate locally (NEXT_PUBLIC_DISABLE_AUTH=true short-circuits
 * proxy.ts), so the failure mode is a fully-rendered EMPTY planner rather than a
 * redirect to /login.
 *
 * Cookie encoding (matches @supabase/ssr v0.9 defaults):
 *   name:  sb-<project-ref>-auth-token   (ref = the URL's first hostname label)
 *   value: "base64-" + base64url(UTF-8(JSON.stringify(session)))
 *   chunked into `<name>.0`, `.1`, … when the URI-encoded value exceeds 3180 B.
 */

const MAX_CHUNK_SIZE = 3180;

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: { id?: string };
  [key: string]: unknown;
}

/** Exchange email/password for a session via the Supabase REST API. */
export async function passwordGrant(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<SupabaseSession> {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    // 429 is the one worth calling out: Supabase rate-limits the token endpoint
    // to ~30 requests / 5 min / IP, which a per-test grant blows through.
    const hint =
      res.status === 429
        ? ' — Supabase auth rate limit. The suite is meant to authenticate ONCE in globalSetup; a per-test grant will hit this.'
        : '';
    throw new Error(`Supabase password grant failed (${res.status}): ${body}${hint}`);
  }

  return (await res.json()) as SupabaseSession;
}

/** Cookie name base for a project URL, e.g. sb-abcdef-auth-token. */
export function cookieBaseName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/**
 * Encode a session as browser cookies for `localhost`.
 *
 * `httpOnly: false` because @supabase/ssr's browser client reads them from JS;
 * `secure: false` because local dev and CI both serve plain http.
 */
export function sessionCookies(supabaseUrl: string, session: SupabaseSession): Cookie[] {
  const name = cookieBaseName(supabaseUrl);
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

  const base = {
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
    // ~400 days, matching DEFAULT_COOKIE_OPTIONS.maxAge in @supabase/ssr.
    expires: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
  };

  // The library measures the URI-ENCODED length before deciding to chunk. The
  // base64url alphabet is entirely URL-safe so encoding never inflates it, but
  // measure the encoded form anyway to stay faithful to the library.
  const encoded = encodeURIComponent(value);
  if (encoded.length <= MAX_CHUNK_SIZE) {
    return [{ ...base, name, value }];
  }

  const cookies: Cookie[] = [];
  let remaining = encoded;
  let i = 0;
  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE);
    // Never cut inside a %-escape.
    const lastPct = head.lastIndexOf('%');
    if (lastPct > MAX_CHUNK_SIZE - 3) head = head.slice(0, lastPct);
    cookies.push({ ...base, name: `${name}.${i}`, value: decodeURIComponent(head) });
    remaining = remaining.slice(head.length);
    i++;
  }
  return cookies;
}

/**
 * The view-store's persisted shape, seeded so every test starts in Day ×
 * Buckets regardless of what another test left behind.
 *
 * `adoptedLegacy: true` is the load-bearing field: without it, adoptLegacyViewPrefs
 * (lib/view-store.ts) copies the SERVER-side user_settings.default_view into the
 * store on first mount — and setScope mirrors into that column — so one spec
 * switching to Week leaks into every other spec's fresh context, where it makes
 * the date chevrons step 7 days and removes [data-dnd-bucket] entirely.
 */
export function seededViewState(): { name: string; value: string } {
  return {
    name: 'anchor-view',
    value: JSON.stringify({
      version: 1,
      state: {
        scope: 'day',
        layout: 'buckets',
        typeFilter: 'all',
        canvasGroupBy: 'none',
        braindumpGroupBy: 'none',
        typeMode: 'sans',
        adoptedLegacy: true,
      },
    }),
  };
}
