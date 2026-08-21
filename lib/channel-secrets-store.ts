'use client';

import { create } from 'zustand';

/**
 * Which channel credentials are SET — never what they are.
 *
 * The store deliberately cannot hold a secret value. user_secrets is
 * service-role only (migration 012's posture, extended by 030), and
 * /api/reminders/secrets is one-way by design: it answers "which keys exist"
 * and nothing more. Not even a masked value comes back, because a mask still
 * leaks length and last-four and no screen here needs either.
 *
 * So the settings input for a credential is genuinely write-only: it renders
 * empty whatever the stored state, its placeholder says whether something is
 * saved, and typing replaces. That reads as a slightly unusual field, and it is
 * the honest rendering of what the server will tell us.
 *
 * Not persisted, for the extensions-store reason and one more: a cached "the
 * token is set" that outlives the token is worse than asking again.
 */
interface ChannelSecretsStore {
  /** Sparse: channel slug → the credential keys that have a value stored. */
  setKeys: Record<string, string[]>;
  /** False once a fetch proved migration 030 has not landed here. */
  available: boolean;
  hydratedUserId: string | null;

  hydrate: (userId: string) => Promise<void>;
  isSet: (slug: string, key: string) => boolean;
  /** '' or null clears the credential. Optimistic; reconciles on failure. */
  setSecret: (slug: string, key: string, value: string | null) => void;
  reset: () => void;
}

const INITIAL = {
  setKeys: {} as Record<string, string[]>,
  available: true,
  hydratedUserId: null as string | null,
};

export const useChannelSecretsStore = create<ChannelSecretsStore>((set, get) => ({
  ...INITIAL,

  hydrate: async (userId) => {
    // Duplicate-event guard + bare-account-switch clear, the extensions-store
    // contract. A previous account's "token is set" must never answer for this
    // one during the fetch window.
    if (get().hydratedUserId === userId) return;
    set({ hydratedUserId: userId, setKeys: {}, available: true });

    try {
      const res = await fetch('/api/reminders/secrets');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        secrets?: Record<string, string[]>;
        unavailable?: boolean;
      };
      if (get().hydratedUserId !== userId) return;
      if (body.unavailable) {
        set({ available: false, setKeys: {} });
        return;
      }
      set((s) => ({ available: true, setKeys: { ...(body.secrets ?? {}), ...s.setKeys } }));
    } catch (error) {
      // Un-stamp so the next auth event retries, and leave `available` alone —
      // a network blip must not read as a missing migration.
      console.warn('[channel-secrets] hydrate failed, will retry:', error);
      if (get().hydratedUserId === userId) set({ hydratedUserId: null });
    }
  },

  isSet: (slug, key) => (get().setKeys[slug] ?? []).includes(key),

  setSecret: (slug, key, value) => {
    const clearing = value === null || value === '';
    const current = get().setKeys[slug] ?? [];
    const optimistic = clearing
      ? current.filter((k) => k !== key)
      : current.includes(key)
        ? current
        : [...current, key];
    set((s) => ({ setKeys: { ...s.setKeys, [slug]: optimistic } }));

    void fetch('/api/reminders/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: slug, values: { [key]: clearing ? null : value } }),
    })
      .then(async (res) => {
        if (res.ok) {
          // Reconcile against what the server actually holds. The optimistic
          // guess is only ever wrong when a write is rejected, but a stale "set"
          // on a credential is precisely the state that makes a silent delivery
          // failure impossible to diagnose.
          const body = (await res.json()) as { set?: string[] };
          if (body.set) set((s) => ({ setKeys: { ...s.setKeys, [slug]: body.set as string[] } }));
          return;
        }
        set((s) => ({ setKeys: { ...s.setKeys, [slug]: current } }));
        console.error('[channel-secrets] write rejected:', res.status);
      })
      .catch((error) => {
        set((s) => ({ setKeys: { ...s.setKeys, [slug]: current } }));
        console.error('[channel-secrets] write failed:', error);
      });
  },

  reset: () => set({ ...INITIAL }),
}));
