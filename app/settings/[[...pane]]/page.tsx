'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';

import { SettingsShell } from '@/components/settings/settings-shell';
import { KeyboardShortcutsModal } from '@/components/planner/keyboard-shortcuts-modal';
import { BugReportDialog } from '@/components/bug-report/bug-report-dialog';
import { ConfirmDialog } from '@/components/shell/confirm-dialog';
import { Button } from '@/components/ui/button';

import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore } from '@/lib/view-store';
import { useMorningStore } from '@/lib/morning-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useEODStore } from '@/lib/eod-store';
import { useAISettingsStore } from '@/lib/ai-settings-store';
import { useUIStore } from '@/lib/ui-store';
import { flushSettings } from '@/lib/settings-service';
import { resetOnboardingComplete } from '@/lib/user-profile';
import { createClient } from '@/lib/supabase';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { applyThemeChange } from '@/lib/theme-transition';
import { useIsMobile } from '@/hooks/use-mobile';
import { isPaneId, type PaneId, type SettingCtx, type DestinationRecord } from '@/lib/settings/manifest';

/**
 * Settings, as a route.
 *
 * Follows the /item/[id] precedent — no AppShell, no canvas-container, the
 * root layout's SupabaseProvider supplying hydration and theme. Which means
 * this page has to do, by hand, the four things AppShell was doing for free:
 *
 *   1. The <html data-type-mode> stamp. AppShell is its ONLY writer, so without
 *      this the Typeface row would appear to save and change nothing — the
 *      worst failure shape available.
 *   2. flushSettings() on pagehide AND on unmount. Writes are debounced 500ms
 *      and a Next client-side navigation fires no pagehide at all, so leaving
 *      via the breadcrumb inside that window would silently drop the patch.
 *      The dialog literally could not do this; a route can.
 *   3. The modals the settings surface hands off to. ConfirmDialog,
 *      KeyboardShortcutsModal and BugReportDialog are mounted only by AppShell,
 *      so dispatching to them through ui-store from here would set state that
 *      nothing renders.
 *   4. The hydration gate. Every store here is localStorage-persisted under a
 *      browser-global key, so before Supabase settles this page would render
 *      the PREVIOUS account's values as live controls — and a click inside that
 *      window writes someone else's preference to this user's row.
 */

