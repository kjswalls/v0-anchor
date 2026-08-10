import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The gate that decides whether the onboarding tour opens over the app.
 *
 * It is a one-line read, but it is a one-line read with a `fixed inset-0`
 * backdrop behind it: get it wrong and the user does not see a subtly wrong
 * value, they lose the whole surface until they dismiss a welcome screen they
 * have seen before. So the three outcomes are pinned separately — the point is
 * precisely that "could not read" and "has not onboarded" are DIFFERENT
 * answers, and the original swallowed the distinction.
 */

// What the mocked query resolves to. Set per test.
let result: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  }),
}));

import { isOnboardingComplete } from '@/lib/user-profile';

describe('isOnboardingComplete', () => {
  beforeEach(() => {
    result = { data: null, error: null };
  });

  it('is true when the row says so', async () => {
    result = { data: { onboarding_completed: true }, error: null };
    expect(await isOnboardingComplete('u1')).toBe(true);
  });

  it('is false when the row says so — the tour still reaches a returning user who skipped it', async () => {
    result = { data: { onboarding_completed: false }, error: null };
    expect(await isOnboardingComplete('u1')).toBe(false);
  });

  it('is false when there is no row at all — a genuinely new user', async () => {
    // maybeSingle reports this as data:null WITHOUT an error, which is the only
    // reason the case below can be told apart from it. Under .single() zero rows
    // raise PGRST116 and the two collapse into one indistinguishable null.
    result = { data: null, error: null };
    expect(await isOnboardingComplete('u1')).toBe(false);
  });

  it('is true when the read FAILS — a transient error must not summon the tour', async () => {
    // The regression this exists for: a rate-limited project or a token
    // refreshing mid-flight returned null, null became `false`, and an
    // established user got the welcome tour thrown over their day. Fourteen
    // parallel browser contexts in the E2E suite hit exactly this, and every
    // locator underneath the backdrop then timed out.
    result = { data: null, error: { message: 'Too Many Requests', code: '429' } };
    expect(await isOnboardingComplete('u1')).toBe(true);
  });
});
