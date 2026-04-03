'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { usePlannerStore } from '@/lib/planner-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { loadSettings } from '@/lib/settings-service';
import { useTheme } from 'next-themes';

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
      hydratedUserId.current = userId;

      const settings = await loadSettings(userId);

      usePlannerStore.setState({
        compactMode: settings.compact_mode ?? false,
        chillMode: settings.chill_mode ?? false,
        showCurrentTimeIndicator: settings.show_time_indicator ?? true,
        showCompletedTasks: settings.show_completed_tasks ?? true,
        animationsEnabled: settings.animations_enabled ?? true,
        weekStartDay: (settings.week_start_day as 'sunday' | 'monday' | 'saturday') ?? 'sunday',
        defaultView: (settings.default_view as 'day' | 'week') ?? 'day',
        defaultTimeBucket: (settings.default_time_bucket as any) ?? 'anytime',
        timeFormat: (settings.time_format as '12h' | '24h') ?? '12h',
        viewMode: (settings.default_view as 'day' | 'week') ?? 'day',
        userTimezone: settings.timezone?.trim() || null,
      });

      useSidebarStore.setState({
        leftSidebarHoverEnabled: settings.left_sidebar_hover ?? false,
        rightSidebarHoverEnabled: settings.right_sidebar_hover ?? false,
      });

      useMorningStore.setState({
        morningCheckEnabled: settings.morning_check_enabled ?? true,
        morningCheckTime: settings.morning_check_time ?? '08:00',
        morningCheckDismissedDate: settings.morning_check_dismissed_date ?? null,
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
      }
    });

    return () => subscription.unsubscribe();
  }, [initializeStore, clearStore, setTheme]);

  return <>{children}</>;
}
