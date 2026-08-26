import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

/**
 * Every path into "the current user changed", driven through the REAL provider.
 *
 * lib/local-state.ts names five, and the point of this file is that only ONE of
 * them is a sign-out. A fix wired to the sign-out button alone passes the first
 * test here and fails the rest:
 *
 *   1. explicit sign-out                     → SIGNED_OUT
 *   2. account switch, no intervening        → a bare SIGNED_IN for a
 *      sign-out                                 different user
 *   3. session expired while the tab was     → no event at all: a plain page
 *      closed, someone else signs in later      load that is already signed in
 *   4. plain page load on a shared browser   → the same, and equally silent
 *   5. another tab adopts a new user         → covered in local-state.test.ts,
 *                                               where the storage event lives
 *
 * 3 and 4 arrive as a mount with a live session and nothing in memory to
 * compare against, which is exactly what the persisted owner stamp is for. They
 * are asserted on `apiKey` and on the canvas filters because neither is ever
 * written by `hydrateSettings` — so a green assertion means the state was
 * CLEARED, and can't be a server response happening to land on top of it.
 *
 * The last two tests are not about paths at all: they pin the ORDER of
 * `adoptUser`, and the fact that a browser refusing to persist still boots.
 */

const SERVER = {
  theme: 'dark',
  time_format: '24h',
  left_sidebar_hover: false,
  morning_check_enabled: true,
  morning_check_time: '08:00',
  morning_check_dismissed_date: null,
  morning_auto_age_enabled: false,
  morning_auto_age_days: 30,
  eod_review_enabled: false,
  eod_review_time: '21:00',
};

vi.mock('@/lib/settings-service', () => ({
  loadSettings: vi.fn(async () => SERVER),
  saveSettings: vi.fn(),
  flushSettings: vi.fn(async () => {}),
}));

/** The session the provider finds on mount, and the auth events after it. */
let mountSession: { user: { id: string } } | null = null;
let emit: (event: string, session: { user: { id: string } } | null) => void = () => {};

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mountSession } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        emit = cb as typeof emit;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: vi.fn() }) }));

import { loadSettings } from '@/lib/settings-service';
import { SupabaseProvider } from '@/components/providers/supabase-provider';
import { LOCAL_STATE_OWNER_KEY, localStateOwner } from '@/lib/local-state';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { useChatStore } from '@/lib/chat-store';
import { useExtensionsStore } from '@/lib/extensions-store';
import { useChannelSecretsStore } from '@/lib/channel-secrets-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';

const USER_A = 'user-a';
const USER_B = 'user-b';
const SECRET = 'sk-ant-user-a-secret';

const original = {
  initializeStore: usePlannerStore.getState().initializeStore,
  extensions: useExtensionsStore.getState().hydrate,
  secrets: useChannelSecretsStore.getState().hydrate,
};

/** User A's browser, mid-session: a key, a transcript, filters, a stamp. */
function seedUserAState(owner: string | null) {
  useAISettingsStore.setState({ apiKey: SECRET });
  useViewStore.setState({
    canvasFilters: { ...useViewStore.getState().canvasFilters, containers: ['project:A Private'] },
  });
  localStorage.setItem(
    'anchor-chat-history',
    JSON.stringify({
      messages: [{ role: 'user', content: 'A private question' }],
      savedAt: Date.now(),
    })
  );
  if (owner) localStorage.setItem(LOCAL_STATE_OWNER_KEY, owner);
  else localStorage.removeItem(LOCAL_STATE_OWNER_KEY);
}

function expectUserAStateGone() {
  expect(useAISettingsStore.getState().apiKey).toBe('');
  expect(useViewStore.getState().canvasFilters.containers).toEqual([]);
  expect(localStorage.getItem('anchor-chat-history')).toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain(SECRET);
  expect(JSON.stringify(localStorage)).not.toContain('A Private');
}

async function mount() {
  render(
    <SupabaseProvider>
      <div />
    </SupabaseProvider>
  );
  // Wait on hydrateSettings reaching its one await, NOT on the stamp: the
  // provider does this whether or not the clear works, so a broken fix fails
  // these tests on the assertion rather than timing out on the wait.
  await waitFor(() => expect(vi.mocked(loadSettings)).toHaveBeenCalled());
}

