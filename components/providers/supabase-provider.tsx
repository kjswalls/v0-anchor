'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { loadSettings } from '@/lib/settings-service';
import { useTheme } from 'next-themes';
import type { TimeBucket } from '@/lib/planner-types';

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const initializeStore = usePlannerStore((s) => s.initializeStore);
  const clearStore = usePlannerStore((s) => s.clearStore);
  const { setTheme } = useTheme();
  const hydratedUserId = useRef<string | null>(null);

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

      if (settings.theme) {
        setTheme(settings.theme);
      }
    };

    // Check current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        initializeStore(session.user.id);
        hydrateSettings(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        initializeStore(session.user.id);
        hydrateSettings(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        hydratedUserId.current = null;
        clearStore();
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
  }, [initializeStore, clearStore, setTheme]);

  return <>{children}</>;
}
