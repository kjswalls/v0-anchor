import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { testEnv, STORAGE_STATE, SETUP_ARTIFACT, TEST_TITLE_PREFIX, BASE_URL } from './helpers/env';
import { passwordGrant, sessionCookies, seededViewState } from './helpers/session';

/**
 * Runs ONCE before the whole suite.
 *
 * Why this exists: every spec used to call loginTestUser() in beforeEach, i.e. a
 * full Supabase password grant per test. At ~49 tests × up to 3 attempts under
 * CI retries that is ~147 requests to /auth/v1/token from one IP against a
 * default limit of 30 per 5 minutes, so a full run started 429-ing partway
 * through and every remaining test failed in auth rather than on its own merits.
 *
 * Instead: authenticate once, persist the session as Playwright storageState,
 * and let every test start already signed in. This also puts the shared-user
 * setup (deterministic settings, API key, litter sweep) in one place that runs
 * before anything can race it.
 */
export default async function globalSetup() {
  const env = testEnv();

  // 1. One password grant for the entire run.
  const session = await passwordGrant(env.supabaseUrl, env.anonKey, env.email, env.password);
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('Password grant returned no user id — cannot seed settings for the test user.');
  }

  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

  // 2. Pin every auto-opening surface and view default OFF/deterministic.
  //
  // The old helper only set onboarding_completed, which left two other things
  // free to appear over an unrelated spec: the morning check is enabled by
  // default, and the EOD review auto-opens past its configured time (its
  // "already shown today" guard lives only in localStorage, so a fresh
  // Playwright context after 21:00 pops it again). show_completed_tasks must be
  // true or completion assertions can't see their own row; default_view must be
  // 'day' so nothing inherits a leaked Week.
  const existing = await rest(
    `user_settings?user_id=eq.${userId}&select=openclaw_api_key`
  ).then((r) => (r.ok ? r.json() : []));

  const apiKey: string =
    existing?.[0]?.openclaw_api_key ??
    // Same shape the app mints: app/api/agent/apikey/route.ts.
    `anchor_${randomBytes(32).toString('hex')}`;

  const settingsRes = await rest('user_settings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      onboarding_completed: true,
      morning_check_enabled: false,
      eod_review_enabled: false,
      show_completed_tasks: true,
      compact_mode: false,
      default_view: 'day',
      time_format: '12h',
      week_start_day: 'sunday',
      openclaw_api_key: apiKey,
    }),
  });
  if (!settingsRes.ok) {
    throw new Error(
      `Failed to seed user_settings (${settingsRes.status}): ${await settingsRes.text()}`
    );
  }

  // 3. Sweep litter left by earlier runs.
  //
  // Tests that create through the UI cannot always clean up (a timed-out test is
  // aborted before its finally runs), and the braindump renders every
  // unscheduled item unvirtualized — so leftovers accumulate forever and slowly
  // degrade every sidebar-scoped locator and every drag whose geometry depends
  // on the list's height.
  //
  // Guarded: only ever runs against an account that self-identifies as a test
  // user, unless explicitly overridden. A hard delete on a real account would be
  // unrecoverable, so the default is to refuse.
  const looksLikeTestAccount = /e2e|test|playwright/i.test(env.email);
  if (looksLikeTestAccount || process.env.E2E_ALLOW_DB_SWEEP === '1') {
    // Read then delete by id, rather than pushing the prefix into a LIKE.
    // `_` is a single-character WILDCARD in SQL LIKE and TEST_TITLE_PREFIX is
    // `e2e_`, so `title=like.e2e_*` also matched `e2eX…` and anything else whose
    // fourth character happens to differ — a hard DELETE reaching past this
    // sweep's own stated scope, on the one path (E2E_ALLOW_DB_SWEEP=1) where the
    // account is NOT known to be disposable. A JS startsWith has no second
    // reading.
    const found = await rest(`items?user_id=eq.${userId}&select=id,title`);
    if (!found.ok) {
      console.warn(`[globalSetup] sweep skipped (${found.status}): ${await found.text()}`);
    } else {
      const litter = ((await found.json()) as { id: string; title: string | null }[]).filter((row) =>
        row.title?.startsWith(TEST_TITLE_PREFIX)
      );
      if (litter.length) {
        const ids = litter.map((row) => row.id).join(',');
        const swept = await rest(`items?id=in.(${ids})`, { method: 'DELETE' });
        if (swept.ok) console.log(`[globalSetup] swept ${litter.length} leftover test item(s)`);
        else console.warn(`[globalSetup] sweep failed (${swept.status}): ${await swept.text()}`);
      }
    }

    // Goals, by the same read-then-delete-by-id rule and for the same reason:
    // an aborted spec's afterEach never runs, and a leftover goal is not merely
    // clutter — it renders in the console list, in the omnibar's capped goal
    // channel, and as a dynamic palette command, so it degrades the very
    // locators later specs depend on. `goal_items` needs no line; the composite
    // FKs cascade.
    const foundGoals = await rest(`goals?user_id=eq.${userId}&select=id,name`);
    if (!foundGoals.ok) {
      console.warn(`[globalSetup] goal sweep skipped (${foundGoals.status})`);
    } else {
      const litter = ((await foundGoals.json()) as { id: string; name: string | null }[]).filter(
        (row) => row.name?.startsWith(TEST_TITLE_PREFIX)
      );
      if (litter.length) {
        const ids = litter.map((row) => row.id).join(',');
        const swept = await rest(`goals?id=in.(${ids})`, { method: 'DELETE' });
        if (swept.ok) console.log(`[globalSetup] swept ${litter.length} leftover test goal(s)`);
        else console.warn(`[globalSetup] goal sweep failed (${swept.status})`);
      }
    }
  } else {
    console.warn(
      `[globalSetup] refusing to sweep items for ${env.email} — it does not look like a ` +
        'dedicated test account. Set E2E_ALLOW_DB_SWEEP=1 to override.'
    );
  }

  // 4. Author the storageState directly rather than driving a browser: the
  //    cookies come from the grant above and the localStorage seed is static, so
  //    launching Chromium just to call addCookies would add seconds for nothing.
  const storage = {
    cookies: sessionCookies(env.supabaseUrl, session),
    origins: [
      {
        // MUST match use.baseURL. A storageState origin that does not match is
        // not an error — the localStorage seed is simply never applied, so every
        // test starts on default view prefs instead of the seeded ones and the
        // failures read as view bugs.
        origin: BASE_URL,
        localStorage: [seededViewState()],
      },
    ],
  };

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(STORAGE_STATE, JSON.stringify(storage, null, 2));
  writeFileSync(
    SETUP_ARTIFACT,
    JSON.stringify({ userId, apiKey, email: env.email }, null, 2)
  );

  console.log(`[globalSetup] authenticated ${env.email} (${userId}); storageState written`);
}