describe('every path into "the current user changed"', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(loadSettings).mockClear();
    vi.mocked(loadSettings).mockImplementation(async () => SERVER);
    mountSession = null;
    usePlannerStore.setState({ initializeStore: async () => {} });
    useExtensionsStore.setState({ hydrate: async () => {} });
    useChannelSecretsStore.setState({ hydrate: async () => {} });
    useAISettingsStore.getState().clearUserScopedState();
    useViewStore.getState().clearUserScopedState('all');
    useChatStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
    usePlannerStore.setState({ initializeStore: original.initializeStore });
    useExtensionsStore.setState({ hydrate: original.extensions });
    useChannelSecretsStore.setState({ hydrate: original.secrets });
  });

  it('1 — an explicit sign-out drops the account state and releases the stamp', async () => {
    mountSession = { user: { id: USER_A } };
    await mount();
    seedUserAState(USER_A);

    emit('SIGNED_OUT', null);

    expectUserAStateGone();
    expect(localStateOwner()).toBeNull();
  });

  it('2 — a bare SIGNED_IN for a different user, with no sign-out first', async () => {
    mountSession = { user: { id: USER_A } };
    await mount();
    seedUserAState(USER_A);

    emit('SIGNED_IN', { user: { id: USER_B } });

    expectUserAStateGone();
    expect(localStateOwner()).toBe(USER_B);
  });

  it('3 — a plain page load already signed in as someone else', async () => {
    // No event will ever fire for this. The session expired while the tab was
    // shut, B signed in, and the app comes up with A's blobs still on disk.
    seedUserAState(USER_A);
    mountSession = { user: { id: USER_B } };

    await mount();

    expectUserAStateGone();
    expect(localStateOwner()).toBe(USER_B);
  });

  it('4 — a plain page load on a browser nothing has ever stamped', async () => {
    seedUserAState(null);
    mountSession = { user: { id: USER_B } };

    await mount();

    // Unstamped means the scope narrows to the disclosive — but the credential,
    // the filters and the transcript are all on that side of the line.
    expectUserAStateGone();
    expect(localStateOwner()).toBe(USER_B);
  });

  it('leaves the owner’s own state alone across a reload and a repeated SIGNED_IN', async () => {
    seedUserAState(USER_A);
    mountSession = { user: { id: USER_A } };

    await mount();
    // Supabase re-emits SIGNED_IN on every hidden→visible transition and
    // broadcasts it across tabs. Neither may cost the user their own settings.
    emit('SIGNED_IN', { user: { id: USER_A } });

    expect(useAISettingsStore.getState().apiKey).toBe(SECRET);
    expect(useViewStore.getState().canvasFilters.containers).toEqual(['project:A Private']);
    expect(localStorage.getItem('anchor-chat-history')).not.toBeNull();
    expect(localStateOwner()).toBe(USER_A);
  });

  /**
   * `adoptLocalState` is the FIRST line of `adoptUser`, and nothing in the
   * current arrangement makes that visible after the fact: hydrateSettings puts
   * its `loadSettings` await before it applies anything, so moving the adopt to
   * the end of `adoptUser` still lands it before the values arrive, and every
   * outcome assertion above stays green.
   *
   * So this observes the loads AT THE MOMENT THEY ARE ENTERED. Both are called
   * synchronously from `adoptUser`, so if the adopt is reordered after either
   * of them, that one sees the previous account's key still in memory and the
   * stamp still naming the previous account.
   */
  it('adopts before it loads anything — the one ordering adoptUser depends on', async () => {
    seedUserAState(USER_A);
    mountSession = { user: { id: USER_B } };

    const seen: Record<string, { owner: string | null; apiKey: string }> = {};
    const probe = (name: string) => {
      seen[name] = {
        owner: localStateOwner(),
        apiKey: useAISettingsStore.getState().apiKey,
      };
    };
    usePlannerStore.setState({
      initializeStore: async () => {
        probe('initializeStore');
      },
    });
    vi.mocked(loadSettings).mockImplementation(async () => {
      probe('loadSettings');
      return SERVER;
    });

    await mount();

    // Both loads found this browser already adopted for B and already emptied
    // of A. Move `adoptLocalState(userId)` below either call in adoptUser and
    // that call's probe reads USER_A / the secret instead.
    expect(seen.initializeStore).toEqual({ owner: USER_B, apiKey: '' });
    expect(seen.loadSettings).toEqual({ owner: USER_B, apiKey: '' });
  });

  /**
   * The clear runs first inside `adoptUser`, and a clear is a zustand `set()`,
   * and zustand's persist middleware calls `storage.setItem` UNWRAPPED. So on a
   * browser at its quota or with site data blocked, an unguarded clear throws
   * out of `adoptUser` and NOTHING after it runs — no planner load, no
   * settings, no extensions. Before this change such a browser merely failed to
   * persist; the regression would be a blank shell.
   *
   * `loadSettings` is left PENDING here on purpose. What is under test is
   * `adoptUser`'s synchronous fan-out, and letting it resolve would run
   * hydrateSettings' own post-await `usePlannerStore.setState`, which is
   * unguarded against a throwing storage on main exactly as it is here — a
   * pre-existing hazard, out of this change's scope, and not something this
   * test should be reporting as its own.
   */
  it('still boots every load on a browser that refuses to persist', async () => {
    seedUserAState(USER_A);
    mountSession = { user: { id: USER_B } };
    vi.mocked(loadSettings).mockImplementation(() => new Promise(() => {}));

    const calls: string[] = [];
    usePlannerStore.setState({
      initializeStore: async () => {
        calls.push('planner');
      },
    });
    useExtensionsStore.setState({
      hydrate: async () => {
        calls.push('extensions');
      },
    });
    useChannelSecretsStore.setState({
      hydrate: async () => {
        calls.push('secrets');
      },
    });

    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    try {
      await mount();
    } finally {
      Storage.prototype.setItem = setItem;
    }

    expect(calls.sort()).toEqual(['extensions', 'planner', 'secrets']);
    expect(vi.mocked(loadSettings)).toHaveBeenCalledWith(USER_B);
    // And the part of the clear that does not need storage still happened.
    expect(useAISettingsStore.getState().apiKey).toBe('');
  });
});
