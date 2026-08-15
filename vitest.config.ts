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
     * Vitest's 5000ms default is a LOGIC-test default, and 13 of these files
     * mount real component trees in jsdom. Measured over the whole suite: the
     * slowest test is 678ms and nothing else clears 1000ms — the assertions are
     * cheap. What is not cheap is the environment, and it is charged to whichever
     * test renders first in a file: across three full runs, cumulative `import`
     * ranged 1236s-1519s and `transform` 85s-238s while `tests` held flat at
     * ~118s. Under that contention (four worktrees share this machine) the
     * suite's slowest test crossed 5000ms in two runs of three, from a true cost
     * of 678ms — a 7x swing that says nothing about the code under test.
     *
     * 15000 keeps a genuine hang failing while putting ~22x between the measured
     * cost and the budget. Raise the FLOOR rather than pinning one test: the
     * first-render cost lands wherever a file's first test happens to be, so a
     * per-test override just moves the flake to whichever test is reordered into
     * that slot.
     */
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
