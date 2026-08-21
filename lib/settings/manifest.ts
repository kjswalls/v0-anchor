import {
  Sunrise,
  Contrast,
  MoonStar,
  Sparkles,
  Command,
  Anchor,
  Blocks,
  type LucideIcon,
} from 'lucide-react';

import { usePlannerStore } from '@/lib/planner-store';
import { useViewStore, type TypeMode, type ScheduleMarkStyle, type BucketStyle } from '@/lib/view-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { useAISettingsStore, type AIProvider } from '@/lib/ai-settings-store';
import { useExtensionsStore } from '@/lib/extensions-store';
import { EXT_COMPLETION_CONFETTI, EXT_HABIT_HEATMAP } from '@/lib/extension-registry';
import { usePaletteStore } from '@/lib/palette-store';
import { THEME_PALETTES, isThemePalette } from '@/lib/theme-palettes';
import { saveSettings } from '@/lib/settings-service';
import type { TimeBucket } from '@/lib/planner-types';

/**
 * Every setting Anchor surfaces, as data.
 *
 * ONE declaration feeds the /settings page, its search index, and the
 * `data-setting` e2e handles. The palette's `settings.*` commands are still
 * hand-declared in lib/commands/registry.ts — that group owns keyboard
 * shortcuts and a globally-unique alias namespace guarded by an exhaustive
 * unit test, so folding it in here is a separate change. tests/unit/
 * settings-manifest.test.ts asserts the two can't drift into an alias
 * collision in the meantime.
 *
 * WHAT BELONGS HERE. A durable default you set once and forget — the shape of
 * a day, how the app is drawn, what runs unattended. Working state does NOT
 * belong here even when it persists: scope, layout, typeFilter, groupBy, the
 * filter popovers, week density, collapsed buckets and the sidebar width all
 * live one click from the surface they affect, where you can see the change
 * land. Sending someone to a settings page to change something they'd have to
 * navigate back to evaluate is the loop this page exists to avoid.
 *
 * WHAT DOESN'T. Settings that persist but no view reads (compact mode, chill
 * mode, morning check time, default view, right_sidebar_hover, assistantName).
 * CLAUDE.md keeps their columns and setters as-is; leaving them out of the
 * manifest is what stops search deep-linking to a control that does nothing.
 * See memory/plans/deferred-settings-features.md for the ones that are coming
 * back once the feature behind them exists.
 */

export type PaneId = 'day' | 'look' | 'rituals' | 'beacon' | 'keyboard' | 'extensions' | 'anchor';

export interface SettingsPane {
  id: PaneId;
  name: string;
  icon: LucideIcon;
  blurb: string;
}

export const PANES: SettingsPane[] = [
  {
    id: 'day',
    name: 'Your day',
    icon: Sunrise,
    blurb: 'What a day and a week are shaped like here.',
  },
  {
    id: 'look',
    name: 'Look',
    icon: Contrast,
    blurb: 'Theme, type, and what the canvas draws.',
  },
  {
    id: 'rituals',
    name: 'Rituals',
    icon: MoonStar,
    blurb: 'The moments Anchor opens by itself.',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    icon: Sparkles,
    blurb: 'Which assistant answers you, and what it knows.',
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    icon: Command,
    blurb: 'Every binding, rebindable in place.',
  },
  {
    id: 'extensions',
    name: 'Extensions',
    icon: Blocks,
    blurb: 'Optional pieces of Anchor — on when you want them.',
  },
  {
    id: 'anchor',
    name: 'Anchor',
    icon: Anchor,
    blurb: 'The account, the tour, and how to reach us.',
  },
];

/**
 * The capabilities a record can't reach through a store singleton.
 *
 * `theme` is the only setting in the app whose setter does not persist itself
 * — next-themes writes localStorage and nothing else, so the Supabase write is
 * paired here. Getting this wrong reverts the user's theme on next sign-in,
 * when supabase-provider re-applies the stored value.
 */
export interface SettingCtx {
  theme: string | undefined;
  setTheme: (value: string) => void;
  userId: string | null;
  /** Push is browser state, not a stored boolean — the Rituals pane supplies it. */
  push?: {
    isSupported: boolean;
    isSubscribed: boolean;
    permissionState: NotificationPermission | 'unknown';
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
  };
  /** Actions the page owns because they need a router or a locally-mounted modal. */
  actions?: {
    openShortcuts: () => void;
    openBugReport: () => void;
    replayTour: () => void;
    signOut: () => void;
  };
}

