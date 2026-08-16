import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    globals: true,
    /**
     * Raised from vitest's 5s default, because the suite outgrew it.
     *
     * The heavy cases here stand up whole React trees in jsdom — the Organize
     * console, the EOD review, a portalled dialog — and several of them sit
     * within a second or two of the 5s line when run alone. At full parallelism
     * they cross it: full-suite runs went red intermittently in
     * `confirm-focus-return` and `eod-dismiss`, always by TIMEOUT and never by
     * assertion, and never reproducibly in isolation.
     *
     * The failures are indistinguishable from real ones at a glance, so they
     * teach everyone to re-run a red suite instead of reading it — which is the
     * expensive part, not the minutes. 30s costs nothing on a green run (the
     * budget is per test, not a delay) and only bites when something genuinely
     * hangs, which is the case a timeout should be reserved for.
     */
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
