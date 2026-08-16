import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store's db layer is fully mocked (the undo-redo-store.test.ts pattern):
// these tests drive the real zustand store and assert both the state
// transitions and the writes it emits — including the availability latch that
// must gate writes when migration 026 hasn't landed.
vi.mock('@/lib/db', () => ({
  fetchUserExtensions: vi.fn(async () => ({})),
  setUserExtensionEnabled: vi.fn(async () => {}),
}));

import { fetchUserExtensions, setUserExtensionEnabled } from '@/lib/db';
import { useExtensionsStore } from '@/lib/extensions-store';
import {
  EXT_COMPLETION_CONFETTI,
  EXT_HABIT_HEATMAP,
  OFFICIAL_EXTENSIONS,
  resolveEnabled,
} from '@/lib/extension-registry';

const mockFetch = vi.mocked(fetchUserExtensions);
const mockSet = vi.mocked(setUserExtensionEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  useExtensionsStore.getState().reset();
});

describe('extension registry', () => {
  it('slugs are unique and slug-shaped', () => {
    const slugs = OFFICIAL_EXTENSIONS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });

  it('resolveEnabled falls back to the manifest default for untouched slugs', () => {
    expect(resolveEnabled({}, EXT_HABIT_HEATMAP)).toBe(false);
    expect(resolveEnabled({ [EXT_HABIT_HEATMAP]: true }, EXT_HABIT_HEATMAP)).toBe(true);
    expect(resolveEnabled({}, 'not-a-real-extension')).toBe(false);
  });
});

describe('extensions store', () => {
  it('hydrates rows and reports availability', async () => {
    mockFetch.mockResolvedValueOnce({ [EXT_HABIT_HEATMAP]: true });
    await useExtensionsStore.getState().hydrate('user-1');

    const s = useExtensionsStore.getState();
    expect(s.available).toBe(true);
    expect(s.isEnabled(EXT_HABIT_HEATMAP)).toBe(true);
    // Untouched slug falls back to its manifest default.
    expect(s.isEnabled(EXT_COMPLETION_CONFETTI)).toBe(false);
  });

  it('latches unavailable on null (table not deployed) and gates writes', async () => {
    mockFetch.mockResolvedValueOnce(null);
    await useExtensionsStore.getState().hydrate('user-1');

    expect(useExtensionsStore.getState().available).toBe(false);

    useExtensionsStore.getState().setEnabled('user-1', EXT_HABIT_HEATMAP, true);
    // The write is refused entirely — an optimistic flip that vanishes on
    // reload is the bug the latch exists to prevent.
    expect(mockSet).not.toHaveBeenCalled();
    expect(useExtensionsStore.getState().isEnabled(EXT_HABIT_HEATMAP)).toBe(false);
  });

  it('setEnabled is optimistic and writes through', async () => {
    mockFetch.mockResolvedValueOnce({});
    await useExtensionsStore.getState().hydrate('user-1');

    useExtensionsStore.getState().setEnabled('user-1', EXT_COMPLETION_CONFETTI, true);
    expect(useExtensionsStore.getState().isEnabled(EXT_COMPLETION_CONFETTI)).toBe(true);
    expect(mockSet).toHaveBeenCalledWith('user-1', EXT_COMPLETION_CONFETTI, true);
  });

  it('ignores duplicate hydrates for the same user (TOKEN_REFRESHED guard)', async () => {
    mockFetch.mockResolvedValue({});
    await useExtensionsStore.getState().hydrate('user-1');
    await useExtensionsStore.getState().hydrate('user-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('a transient fetch failure stays retryable and never claims a missing migration', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await useExtensionsStore.getState().hydrate('user-1');

    const s = useExtensionsStore.getState();
    // A blip must not latch the "needs a database update" state…
    expect(s.available).toBe(true);
    // …and must un-stamp the guard so the next auth event retries.
    expect(s.hydratedUserId).toBeNull();

    mockFetch.mockResolvedValueOnce({ [EXT_HABIT_HEATMAP]: true });
    await useExtensionsStore.getState().hydrate('user-1');
    expect(useExtensionsStore.getState().isEnabled(EXT_HABIT_HEATMAP)).toBe(true);
  });

  it('a toggle made while the first hydrate is in flight survives it', async () => {
    let release!: (v: Record<string, boolean> | null) => void;
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; })
    );
    const pending = useExtensionsStore.getState().hydrate('user-1');

    // User flips a switch before the fetch resolves; the optimistic entry and
    // its upsert are already on the wire.
    useExtensionsStore.getState().setEnabled('user-1', EXT_COMPLETION_CONFETTI, true);

    // The fetch read the table BEFORE that upsert — its rows are stale for
    // this slug and must merge UNDER the local toggle, not replace it.
    release({ [EXT_HABIT_HEATMAP]: true });
    await pending;

    const s = useExtensionsStore.getState();
    expect(s.isEnabled(EXT_COMPLETION_CONFETTI)).toBe(true);
    expect(s.isEnabled(EXT_HABIT_HEATMAP)).toBe(true);
  });

  it('a bare account switch clears the previous user state synchronously', async () => {
    mockFetch.mockResolvedValueOnce({ [EXT_HABIT_HEATMAP]: true });
    await useExtensionsStore.getState().hydrate('user-1');

    // SIGNED_IN for a different user with no SIGNED_OUT in between: before
    // user-2's fetch resolves, user-1's toggles must already be gone.
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));
    void useExtensionsStore.getState().hydrate('user-2');
    expect(useExtensionsStore.getState().isEnabled(EXT_HABIT_HEATMAP)).toBe(false);
  });

  it('drops a stale response that resolves after an account switch', async () => {
    let releaseFirst!: (v: Record<string, boolean> | null) => void;
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = resolve; })
    );
    const first = useExtensionsStore.getState().hydrate('user-1');

    mockFetch.mockResolvedValueOnce({ [EXT_HABIT_HEATMAP]: true });
    await useExtensionsStore.getState().hydrate('user-2');

    // user-1's slow response lands after user-2 hydrated — it must be dropped
    // wholesale, not partially applied.
    releaseFirst({ [EXT_COMPLETION_CONFETTI]: true });
    await first;

    const s = useExtensionsStore.getState();
    expect(s.isEnabled(EXT_HABIT_HEATMAP)).toBe(true);
    expect(s.isEnabled(EXT_COMPLETION_CONFETTI)).toBe(false);
  });

  it('reset returns to defaults for the next account', async () => {
    mockFetch.mockResolvedValueOnce({ [EXT_HABIT_HEATMAP]: true });
    await useExtensionsStore.getState().hydrate('user-1');
    useExtensionsStore.getState().reset();

    const s = useExtensionsStore.getState();
    expect(s.available).toBe(true);
    expect(s.isEnabled(EXT_HABIT_HEATMAP)).toBe(false);
    expect(s.hydratedUserId).toBeNull();
  });
});
