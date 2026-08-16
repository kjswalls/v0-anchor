'use client';

import { create } from 'zustand';
import { fetchUserExtensions, setUserExtensionEnabled } from '@/lib/db';
import { resolveEnabled } from '@/lib/extension-registry';

/**
 * Per-user enabled state for official extensions — its own concern, one store
 * per concern. Not persist()ed: the server is truth (user_extensions rows),
 * defaults come from the manifest (lib/extension-registry.ts), and a stale
 * localStorage copy of a toggle is exactly the "write looked like it landed
 * and vanished on reload" bug the availability latch exists to prevent.
 *
 * Availability follows the itemTypesAvailable contract: fetchUserExtensions
 * returns null when the table is unreachable (migration 026 not applied), and
 * the null gates BOTH the settings toggles (via `available`) and setEnabled's
 * write path. Extensions themselves then sit at their manifest defaults —
 * quiet, never an error state to explain.
 *
 * Hydrated from supabase-provider beside hydrateSettings — deliberately NOT in
 * planner-store's initializeStore Promise.all, whose batch gates the overdue
 * sweep; extensions must never be able to fail the data load.
 */
interface ExtensionsStore {
  /** False once a fetch proved the user_extensions table isn't deployed. */
  available: boolean;
  /** Sparse: only slugs the user has actually toggled have entries. */
  enabled: Record<string, boolean>;
  hydratedUserId: string | null;

  hydrate: (userId: string) => Promise<void>;
  /** Manifest-default fallback included; safe for non-reactive reads. */
  isEnabled: (slug: string) => boolean;
  /** Optimistic; no-ops (with a warn) while the table is unavailable. */
  setEnabled: (userId: string, slug: string, enabled: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  available: true,
  enabled: {} as Record<string, boolean>,
  hydratedUserId: null as string | null,
};

export const useExtensionsStore = create<ExtensionsStore>((set, get) => ({
  ...INITIAL,

  hydrate: async (userId) => {
    // Duplicate-event guard (TOKEN_REFRESHED, repeated SIGNED_IN) — same shape
    // as hydrateSettings' hydratedUserId ref, so an auth refresh can't clobber
    // an in-session toggle with a stale server read.
    if (get().hydratedUserId === userId) return;
    // Clear synchronously on a BARE account switch (SIGNED_IN for a different
    // user with no SIGNED_OUT — the morning-store pattern): the previous
    // user's toggles must not answer isEnabled() during the fetch window. A
    // no-op on plain page load, where state is still initial.
    set({ hydratedUserId: userId, enabled: {}, available: true });

    let rows: Record<string, boolean> | null;
    try {
      rows = await fetchUserExtensions(userId);
    } catch (error) {
      // Transient failure (network, 5xx) — NOT the missing-table case, which
      // returns null. Un-stamp the guard so the next auth event retries, and
      // leave `available` alone: a blip must not read as a missing migration.
      console.warn('[extensions] hydrate failed, will retry on next auth event:', error);
      if (get().hydratedUserId === userId) set({ hydratedUserId: null });
      return;
    }

    // A slower response for a previous account must never land on the current
    // one (the hydrateSettings stale-drop rule).
    if (get().hydratedUserId !== userId) return;

    if (rows === null) {
      set({ available: false, enabled: {} });
    } else {
      // Merge UNDER any local entries: `enabled` was cleared above, so entries
      // present now are exactly the toggles made while the fetch was in flight
      // — their upserts are already on the wire and must win over this
      // pre-write server read.
      set((s) => ({ available: true, enabled: { ...rows, ...s.enabled } }));
    }
  },

  isEnabled: (slug) => resolveEnabled(get().enabled, slug),

  setEnabled: (userId, slug, enabled) => {
    if (!get().available) {
      console.warn('[extensions] setEnabled ignored — user_extensions table not deployed.');
      return;
    }
    set((s) => ({ enabled: { ...s.enabled, [slug]: enabled } }));
    setUserExtensionEnabled(userId, slug, enabled).catch(console.error);
  },

  reset: () => set({ ...INITIAL }),
}));
