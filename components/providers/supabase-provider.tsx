'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { useReminderStore, REMINDER_DEFAULTS } from '@/lib/reminder-store';
import { loadSettings, saveSettings } from '@/lib/settings-service';
import { usePaletteStore } from '@/lib/palette-store';
import { PALETTE_STORAGE_KEY, isThemePalette, paletteDef } from '@/lib/theme-palettes';
import { useExtensionsStore } from '@/lib/extensions-store';
import { useChannelSecretsStore } from '@/lib/channel-secrets-store';
import { useGatewayStore } from '@/lib/gateway-store';
import { fetchContainersSeeded, fetchTrashedNames, markContainersSeeded } from '@/lib/db';
import { runFirstRunSeed } from '@/lib/seed-containers';
import { useTheme } from 'next-themes';
import type { TimeBucket } from '@/lib/planner-types';

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const initializeStore = usePlannerStore((s) => s.initializeStore);
  const clearStore = usePlannerStore((s) => s.clearStore);
  const { setTheme } = useTheme();
  const hydratedUserId = useRef<string | null>(null);
  /** Its sibling for the planner load itself — see loadPlanner. */
  const loadedUserId = useRef<string | null>(null);

  /**
   * setTheme, held at arm's length from the auth effect below.
   *
   * next-themes builds setTheme as `useCallback(…, [theme])`, so CHANGING THE
   * THEME MINTS A NEW FUNCTION IDENTITY. Naming it directly in the auth
   * effect's dep array therefore tore that effect down and re-ran it on every
   * theme flip: the subscription was recycled and `getSession()` resolved with
   * the same live session, so `initializeStore()` ran again — refetching six
   * tables, resetting `isLoading` to true, and wiping the undo history for a
   * colour change. On /settings the whole page dropped to its hydration-gate
   * placeholder while that ran, which is how this was finally spotted; it had
   * been happening silently since #81.
   *
   * A ref, not `useEffectEvent`/eslint-disable: the effect needs the LATEST
   * setTheme (hydration can arrive long after mount) but must never re-run
   * because of it, and that is precisely what a ref expresses.
   */
  const setThemeRef = useRef(setTheme);
  useEffect(() => {
    setThemeRef.current = setTheme;
  }, [setTheme]);

  // Apply animations setting to <html> element
  const animationsEnabled = usePlannerStore((s) => s.animationsEnabled);
  useEffect(() => {
    const html = document.documentElement;
    if (animationsEnabled) {
      html.removeAttribute('data-reduce-motion');
    } else {
      html.setAttribute('data-reduce-motion', 'true');
    }
  }, [animationsEnabled]);

  // The palette's single DOM writer (the data-reduce-motion pattern above):
  // stamp <html data-theme>, mirror the raw localStorage key the layout.tsx
  // pre-hydration script reads, and re-point the theme-color metas at the
  // palette's ground so PWA chrome follows the swap. Mutating the EXISTING
  // media-keyed metas (rather than appending one) keeps light/dark switching
  // with the OS the way the static viewport export always has.
  const palette = usePaletteStore((s) => s.palette);
  useEffect(() => {
    const html = document.documentElement;
    if (palette === 'default') {
      delete html.dataset.theme;
    } else {
      html.dataset.theme = palette;
    }
    try {
      if (palette === 'default') {
        window.localStorage.removeItem(PALETTE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
      }
    } catch {
      // Private mode — the stamp still applies for this session.
    }
    const colors = paletteDef(palette).themeColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const media = meta.getAttribute('media') ?? '';
      meta.setAttribute('content', media.includes('dark') ? colors.dark : colors.light);
    });
  }, [palette]);

  useEffect(() => {
    const supabase = createClient();

    const hydrateSettings = async (userId: string) => {
      // Skip if we've already hydrated for this user — prevents Supabase auth events
      // (TOKEN_REFRESHED, duplicate SIGNED_IN) from overwriting user's in-session theme changes
      if (hydratedUserId.current === userId) return;
      const previousUserId = hydratedUserId.current;
      hydratedUserId.current = userId;

      // Account switch with no intervening SIGNED_OUT (Supabase can deliver a
      // bare SIGNED_IN for a different user). Drop the previous account's
      // morning settings NOW, synchronously, so the window we are about to
      // spend awaiting is spent at fail-closed defaults instead of on someone
      // else's `morningAutoAgeEnabled: true` — the auto-age sweep is an
      // unattended data mutation and that window is long enough for the
      // planner load to finish inside it.
      //
      // Note this deliberately does NOT fire on a plain page load
      // (previousUserId === null): the persisted values there are the same
      // user's own, and wiping them would flash the morning banner before
      // settings land. The sweep is protected in that case by
      // `settingsHydratedUserId`, which is not persisted and so starts null.
      if (previousUserId !== null && previousUserId !== userId) {
        useMorningStore.getState().clearUserScopedState();
      }

      const settings = await loadSettings(userId);

      // A slower response for a PREVIOUS account must never land on the current
      // one. If a sign-in raced us, `hydratedUserId.current` has already moved
      // on, and everything below — theme, timezone, morning settings — belongs
      // to the wrong person, so it is dropped wholesale rather than partially
      // applied.
      if (hydratedUserId.current !== userId) return;

      usePlannerStore.setState({
        compactMode: settings.compact_mode ?? false,
        chillMode: settings.chill_mode ?? false,
        showCurrentTimeIndicator: settings.show_time_indicator ?? true,
        showCompletedTasks: settings.show_completed_tasks ?? true,
        animationsEnabled: settings.animations_enabled ?? true,
        weekStartDay: (settings.week_start_day as 'sunday' | 'monday' | 'saturday') ?? 'sunday',
        defaultView: (settings.default_view as 'day' | 'week') ?? 'day',
        defaultTimeBucket: (settings.default_time_bucket as TimeBucket) ?? 'anytime',
        timeFormat: (settings.time_format as '12h' | '24h') ?? '12h',
        viewMode: (settings.default_view as 'day' | 'week') ?? 'day',
        userTimezone: settings.timezone?.trim() || null,
      });

      useSidebarStore.setState({
        leftSidebarHoverEnabled: settings.left_sidebar_hover ?? false,
      });

      // Via the action, not setState: applyServerSettings stamps
      // `settingsHydratedUserId` in the same set(), which is the signal the
      // auto-age sweep gates on. A bare setState here would leave the sweep
      // unable to tell these values from the localStorage leftovers of whoever
      // used this browser last.
      useMorningStore.getState().applyServerSettings(userId, {
        morningCheckEnabled: settings.morning_check_enabled ?? true,
        morningCheckTime: settings.morning_check_time ?? '08:00',
        morningCheckDismissedDate: settings.morning_check_dismissed_date ?? null,
        morningAutoAgeEnabled: settings.morning_auto_age_enabled ?? false,
        morningAutoAgeDays: settings.morning_auto_age_days ?? 30,
        // The auto-age last-run stamp is deliberately local-only and per-user
        // (morningAutoAgeLastRunByUser) — not hydrated.
      });

      useEODStore.setState({
        eodReviewEnabled: settings.eod_review_enabled ?? false,
        eodReviewTime: settings.eod_review_time ?? '21:00',
      });

      // Reminder settings (migration 032). setState rather than an action, like
      // the EOD line above: the store holds no user-scoped derived state that a
      // stamp would have to guard, because it is not persisted — see its note.
      useReminderStore.setState({
        remindersEnabled: settings.habit_reminders_enabled ?? REMINDER_DEFAULTS.remindersEnabled,
        lastCallEnabled: settings.habit_last_call_enabled ?? REMINDER_DEFAULTS.lastCallEnabled,
        lastCallTime: settings.habit_last_call_time ?? REMINDER_DEFAULTS.lastCallTime,
        stakesEnabled: settings.stakes_enabled ?? REMINDER_DEFAULTS.stakesEnabled,
        stakesSettleTime: settings.stakes_settle_time ?? REMINDER_DEFAULTS.stakesSettleTime,
      });

      if (settings.theme) {
        setThemeRef.current(settings.theme);
      }

      // Palette hydration snaps (no eased wrapper) — same rule as the theme
      // line above: only user-initiated changes get the cross-fade. A null /
      // never-set column falls through and the device's localStorage choice
      // stands; an explicit 'default' in the column IS applied.
      //
      // ?reset-theme consumed here, one-shot: the layout script already
      // cleared localStorage before first paint, but the server row would
      // re-apply the broken palette right now — so the reset skips that apply
      // and persists 'default' (not null: null means "never chosen"), making
      // the escape hatch durable across reloads and devices.
      let paletteReset = false;
      try {
        paletteReset = sessionStorage.getItem('anchor-palette-reset') === '1';
        if (paletteReset) sessionStorage.removeItem('anchor-palette-reset');
      } catch {
        // Private mode — no flag to consume.
      }
      if (paletteReset) {
        saveSettings(userId, { theme_palette: 'default' });
      } else if (isThemePalette(settings.theme_palette)) {
        usePaletteStore.getState().setPalette(settings.theme_palette);
      }
    };

    /**
     * First-run container seeding (organize-console decision 2), run AFTER the
     * load has resolved and only when it resolved cleanly.
     *
     * The DECISION lives in lib/seed-containers.ts — the order of its steps is
     * the design, and an ordering that only exists inside a provider closure is
     * an ordering no test can reach. This is the trigger and the wiring.
     *
     * `snapshot` is a thunk rather than a value: three awaits happen inside, and
     * Supabase re-emits SIGNED_IN on every hidden→visible transition, so the
     * store has to be read at the moment it is used rather than closed over.
     *
     * Failures are swallowed to a console line by design. This is a nicety
     * running behind a load that already succeeded, and a toast about a starter
     * set nobody asked for would be the first thing a new account ever said to
     * its owner. Nothing is latched on failure, so the next load retries.
     */
    const seedIfFirstRun = (userId: string) =>
      runFirstRunSeed(userId, {
        hasSeeded: fetchContainersSeeded,
        markSeeded: markContainersSeeded,
        trashedNames: fetchTrashedNames,
        snapshot: () => usePlannerStore.getState(),
        commit: (plan, forUserId) =>
          usePlannerStore.getState().seedStarterContainers(plan, forUserId),
      }).catch((error) => console.error('first-run container seeding failed', error));

    /**
     * Load the planner ONCE per account, for the same reason hydrateSettings
     * above dedupes — and with more at stake.
     *
     * Supabase re-emits SIGNED_IN on every hidden→visible transition
     * (GoTrueClient's `_recoverAndRefresh` runs on a visibility change and
     * announces any session still inside its expiry margin), and broadcasts it
     * across tabs on top of that. So a plain tab switch used to re-enter
     * initializeStore, which opens by clearing `historyStack`, `actionLog` and
     * `historyIndex` and lands `canUndo: false`.
     *
     * The whole in-session undo stack, gone on a tab switch. That matters here
     * more than anywhere: ⌘Z is the entire safety net the Organize console's
     * delete confirms promise ("⌘Z brings it back now"), and Phase 4's Trash
     * leans on it again for restore. It also reopens the load window — the
     * refetch replaces `items`/`projects`/`routines` wholesale, so a rename
     * committed while it is in flight is silently reverted to pre-fetch data.
     *
     * Same escape hatch as hydrateSettings: a DIFFERENT user still loads, so an
     * account switch with no intervening SIGNED_OUT is not stranded on the
     * previous account's data.
     */
    const loadPlanner = (userId: string) => {
      if (loadedUserId.current === userId) return;
      loadedUserId.current = userId;
      // UNLATCHED ON FAILURE, and this half matters as much as the guard. A
      // failed load is a designed outcome, not a freak one: fetchRoutines
      // rethrows deliberately so a blip fails the WHOLE load rather than
      // arriving with an empty routines array (which would make every member of
      // a paused routine resolve as live and hand the auto-age sweep a pile of
      // suddenly-unprotected items). Before this guard existed, the next
      // SIGNED_IN retried; latching unconditionally turns one transient failure
      // into an app that never loads again until the user reloads by hand.
      //
      // READ OFF `error`, NOT off a rejection. The first version of this hung
      // the unlatch on `.catch()` and was dead code: initializeStore wraps its
      // whole body in try/catch and RESOLVES on failure, recording the message
      // in `error` instead of rethrowing. A safety net that cannot fire is
      // worse than none, because it reads as covered.
      //
      // The `userId` re-check is for a raced account switch: a slow failure for
      // the previous account must not unlatch the current one and trigger a
      // second load of someone else's data.
      initializeStore(userId).then(
        () => {
          const state = usePlannerStore.getState();
          if (state.error && state.userId === userId && loadedUserId.current === userId) {
            loadedUserId.current = null;
            return;
          }
          // Only on a load that WORKED. Seeding off a failed load would read
          // empty arrays that mean "the fetch broke", decide the account is
          // brand new, and write a starter set into an account that already has
          // containers it could not see.
          if (!state.error) void seedIfFirstRun(userId);
        },
        // Kept as belt and braces: if the store's catch is ever removed, this
        // is what stops the latch becoming permanent again.
        () => {
          if (loadedUserId.current === userId) loadedUserId.current = null;
        }
      );
    };

    // Check current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadPlanner(session.user.id);
        hydrateSettings(session.user.id);
        // Deliberately NOT part of planner-store's Promise.all: that batch
        // gates the overdue sweep, and extensions must never be able to fail
        // the data load.
        useExtensionsStore.getState().hydrate(session.user.id);
        // Which channel credentials are SET — never their values. Same
        // fire-and-forget posture: a settings page that cannot say "saved" is a
        // cosmetic loss; a planner that failed to load is not.
        useChannelSecretsStore.getState().hydrate(session.user.id);
        // Same posture again: which gateway is configured, never its token.
        useGatewayStore.getState().hydrate(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadPlanner(session.user.id);
        hydrateSettings(session.user.id);
        useExtensionsStore.getState().hydrate(session.user.id);
        useChannelSecretsStore.getState().hydrate(session.user.id);
        // Same posture again: which gateway is configured, never its token.
        useGatewayStore.getState().hydrate(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        hydratedUserId.current = null;
        loadedUserId.current = null;
        clearStore();
        useExtensionsStore.getState().reset();
        useChannelSecretsStore.getState().reset();
        useGatewayStore.getState().reset();
        // clearStore only resets the planner. The morning store holds
        // account-owned settings too — including the auto-age switch, which
        // drives an unattended mutation — and it persists them to a
        // browser-global localStorage key, so leaving them behind hands the
        // next person to sign in on this browser the previous person's decay
        // policy.
        useMorningStore.getState().clearUserScopedState();
      }
    });

    return () => subscription.unsubscribe();
    // setTheme is deliberately absent — see setThemeRef above. Both remaining
    // deps are zustand actions, created once by the store creator and stable
    // for its lifetime, so this effect now runs exactly once per mount.
  }, [initializeStore, clearStore]);

  return <>{children}</>;
}
