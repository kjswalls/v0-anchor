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
