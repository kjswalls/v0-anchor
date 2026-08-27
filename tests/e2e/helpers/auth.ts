import type { Page } from '@playwright/test';
import { gotoApp } from './app';
import { testEnv } from './env';
import { passwordGrant, sessionCookies, seededLocalStorage } from './session';

/**
 * Bring up the app already signed in.
 *
 * The session normally arrives from `storageState`, written once by
 * tests/e2e/global-setup.ts — so for almost every spec this is just "navigate and
 * wait until ready", with no auth work at all. That is the point: this helper used
 * to perform a full Supabase password grant in every `beforeEach`, which at ~49
 * tests (×3 under CI retries) blew through Supabase's default limit of 30 token
 * requests per 5 minutes per IP and failed the back half of every full run in
 * auth rather than on merit.
 *
 * Kept as the specs' entry point rather than deleted, so a spec that genuinely
 * needs a fresh session can ask for one (`{ freshSession: true }`) and so there is
 * one obvious place to add per-test setup.
 */
export async function loginTestUser(
  page: Page,
  options: { freshSession?: boolean } = {}
): Promise<void> {
  if (options.freshSession) await injectFreshSession(page);
  await gotoApp(page);
}

/**
 * Mint a session in Node and inject it into this context, replacing whatever
 * storageState provided.
 *
 * Only for specs that must not share the run-wide session (a token-expiry or
 * sign-out flow). Every call is one more request against the auth rate limit.
 */
export async function injectFreshSession(page: Page): Promise<void> {
  const env = testEnv();
  const session = await passwordGrant(env.supabaseUrl, env.anonKey, env.email, env.password);

  const context = page.context();
  await context.clearCookies();
  await context.addCookies(sessionCookies(env.supabaseUrl, session));

  // Re-seed what storageState would have carried, so a fresh-session spec still
  // starts in Day × Buckets — AND still looks like a browser this account has
  // used before. Without the ownership stamp in that list, lib/local-state.ts
  // reads the freshly-injected browser as unattributed and clears the prefs
  // this very block just wrote.
  const userId = session.user?.id;
  if (!userId) throw new Error('password grant returned a session with no user id');
  await page.addInitScript(
    (entries: Array<{ name: string; value: string }>) => {
      for (const entry of entries) window.localStorage.setItem(entry.name, entry.value);
    },
    seededLocalStorage(userId)
  );
}