export default function SettingsPage() {
  const router = useRouter();
  const params = useParams<{ pane?: string[] }>();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const { theme, setTheme } = useTheme();
  const userId = usePlannerStore((s) => s.userId);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const hydratedUserId = useMorningStore((s) => s.settingsHydratedUserId);
  const push = usePushSubscription();

  const [localDialog, setLocalDialog] = useState<'shortcuts' | 'bug' | null>(null);

  const segment = params?.pane?.[0];
  const pane: PaneId = segment && isPaneId(segment) ? segment : 'day';
  const focusId = searchParams?.get('focus') ?? undefined;

  /* ── 1. The type-mode stamp ───────────────────────────────────────────── */
  const typeMode = useViewStore((s) => s.typeMode);
  useEffect(() => {
    document.documentElement.dataset.typeMode = typeMode;
  }, [typeMode]);

  /* ── 2. Exit-save, both ways out ──────────────────────────────────────── */
  useEffect(() => {
    // pagehide, not beforeunload — it's the one that fires on mobile Safari.
    const onPageHide = () => void flushSettings();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      // Soft navigation away fires no pagehide, so the unmount is the only
      // hook a debounced write has left.
      void flushSettings();
    };
  }, []);

  /* ── A bare /settings is the day, not a blank "pick something" ─────────── */
  useEffect(() => {
    if (!segment) router.replace('/settings/day');
  }, [segment, router]);

  /* ── Subscriptions that keep record.read() fresh ──────────────────────────
     The manifest reads through getState() so it stays a plain module. These
     selectors are what make this component re-render when a value changes;
     without them a toggle would flip the store and not the screen. */
  const plannerTick = usePlannerStore(
    (s) =>
      `${s.timeFormat}|${s.weekStartDay}|${s.defaultTimeBucket}|${s.showCompletedTasks}|` +
      `${s.animationsEnabled}|${s.showCurrentTimeIndicator}|${s.showPausedOnGrid}|${s.userTimezone}`
  );
  const viewTick = useViewStore((s) => `${s.typeMode}|${s.bucketStyle}|${s.scheduleMarkStyle}`);
  const sidebarTick = useSidebarStore((s) => s.leftSidebarHoverEnabled);
  const morningTick = useMorningStore(
    (s) => `${s.morningCheckEnabled}|${s.morningAutoAgeEnabled}|${s.morningAutoAgeDays}`
  );
  const eodTick = useEODStore((s) => `${s.eodReviewEnabled}|${s.eodReviewTime}`);
  // apiKey rides the tick VERBATIM, not as a set/unset flag: one non-empty key
  // replacing another is exactly what a flag can't see, and the text controls
  // commit on blur by comparing their draft against the last RENDERED value —
  // so a stale value prop silently drops the next edit. JSON.stringify rather
  // than a '|' join because systemPrompt is free text and can contain the
  // separator. No new exposure: it is already plaintext in anchor-ai-settings.
  const aiTick = useAISettingsStore((s) =>
    JSON.stringify([s.provider, s.model, s.systemPrompt, s.apiKey])
  );

  const signOut = useCallback(async () => {
    // Anything still buffered has to land while the session is alive, or RLS
    // rejects it and the change is lost.
    await flushSettings();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }, [router]);

  const replayTour = useCallback(async () => {
    await flushSettings();
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) await resetOnboardingComplete(uid);
    // The tour's steps target shell-only DOM and OnboardingTour mounts inside
    // AppShell, so the only way to replay it is to go where it lives — its
    // mount effect re-checks completion and opens itself.
    router.push('/');
  }, [router]);

  // Wrapped once here rather than inside the manifest record, so the palette
  // and the page cannot ease differently.
  const setThemeSmoothly = useCallback(
    (next: string) => applyThemeChange(() => setTheme(next)),
    [setTheme]
  );

  const ctx = useMemo<SettingCtx>(
    () => ({
      theme,
      setTheme: setThemeSmoothly,
      userId,
      push,
      actions: {
        openShortcuts: () => setLocalDialog('shortcuts'),
        openBugReport: () => setLocalDialog('bug'),
        replayTour: () => void replayTour(),
        signOut: () => void signOut(),
      },
    }),
    // The ticks are the point: they are not read here, they are what makes this
    // memo (and therefore every record.read()) recompute on a store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      theme,
      setThemeSmoothly,
      userId,
      push,
      replayTour,
      signOut,
      plannerTick,
      viewTick,
      sidebarTick,
      morningTick,
      eodTick,
      aiTick,
    ]
  );

  const openDestination = useCallback(
    (record: DestinationRecord) => {
      if (record.action === 'connect-openclaw') {
        router.push('/connect');
        return;
      }
      if (record.action === 'openclaw-docs') {
        router.push('/docs/openclaw');
        return;
      }
      // ui-store is a module singleton and survives client-side navigation, so
      // arming the dialog before pushing lands on the planner with it already
      // open — no new prop threading through AppShell.
      useUIStore.getState().openDialog({ type: 'organize', section: record.section });
      router.push('/');
    },
    [router]
  );

  /* ── 4. The hydration gate ────────────────────────────────────────────── */
  // `userId` alone is not "loaded" — initializeStore stamps it before the
  // fetch resolves. And `settingsHydratedUserId` is the only honest answer to
  // "are these values this account's yet"; it's stamped in the same set() as
  // the server values, so it can never disagree with them.
  const settled = !!userId && !isLoading;
  const hydrated = settled && hydratedUserId === userId;

  if (!hydrated) {
    return (
      <main
        className="mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-16"
        data-testid="settings-page"
      >
        <h1 className="text-foreground text-lg font-semibold">
          {settled ? 'Loading your settings…' : 'Loading…'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {settled
            ? 'One moment — showing them before they arrive would show you the wrong values.'
            : 'If nothing loads, you may need to sign in.'}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Open Anchor</Link>
          </Button>
          {!userId && (
            <Button asChild variant="outline" size="sm">
              <Link href="/login?redirect=/settings">Sign in</Link>
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    <div data-testid="settings-page">
      <SettingsShell
        pane={pane}
        ctx={ctx}
        focusId={focusId}
        isMobile={isMobile}
        onOpenDestination={openDestination}
      />

      {/* Mounted here because AppShell isn't. */}
      <ConfirmDialog />
      <KeyboardShortcutsModal
        open={localDialog === 'shortcuts'}
        onOpenChange={(open) => setLocalDialog(open ? 'shortcuts' : null)}
      />
      <BugReportDialog
        open={localDialog === 'bug'}
        onOpenChange={(open) => setLocalDialog(open ? 'bug' : null)}
      />
    </div>
  );
}