export type ControlKind = 'switch' | 'enum' | 'time' | 'text' | 'action' | 'info';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingRecord {
  /** Dotted and PERMANENT — the join key for search, the deep link, and the e2e handle. */
  id: string;
  pane: PaneId;
  label: string;
  description?: string;
  control: ControlKind;
  /**
   * The words you use when you're annoyed, not the words in the code.
   * Hand-authored; deriving these from the label is what makes search feel broken.
   */
  keywords: string[];
  /** Exact-hit tokens that outrank everything. Lowercase, single word. */
  aliases?: string[];
  options?: SettingOption[];
  /** Behind the per-pane Advanced disclosure, and excluded from search unless opted in. */
  advanced?: boolean;
  /** Renders indented under its parent and is disabled while the parent is off. */
  dependsOn?: string;
  /**
   * The user_settings column, mirrored to `data-setting` on the control.
   * `show_completed_tasks` is already an e2e selector — see tests/e2e/settings.spec.ts.
   */
  dbColumn?: string;
  /** Absent rather than greyed — platform, not state. Search names the reason. */
  desktopOnly?: boolean;
  /** Present but not actionable, with the reason shown inline. */
  unavailable?: (ctx: SettingCtx) => string | null;
  read: (ctx: SettingCtx) => string | boolean;
  write: (value: string | boolean, ctx: SettingCtx) => void;
  defaultValue: string | boolean;
  /** Label for the current value — what the chip shows and what search echoes. */
  display?: (value: string | boolean) => string;
}

/* ---------------------------------------------------------------- helpers */

const planner = () => usePlannerStore.getState();
const view = () => useViewStore.getState();
const sidebar = () => useSidebarStore.getState();
const morning = () => useMorningStore.getState();
const eod = () => useEODStore.getState();
const ai = () => useAISettingsStore.getState();
const ext = () => useExtensionsStore.getState();
const palette = () => usePaletteStore.getState();

/** Shared by every extension toggle: rows stay visible, with the reason inline. */
const extUnavailable = () =>
  ext().available ? null : 'Needs a database update that has not landed here yet.';

function labelFor(options: SettingOption[] | undefined, value: string | boolean): string {
  const hit = options?.find((o) => o.value === String(value));
  return hit ? hit.label : String(value);
}

/* ---------------------------------------------------------------- records */

