import { useExtensionsStore } from '@/lib/extensions-store';
import { EXT_GOALS, EXT_ORGANIZE } from '@/lib/extension-registry';

/**
 * Switch extensions on for a test that is about the FEATURE, not about the gate.
 *
 * Goals and the Organize console ship OFF (lib/extension-registry.ts), so every
 * suite that drives one has to say so out loud. Deliberately NOT done in
 * tests/unit/setup.ts: a global default-on would make the whole suite pass
 * whatever the gates did, which is exactly the regression the gates exist to
 * catch. One line per suite, at the top of its beforeEach, is the price of a
 * default that the tests can actually prove.
 *
 * Writes only `enabled` — `available` and `configsLoaded` are the store's own
 * concerns and no gate reads them.
 */
export function enableExtensions(...slugs: string[]): void {
  useExtensionsStore.setState((s) => ({
    enabled: { ...s.enabled, ...Object.fromEntries(slugs.map((slug) => [slug, true])) },
  }));
}

/** Explicitly off, for the tests that prove a surface goes inert. */
export function disableExtensions(...slugs: string[]): void {
  useExtensionsStore.setState((s) => ({
    enabled: { ...s.enabled, ...Object.fromEntries(slugs.map((slug) => [slug, false])) },
  }));
}

/** The two this repo gates today, for suites that just want the app whole. */
export function enableGoalsAndOrganize(): void {
  enableExtensions(EXT_GOALS, EXT_ORGANIZE);
}
