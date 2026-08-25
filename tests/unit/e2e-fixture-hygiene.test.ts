import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * A source check on the E2E specs, not a behavioural test.
 *
 * Every fixture title has to come from testTitle(), because that is the only
 * thing that stamps TEST_TITLE_PREFIX on it — and the prefix is what makes a
 * fixture SWEEPABLE. Per-test cleanup runs in a `finally`, which a timed-out or
 * crashed test never reaches, so the globalSetup prefix sweep is the actual
 * backstop. A title built by hand (`Daily task ${Date.now()}`) is invisible to
 * that sweep and therefore leaks permanently onto the shared test user.
 *
 * That is not hypothetical: seven spec files hand-rolled their titles and
 * accumulated 44 live orphans, which the braindump then rendered unvirtualized —
 * degrading every sidebar-scoped locator and every drag whose geometry depends
 * on the list's height. Nothing failed loudly; the suite just got slower and
 * flakier. Hence a check that fails loudly.
 *
 * Date.now() is the tell. It has no other legitimate use in a spec — waiting is
 * Playwright's job, via expect.poll or a web-first assertion, and a spec that
 * reaches for wall-clock time to build a deadline is its own smell. Helpers may
 * still use it (helpers/api.ts builds the suffix; helpers/dnd.ts polls a drag to
 * a deadline), so the check is scoped to *.spec.ts.
 */

const E2E_DIR = join(process.cwd(), 'tests', 'e2e');

const specFiles = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

describe('E2E fixture hygiene', () => {
  it('finds the spec files (guards against the glob silently matching nothing)', () => {
    expect(specFiles.length).toBeGreaterThan(10);
  });

  it.each(specFiles)('%s builds no titles of its own', (file) => {
    const source = readFileSync(join(E2E_DIR, file), 'utf8');
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes('Date.now()'));

    expect(
      offenders.map(([n, line]) => `${file}:${n}  ${line.trim()}`),
      'Use testTitle() from helpers/api — a hand-built title carries no ' +
        'TEST_TITLE_PREFIX, so the globalSetup sweep cannot reclaim it when a ' +
        'test dies before its cleanup runs.'
    ).toEqual([]);
  });
});