export const SETTINGS: SettingRecord[] = [
  /* ── Your day ─────────────────────────────────────────────────────────── */
  {
    id: 'day.weekStart',
    pane: 'day',
    label: 'Week starts on',
    description: 'Which day the week views open with.',
    control: 'enum',
    dbColumn: 'week_start_day',
    options: [
      { value: 'sunday', label: 'Sunday' },
      { value: 'monday', label: 'Monday' },
      { value: 'saturday', label: 'Saturday' },
    ],
    keywords: ['first day', 'calendar', 'week', 'begins', 'starts'],
    read: () => planner().weekStartDay,
    // setWeekStartDay persists itself (user_settings.week_start_day). Adding a
    // saveSettings() here would double-write the same column.
    write: (v) => planner().setWeekStartDay(v as 'sunday' | 'monday' | 'saturday'),
    defaultValue: 'sunday',
  },
  {
    id: 'day.timeFormat',
    pane: 'day',
    label: 'Time format',
    description: 'How every time in Anchor reads.',
    control: 'enum',
    dbColumn: 'time_format',
    options: [
      { value: '12h', label: '12-hour' },
      { value: '24h', label: '24-hour' },
    ],
    keywords: ['clock', 'am pm', 'hours', 'military', '24 hour'],
    read: () => planner().timeFormat,
    write: (v) => planner().setTimeFormat(v as '12h' | '24h'),
    defaultValue: '12h',
  },
  {
    id: 'day.defaultBucket',
    pane: 'day',
    label: 'New items land in',
    description: 'Where capture puts something you gave no time to.',
    control: 'enum',
    advanced: true,
    dbColumn: 'default_time_bucket',
    options: [
      { value: 'anytime', label: 'Anytime' },
      { value: 'morning', label: 'Morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening', label: 'Evening' },
    ],
    keywords: ['capture', 'default', 'bucket', 'quick add', 'new task'],
    read: () => planner().defaultTimeBucket,
    write: (v) => planner().setDefaultTimeBucket(v as TimeBucket),
    defaultValue: 'anytime',
  },
  {
    id: 'day.timezone',
    pane: 'day',
    label: 'Time zone',
    description: 'Detected from this device and synced automatically.',
    control: 'info',
    advanced: true,
    keywords: ['tz', 'utc', 'travel', 'offset', 'region', 'locale'],
    read: () =>
      planner().userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Unknown',
    write: () => {},
    defaultValue: '',
  },

  /* ── Look ─────────────────────────────────────────────────────────────── */
  {
    id: 'look.theme',
    pane: 'look',
    label: 'Theme',
    control: 'enum',
    dbColumn: 'theme',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'system', label: 'System' },
    ],
    keywords: ['appearance', 'night', 'colour scheme', 'color scheme', 'contrast'],
    read: (ctx) => ctx.theme ?? 'system',
    // The one setter in the app that does NOT persist itself.
    write: (v, ctx) => {
      ctx.setTheme(String(v));
      if (ctx.userId) saveSettings(ctx.userId, { theme: String(v) });
    },
    defaultValue: 'system',
  },
  {
    id: 'look.palette',
    pane: 'look',
    label: 'Palette',
    description: 'The ground the app sits on. The lime accent stays.',
    control: 'enum',
    dbColumn: 'theme_palette',
    options: THEME_PALETTES.map((p) => ({ value: p.value, label: p.label })),
    keywords: ['color', 'colour', 'ground', 'background', 'tint', 'paper', 'slate', 'dune', 'iris'],
    read: () => palette().palette,
    // Palette pairs with theme, not the planner stores: the store setter is
    // localStorage + DOM only (via supabase-provider's sync effect), so the
    // Supabase write is paired here — same rule and same reason as look.theme.
    write: (v, ctx) => {
      if (!isThemePalette(v)) return;
      palette().setPalette(v, { eased: true });
      if (ctx.userId) saveSettings(ctx.userId, { theme_palette: v });
    },
    defaultValue: 'default',
  },
  {
    id: 'look.typeface',
    pane: 'look',
    label: 'Typeface',
    description: 'Item titles only — the chrome stays Inter.',
    control: 'enum',
    options: [
      { value: 'sans', label: 'Sans' },
      { value: 'serif', label: 'Serif' },
    ],
    keywords: ['font', 'type', 'source serif', 'inter', 'titles'],
    // Device-local: view-store has no user_settings columns, and inventing one
    // would fail the whole debounced upsert with PGRST204.
    read: () => view().typeMode,
    write: (v) => view().setTypeMode(v as TypeMode),
    defaultValue: 'sans',
  },
  {
    id: 'look.buckets',
    pane: 'look',
    label: 'Buckets',
    description: 'How a time-of-day bucket is drawn.',
    control: 'enum',
    options: [
      // The stored values stay 'spine'/'tray'. They're persisted in the
      // anchor-view blob, and renaming one to match its label would reset
      // every user's choice for a piece of copy.
      { value: 'spine', label: 'Threaded seam' },
      { value: 'tray', label: 'Head & tray' },
    ],
    keywords: ['bucket style', 'spine', 'seam', 'tray', 'morning card', 'rail'],
    read: () => view().bucketStyle,
    write: (v) => view().setBucketStyle(v as BucketStyle),
    defaultValue: 'spine',
  },
  {
    id: 'look.showCompleted',
    pane: 'look',
    label: 'Completed items on the canvas',
    // Names its scope, because the braindump and the canvas filter popovers
    // each keep their own hideCompleted and all three answer for a different
    // surface. Search returns them together; they are not merged.
    description: 'Keep finished work on the grid instead of clearing it. Tasks only — habits always stay.',
    control: 'switch',
    dbColumn: 'show_completed_tasks',
    keywords: ['done', 'finished', 'checked', 'hide', 'tick', 'complete'],
    read: () => planner().showCompletedTasks,
    write: (v) => planner().setShowCompletedTasks(Boolean(v)),
    defaultValue: true,
  },
  {
    id: 'look.animations',
    pane: 'look',
    // Named for the store's own polarity rather than inverted to "Reduce
    // motion": animationsEnabled=false is what stamps data-reduce-motion, and
    // an inverted control is one refactor away from a silent polarity bug.
    label: 'Animations',
    description: 'Turn off to reduce motion across Anchor.',
    control: 'switch',
    dbColumn: 'animations_enabled',
    keywords: ['motion', 'transitions', 'jumpy', 'still', 'reduce motion', 'animate'],
    read: () => planner().animationsEnabled,
    write: (v) => planner().setAnimationsEnabled(Boolean(v)),
    defaultValue: true,
  },
  {
    id: 'look.timeIndicator',
    pane: 'look',
    label: 'Current time line',
    description: 'A line across today at the current hour, in Day and Week.',
    control: 'switch',
    advanced: true,
    dbColumn: 'show_time_indicator',
    keywords: ['now line', 'red line', 'glowing line', 'marker', 'current time'],
    read: () => planner().showCurrentTimeIndicator,
    write: (v) => planner().setShowCurrentTimeIndicator(Boolean(v)),
    defaultValue: true,
  },
  {
    id: 'look.showPaused',
    pane: 'look',
    label: 'Paused items on the grid',
    description: 'Show them greyed in place rather than hiding them.',
    control: 'switch',
    advanced: true,
    keywords: ['pause', 'snooze', 'greyed', 'hold', 'hidden'],
    // Local-only by design — no user_settings column exists, and adding one to
    // the saveSettings patch would PGRST204 the entire debounced flush.
    read: () => planner().showPausedOnGrid,
    write: (v) => planner().setShowPausedOnGrid(Boolean(v)),
    defaultValue: false,
  },
  {
    id: 'look.markStyle',
    pane: 'look',
    label: 'Schedule handles',
    description: 'The corner and resize marks on a schedule block.',
    control: 'enum',
    advanced: true,
    options: [
      { value: 'nodes', label: 'Nodes' },
      { value: 'target', label: 'Target' },
      { value: 'trim', label: 'Trim marks' },
    ],
    keywords: ['resize', 'corner', 'grips', 'drag', 'block'],
    read: () => view().scheduleMarkStyle,
    write: (v) => view().setScheduleMarkStyle(v as ScheduleMarkStyle),
    defaultValue: 'nodes',
  },
  {
    id: 'look.sidebarHover',
    pane: 'look',
    label: 'Reveal the sidebar on hover',
    description: 'Only applies while the sidebar is collapsed.',
    control: 'switch',
    advanced: true,
    desktopOnly: true,
    dbColumn: 'left_sidebar_hover',
    keywords: ['sidebar', 'edge', 'peek', 'braindump', 'slide out'],
    read: () => sidebar().leftSidebarHoverEnabled,
    write: (v) => sidebar().setLeftSidebarHoverEnabled(Boolean(v)),
    defaultValue: false,
  },

  /* ── Rituals ──────────────────────────────────────────────────────────── */
  {
    id: 'rituals.morningCheck',
    pane: 'rituals',
    label: 'Morning past-due check',
    description: 'A single quiet line above your day when items are still waiting from earlier.',
    control: 'switch',
    dbColumn: 'morning_check_enabled',
    keywords: ['overdue', 'past due', 'waiting', 'yesterday', 'sunrise', 'stale', 'backlog'],
    read: () => morning().morningCheckEnabled,
    write: (v) => morning().setMorningCheckEnabled(Boolean(v)),
    defaultValue: true,
  },
  {
    id: 'rituals.autoAge',
    pane: 'rituals',
    label: 'Auto-clear stale items',
    description:
      'Moves items past due by more than the chosen number of days to your Braindump, once a day, without asking.',
    control: 'switch',
    dependsOn: 'rituals.morningCheck',
    dbColumn: 'morning_auto_age_enabled',
    keywords: ['old', 'past due', 'stale', 'pile up', 'backlog', 'cleanup', 'unschedule', 'decay'],
    read: () => morning().morningAutoAgeEnabled,
    write: (v) => morning().setMorningAutoAgeEnabled(Boolean(v)),
    defaultValue: false,
  },
  {
    id: 'rituals.autoAgeDays',
    pane: 'rituals',
    label: 'Clear after',
    description: 'How long an item can sit past due before it is cleared.',
    control: 'enum',
    dependsOn: 'rituals.autoAge',
    dbColumn: 'morning_auto_age_days',
    options: [
      { value: '7', label: '7 days' },
      { value: '14', label: '14 days' },
      { value: '30', label: '30 days' },
      { value: '60', label: '60 days' },
      { value: '90', label: '90 days' },
    ],
    keywords: ['age', 'threshold', 'how long', 'days'],
    read: () => String(morning().morningAutoAgeDays),
    write: (v) => morning().setMorningAutoAgeDays(Number(v)),
    defaultValue: '30',
  },
  {
    id: 'rituals.eod',
    pane: 'rituals',
    label: 'End-of-day review',
    description: 'Review what you got through before the day closes.',
    control: 'switch',
    dbColumn: 'eod_review_enabled',
    // 'eod' is a KEYWORD, not an alias: the palette already claims /eod, and
    // aliases are a single global namespace the moment these two surfaces are
    // generated from one declaration. A keyword still finds it here.
    keywords: ['evening', 'reflect', 'wrap up', 'review', 'night', 'shutdown', 'eod'],
    read: () => eod().eodReviewEnabled,
    write: (v) => eod().setEodReviewEnabled(Boolean(v)),
    defaultValue: false,
  },
  {
    id: 'rituals.eodTime',
    pane: 'rituals',
    label: 'Review at',
    control: 'time',
    dependsOn: 'rituals.eod',
    dbColumn: 'eod_review_time',
    keywords: ['when', 'hour', 'evening', 'schedule'],
    read: () => eod().eodReviewTime,
    write: (v) => eod().setEodReviewTime(String(v)),
    defaultValue: '21:00',
  },
  {
    id: 'rituals.push',
    pane: 'rituals',
    label: 'Push notifications',
    description: 'Let Anchor reach this device when a ritual fires.',
    control: 'switch',
    keywords: ['notify', 'alerts', 'phone', 'reminders', 'badge', 'notification'],
    unavailable: (ctx) => {
      if (!ctx.push) return null;
      if (!ctx.push.isSupported) return 'not supported in this browser';
      if (ctx.push.permissionState === 'denied')
        return 'blocked in your browser settings — allow notifications, then reload';
      return null;
    },
    // Reflects the real PushSubscription, not a stored boolean.
    read: (ctx) => ctx.push?.isSubscribed ?? false,
    write: (v, ctx) => {
      if (!ctx.push) return;
      void (v ? ctx.push.subscribe() : ctx.push.unsubscribe()).catch((err) => {
        console.error('[settings] push toggle failed:', err);
      });
    },
    defaultValue: false,
  },

  /* ── Beacon ───────────────────────────────────────────────────────────── */
  {
    id: 'beacon.provider',
    pane: 'beacon',
    label: 'Assistant',
    description: 'Which agent answers you in the sidebar.',
    control: 'enum',
    options: [
      { value: 'openclaw', label: 'OpenClaw' },
      { value: 'openai', label: 'Beacon (OpenAI)' },
      { value: 'none', label: 'Off' },
    ],
    keywords: ['ai', 'agent', 'chat', 'llm', 'openclaw', 'beacon'],
    read: () => ai().provider,
    write: (v) => ai().setProvider(v as AIProvider),
    defaultValue: 'openclaw',
  },
  {
    id: 'beacon.instructions',
    pane: 'beacon',
    label: 'Custom instructions',
    description: 'What Beacon should know about how you work. Sent with every message.',
    control: 'text',
    keywords: ['system prompt', 'personality', 'context', 'about me', 'profile', 'memory'],
    read: () => ai().systemPrompt,
    write: (v) => ai().setSystemPrompt(String(v)),
    defaultValue: '',
  },
  {
    id: 'beacon.apiKey',
    pane: 'beacon',
    label: 'OpenAI key',
    description: 'Stored on this device only, never synced.',
    control: 'text',
    advanced: true,
    keywords: ['api key', 'token', 'credential', 'openai', 'sk'],
    unavailable: () => (ai().provider === 'openai' ? null : 'only used by Beacon (OpenAI)'),
    read: () => ai().apiKey,
    write: (v) => ai().setApiKey(String(v)),
    defaultValue: '',
  },
  {
    id: 'beacon.model',
    pane: 'beacon',
    label: 'Model',
    control: 'enum',
    advanced: true,
    options: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
    ],
    keywords: ['openai', 'gpt', 'engine'],
    unavailable: () => (ai().provider === 'openai' ? null : 'only used by Beacon (OpenAI)'),
    read: () => ai().model,
    write: (v) => ai().setModel(String(v)),
    defaultValue: 'gpt-4o-mini',
  },

  /* ── Keyboard ─────────────────────────────────────────────────────────── */
  {
    id: 'keys.shortcuts',
    pane: 'keyboard',
    label: 'Keyboard shortcuts',
    description: 'Every binding, rebindable. The same table ⌘/ opens.',
    control: 'action',
    // NOT desktopOnly, despite the obvious temptation: it is the only record in
    // the Keyboard pane, so hiding it on mobile leaves a pane the rail still
    // advertises and search can no longer reach — a dead room. An iPad with a
    // keyboard makes the table useful anyway.
    keywords: ['keybinding', 'hotkey', 'remap', 'shortcut', 'keys', 'bindings'],
    read: () => 'Open',
    write: (_v, ctx) => ctx.actions?.openShortcuts(),
    defaultValue: 'Open',
  },

  /* ── Anchor ───────────────────────────────────────────────────────────── */
  {
    id: 'anchor.tour',
    pane: 'anchor',
    label: 'Replay the tour',
    description: 'Walks you back through the shell. Takes you to the planner.',
    control: 'action',
    keywords: ['onboarding', 'tutorial', 'walkthrough', 'intro', 'guide'],
    read: () => 'Replay',
    write: (_v, ctx) => ctx.actions?.replayTour(),
    defaultValue: 'Replay',
  },
  {
    id: 'anchor.feedback',
    pane: 'anchor',
    label: 'Send feedback',
    description: 'Goes straight to the person who can fix it.',
    control: 'action',
    keywords: ['bug', 'report', 'issue', 'broken', 'support', 'feedback'],
    read: () => 'Write',
    write: (_v, ctx) => ctx.actions?.openBugReport(),
    defaultValue: 'Write',
  },
  {
    id: 'anchor.signOut',
    pane: 'anchor',
    label: 'Sign out',
    control: 'action',
    keywords: ['log out', 'logout', 'account', 'leave', 'switch account'],
    read: () => 'Sign out',
    write: (_v, ctx) => ctx.actions?.signOut(),
    defaultValue: 'Sign out',
  },

  /* ── Extensions ───────────────────────────────────────────────────────── */
  // One switch per manifest entry in lib/extension-registry.ts. Persistence is
  // the user_extensions table (migration 026), NOT a user_settings column —
  // per-extension columns are the missing-column reset footgun. No dbColumn,
  // so data-setting falls back to the record id.
  {
    id: 'extensions.habitHeatmap',
    pane: 'extensions',
    label: 'Habit heatmap',
    description: 'A six-month completion grid in the item panel, for anything with a streak.',
    control: 'switch',
    keywords: ['heatmap', 'history', 'streak', 'grid', 'completion', 'habits'],
    unavailable: extUnavailable,
    read: () => ext().isEnabled(EXT_HABIT_HEATMAP),
    write: (v, ctx) => {
      if (ctx.userId) ext().setEnabled(ctx.userId, EXT_HABIT_HEATMAP, Boolean(v));
    },
    defaultValue: false,
  },
  {
    id: 'extensions.confetti',
    pane: 'extensions',
    label: 'Completion confetti',
    description: 'A small burst when you complete something. Purely celebratory.',
    control: 'switch',
    keywords: ['celebrate', 'party', 'fun', 'burst', 'reward', 'dopamine'],
    unavailable: extUnavailable,
    read: () => ext().isEnabled(EXT_COMPLETION_CONFETTI),
    write: (v, ctx) => {
      if (ctx.userId) ext().setEnabled(ctx.userId, EXT_COMPLETION_CONFETTI, Boolean(v));
    },
    defaultValue: false,
  },
];

