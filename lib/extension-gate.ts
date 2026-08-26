'use client';

import { useExtensionsStore } from './extensions-store';
import { resolveEnabled } from './extension-registry';

/**
 * extension-gate.ts — the one place client code asks "is this extension on?".
 *
 * Every surface an extension reaches has to ask the same question, and before
 * this module they each asked it their own way: a component subscribed with
 * `useExtensionsStore((s) => resolveEnabled(s.enabled, SLUG))`, while a plain
 * module (a command's `run`, a ui-store action) had no hook to call at all and
 * would have had to reach for `getState()` and remember `resolveEnabled`. Two
 * spellings of one predicate is how a feature ends up half-off — the palette
 * row gone, the keyboard binding still firing.
 *
 * Both readers below resolve through `resolveEnabled`, which is the load-
 * bearing half: the store is SPARSE (only slugs the user has actually toggled
 * have rows), so a bare `enabled[slug]` is `undefined` for every untouched
 * extension and would read every default-ON feature as off.
 *
 * ── What "off" means here ──────────────────────────────────────────────────
 *
 * Off means INERT, not hidden. Anchor's extensions are a store, not a
 * feature-flag list: a switched-off extension keeps its catalogue row in
 * /settings/extensions, keeps its own settings pane, and stays findable by
 * settings search. What stops is its BEHAVIOUR — the cron work, the reminder,
 * the grid decoration, the paste it intercepts, the keystroke it claims.
 *
 * So this predicate belongs at the behaviour, never at the catalogue. Nothing
 * in lib/settings/manifest.ts's pane derivation or in the extension index may
 * call it to decide whether to render; they call it (via `unavailable`) only to
 * decide what a row SAYS.
 *
 * ── The hydration window ───────────────────────────────────────────────────
 *
 * The store hydrates asynchronously, and until it resolves every slug reads at
 * its manifest default. That is deliberate and it fails in the right direction
 * per tier: a default-OFF integration that could ring a phone stays silent
 * until the server says otherwise, and a default-ON part of the app keeps
 * working during the load rather than blinking out of existence on every cold
 * start. A row that must not render a DEFAULT while claiming to render the
 * user's choice is a different question — that one is `pending` in the settings
 * manifest, and it is asked about controls, not about behaviour.
 */

/**
 * Reactive read — components re-render when the switch flips.
 *
 * Subscribes to the whole `enabled` map rather than to one slug's value
 * because the map is replaced wholesale on every hydrate and toggle; the extra
 * comparison is one object identity check per store write.
 */
export function useExtensionOn(slug: string): boolean {
  return useExtensionsStore((s) => resolveEnabled(s.enabled, slug));
}

/**
 * Non-reactive read, for the modules that have no React in scope: a command's
 * `run`/`hidden`/`availableWhen`, a ui-store action, an effect body that has
 * already awaited something and wants the answer as of NOW rather than as of
 * its last render.
 */
export function extensionOn(slug: string): boolean {
  return resolveEnabled(useExtensionsStore.getState().enabled, slug);
}
