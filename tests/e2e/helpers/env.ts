/**
 * One place for the E2E environment contract.
 *
 * Previously the app's timezone was hardcoded in five unlinked places (three in
 * helpers/dates.ts, twice in playwright.config.ts) and the required env vars
 * were validated inside loginTestUser — so a missing one surfaced per-test,
 * mid-run, instead of once at startup.
 */

/**
 * The timezone both the browser and the date helpers run in. Imported by
 * playwright.config.ts so the projects and the helpers cannot drift apart.
 */
export const TEST_TZ = 'America/Los_Angeles';

/**
 * Where the suite points, and the ONE place that decides it.
 *
 * Hardcoding :3000 in three files made the suite unrunnable from a worktree —
 * and unrunnable in a way that produced results rather than an error. This repo
 * is worked in several worktrees at once (see CLAUDE.md), each with its own
 * branch and its own `next dev`. Whichever one happens to be up owns :3000, and
 * `reuseExistingServer: !CI` means Playwright ADOPTS it: the run goes green or
 * red against a branch that is not the one under test, with nothing on screen
 * saying so. Overriding this is how a second checkout gets an honest run:
 *
 *     E2E_BASE_URL=http://localhost:3100 pnpm e2e
 *
 * playwright.config.ts derives both `use.baseURL` and `webServer.url` from this,
 * and passes the port to `next dev`, so the server started and the server tested
 * cannot drift apart.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** The port half of BASE_URL, for the dev-server command. */
export const E2E_PORT = new URL(BASE_URL).port || '3000';

/** Where globalSetup parks the authenticated session + resolved API key. */
export const STORAGE_STATE = 'tests/e2e/.auth/state.json';
export const SETUP_ARTIFACT = 'tests/e2e/.auth/setup.json';

/**
 * Titles created by the suite all carry this prefix, so the global sweep can
 * recognise its own litter without touching anything else.
 */
export const TEST_TITLE_PREFIX = 'e2e_';

export interface TestEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  email: string;
  password: string;
}

/**
 * Read and validate the whole env contract at once. Throws a single actionable
 * error naming every missing var rather than failing on the first one.
 */
export function testEnv(): TestEnv {
  const vars = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SECRET_KEY,
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  };

  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => NAMES[k as keyof typeof vars]);

  if (missing.length) {
    throw new Error(
      `Missing E2E env vars: ${missing.join(', ')}.\n` +
        'Copy .env.test.example to .env.test and fill it in — playwright.config.ts ' +
        'loads .env.test automatically. In CI these come from GitHub Actions secrets.'
    );
  }

  return vars as TestEnv;
}

const NAMES = {
  supabaseUrl: 'NEXT_PUBLIC_SUPABASE_URL',
  anonKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  serviceKey: 'SUPABASE_SECRET_KEY',
  email: 'TEST_USER_EMAIL',
  password: 'TEST_USER_PASSWORD',
} as const;