/**
 * Configuration that deliberately does NOT live in settings, indexed so search
 * can still answer for it.
 *
 * This is what keeps the rail small. The next class of configuration earns a
 * destination record and a manager surface rather than a new pane — the budget
 * is a mechanism, not a promise someone has to keep defending. (Extensions
 * spent the budget once, deliberately: its rows are durable opt-in switches
 * with no manager surface to point a destination at.)
 */
export interface DestinationRecord {
  id: string;
  label: string;
  /** Where it actually lives, shown on the result row. */
  where: string;
  keywords: string[];
  /**
   * Dispatched on click. The page supplies the implementation.
   *
   * `manage-categories` and `manage-collections` collapsed into one `organize`
   * when the two dialogs became one console — the split was never about what
   * the user wanted, only about which dialog happened to own the row.
   */
  action: 'organize' | 'connect-openclaw' | 'openclaw-docs';
  /** For `organize`: which section to land on. */
  section?: string;
}

export const DESTINATIONS: DestinationRecord[] = [
  {
    id: 'dest.projects',
    label: 'Projects',
    // Names the real surface. "Planner" was true of a dialog reachable from two
    // unrelated places; these five now live in one console with a name.
    where: 'Organize',
    keywords: ['project', 'folder', 'colour', 'color', 'container', 'manage'],
    action: 'organize',
    section: 'projects',
  },
  {
    id: 'dest.groups',
    label: 'Habit groups',
    where: 'Organize',
    keywords: ['group', 'habit', 'category', 'wellness', 'work'],
    action: 'organize',
    section: 'groups',
  },
  {
    id: 'dest.types',
    label: 'Item types',
    where: 'Organize',
    keywords: ['custom type', 'registry', 'task type', 'habit type', 'kind'],
    action: 'organize',
    section: 'types',
  },
  {
    id: 'dest.routines',
    label: 'Routines',
    where: 'Organize',
    keywords: ['routine', 'recurring', 'template', 'stack'],
    action: 'organize',
    section: 'routines',
  },
  {
    id: 'dest.programs',
    label: 'Programs',
    where: 'Organize',
    keywords: ['program', 'plan', 'course', 'block', 'season'],
    action: 'organize',
    section: 'programs',
  },
  {
    id: 'dest.goals',
    label: 'Goals',
    where: 'Organize',
    // The nouns someone reaches for when the thing they want is long-horizon:
    // the container's own word, the two roles it grants, and the shapes people
    // describe them as before they know the feature exists.
    keywords: ['goal', 'milestone', 'check-in', 'checkin', 'ambition', 'target', 'long term'],
    action: 'organize',
    section: 'goals',
  },
  {
    id: 'dest.trash',
    label: 'Recently deleted',
    where: 'Organize',
    // Labelled by what someone in trouble would type, which is rarely "trash".
    // The other five records name a thing you are looking for; this one is
    // searched from a different emotional place and needs the vocabulary of
    // that moment — "restore", "undelete", "recover", "gone".
    keywords: ['trash', 'deleted', 'restore', 'undelete', 'recover', 'bin', 'gone', 'lost'],
    action: 'organize',
    section: 'trash',
  },
  {
    id: 'dest.openclaw',
    label: 'Connect OpenClaw',
    where: '/connect',
    keywords: ['openclaw', 'agent', 'connect', 'pair', 'device', 'cli'],
    action: 'connect-openclaw',
  },
];

/* ---------------------------------------------------------------- lookups */

export function settingById(id: string): SettingRecord | undefined {
  return SETTINGS.find((s) => s.id === id);
}

export function settingsForPane(pane: PaneId): SettingRecord[] {
  return SETTINGS.filter((s) => s.pane === pane);
}

export function paneById(id: string): SettingsPane | undefined {
  return PANES.find((p) => p.id === id);
}

export function isPaneId(value: string): value is PaneId {
  return PANES.some((p) => p.id === value);
}

/** The value as the user sees it — chip copy, and what search echoes back. */
export function displayValue(record: SettingRecord, value: string | boolean): string {
  if (record.display) return record.display(value);
  if (record.control === 'switch') return value ? 'On' : 'Off';
  return labelFor(record.options, value);
}

/** Every value label, for the index. "Sunday" must find Week starts on. */
export function valueLabels(record: SettingRecord): string[] {
  return (record.options ?? []).map((o) => o.label);
}

export function isModified(record: SettingRecord, ctx: SettingCtx): boolean {
  // Actions and read-only info rows have no default to differ from.
  if (record.control === 'action' || record.control === 'info') return false;
  try {
    return record.read(ctx) !== record.defaultValue;
  } catch {
    return false;
  }
}
