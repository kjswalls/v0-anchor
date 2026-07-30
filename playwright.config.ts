import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load .env.test BEFORE importing anything that reads the env contract, so
// `pnpm e2e` works with no wrapper command. `override: false` means real
// environment variables always win, so CI — which injects the same keys as
// job-level `env:` from GitHub secrets — is unaffected.
dotenv.config({ path: '.env.test', override: false, quiet: true });

// eslint-disable-next-line import/first -- must follow dotenv.config()
import { TEST_TZ, STORAGE_STATE } from './tests/e2e/helpers/env';

export default defineConfig({
  testDir: './tests/e2e',

  // Authenticate once for the whole run and seed the shared test user's
  // settings. Without this every test did its own Supabase password grant and a
  // full run tripped the auth rate limit. See tests/e2e/global-setup.ts.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The github reporter is inert outside Actions, and `html` alone auto-opens a
  // blocking server on failure while printing nothing — so a local run needs `list`.
  reporter: process.env.CI ? [['html'], ['github']] : [['list'], ['html', { open: 'never' }]],

  // The default 30s is measured against a `next dev` server that compiles routes
  // on first hit, so the first test to reach a route pays the compile out of its
  // own budget. Give tests room, but keep individual assertions snappy so a dead
  // selector fails in 10s instead of stalling the whole test.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    // retries is 0 locally, so `on-first-retry` would never capture a local
    // trace — precisely the runs where selector drift needs diagnosing.
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    // The session + seeded view prefs written by globalSetup. Every test starts
    // signed in, in Day × Buckets.
    storageState: STORAGE_STATE,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Match the app's timezone so date helpers and the browser agree on
        // "today". Imported, not re-typed: this string used to appear in five
        // unlinked places.
        timezoneId: TEST_TZ,
      },
      // Mobile-tagged tests run in the mobile project below (touch + phone metrics).
      grepInvert: /@mobile/,
    },
    {
      // iPhone-14 metrics + touch, kept on Chromium so CI needs no WebKit install.
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        timezoneId: TEST_TZ,
      },
      grep: /@mobile/,
    },
  ],

  webServer: {
    // In CI, test against a PRODUCTION build (next build && next start) instead
    // of the dev server. `next dev` compiles routes on-demand at first hit, so
    // under a test run the first request to each route can take many seconds —
    // the source of the 30s timeouts / "WebServer aborted" flakiness. A prod
    // build is fully precompiled, so responses are fast and stable (and it's
    // what real users hit). Locally, keep the dev server for fast iteration.
    // pnpm, not npm: this is a pnpm workspace and `@anchor-app/types` is a
    // `workspace:*` dependency that npm cannot resolve.
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: (process.env.CI ? 300 : 120) * 1000,
    // Env vars (NEXT_PUBLIC_SUPABASE_URL, TEST_USER_EMAIL, etc.) come from
    // .env.test, loaded by the dotenv.config() call at the top of this file.
    // In CI they are injected as job-level env from GitHub Actions secrets.
  },
});
