import {
  Bug,
  CalendarRange,
  Compass,
  HandCoins,
  LineChart,
  ListPlus,
  MessageSquare,
  PartyPopper,
  PhoneCall,
  Speaker,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The official extensions catalog — Anchor's declarative "plugin" surface.
 *
 * An extension is optional, first-party, extended functionality a user toggles
 * per-account in Settings → Extensions. This registry is the manifest list the
 * plan doc (memory/plans/plugins-themes-store.md, Project B) calls for: adding
 * an extension means adding config here, a gate at its surface, and nothing
 * else. No third-party code executes — "extensions" are declarative by locked
 * decision; the sandboxed-runtime tier is deliberately unbuilt.
 *
 * Enabled state lives in the user_extensions table (migration 026) as sparse
 * per-user rows; a slug with no row falls back to defaultEnabled here. Slugs
 * are permanent identifiers (they are the DB rows and the settings deep links)
 * — rename the label, never the slug.
 */
export interface ExtensionManifest {
  /** Permanent machine name — lowercase slug, mirrors user_extensions.slug. */
  slug: string;
  name: string;
  /** One line, user-facing, shown under the settings toggle. */
  description: string;
  icon: LucideIcon;
  category: 'habits' | 'views' | 'integrations' | 'fun' | 'workspace';
  /**
   * What a user who never touched the toggle gets.
   *
   * NOT always false. Opt-in is the right default for anything that reaches out
   * of the app or spends money, and the wrong one for a feature that shipped as
   * part of Anchor and is only now BECOMING optional — switching those off for
   * everyone on the deploy that makes them switchable is a regression wearing an
   * extension's clothes. Those default ON, and the switch is the news.
   */
  defaultEnabled: boolean;
  /**
   * Exactly what goes quiet when this extension is switched OFF — one line per
   * place its BEHAVIOUR reaches.
   *
   * This exists because "off" here does not mean "hidden". Anchor's extensions
   * are a store, not a feature-flag list: a switched-off extension keeps its
   * catalogue row, keeps its settings pane, and stays findable by search — it
   * simply stops doing anything. That split is only meaningful if someone has
   * written down which half is which, per extension, and it is the half that is
   * easy to get wrong: the pane is one obvious file, while "the behaviour" is a
   * cron scan, a keyboard binding, a paste handler and a dropdown row in four
   * different component trees.
   *
   * Be honest about what enforces this. A test can only check that the list is
   * non-empty and that each line reads as a claim (tests/unit/extension-
   * inertness.test.tsx); no test can prove a sentence describes the code. What
   * the list actually buys is a REVIEW artifact — the place a reviewer looks to
   * ask "is that still all of them?", and the checklist the per-extension
   * inertness tests are written from. The tests are what have teeth; this is
   * what tells you which tests to write.
   */
  inert: string[];
}

export const EXT_HABIT_HEATMAP = 'habit-heatmap';
export const EXT_COMPLETION_CONFETTI = 'completion-confetti';
/**
 * Reminder delivery channels (Tier 2).
 *
 * Each slug is BOTH the extension's identity here and the channel's slug in
 * lib/reminders/channels — see the note on NudgeChannel.slug for why those are
 * deliberately the same string rather than a short internal name and a pretty
 * external one.
 *
 * All three default OFF, and that is not the usual caution about new features:
 * these reach out of the app and into a room or a phone, and two of them spend
 * the user's money. An integration that could ring you should never arrive
 * already able to.
 */
export const EXT_VOICE_ANNOUNCEMENTS = 'voice-announcements';
export const EXT_SMS_NUDGE = 'sms-nudge';
export const EXT_PHONE_CALL = 'phone-call';

/**
 * Stakes (Tier 3) — what a finished day is worth.
 *
 * These do not deliver anything at the moment a habit is due; they settle the
 * day afterwards and report it somewhere with consequences attached. Off by
 * default for a sharper version of the Tier 2 reason: one of them can cost real
 * money, and none of them should be able to start doing that because a toggle
 * defaulted on.
 */
export const EXT_BEEMINDER = 'beeminder';
export const EXT_PLEDGE = 'pledge';
export const EXT_ACCOUNTABILITY_PARTNER = 'accountability-partner';

/**
 * Workspace (Tier 0) — parts of Anchor itself, made switchable.
 *
 * These are the first catalogue entries that did not ARRIVE as extensions. Each
 * shipped as an always-on surface, each one small, and the audit's question was
 * the sum of them: a paste handler on every capture field in the app, a bare `?`
 * that opens an issue form, and a tour that runs itself once and then owns a
 * settings row forever. None of them is wrong; none of them is for everybody
 * either, and every one of them costs a keystroke, a menu row or a first-run
 * interruption to a user who will never want it.
 *
 * All three default ON, which is the whole difference between this tier and the
 * two above it. Tiers 2 and 3 reach a phone or a wallet, so they must be asked
 * for. These are already in the hands of every existing user, and shipping the
 * switch is not permission to take the feature away — a deploy that silently
 * turns three working features off is indistinguishable from a bug report.
 */
export const EXT_FEEDBACK = 'feedback';
export const EXT_GUIDED_TOUR = 'guided-tour';
export const EXT_BULK_PASTE = 'bulk-paste';

export const OFFICIAL_EXTENSIONS: ExtensionManifest[] = [
  {
    slug: EXT_HABIT_HEATMAP,
    name: 'Habit heatmap',
    description: 'A six-month completion grid in the item panel for anything with a streak.',
    icon: CalendarRange,
    category: 'habits',
    defaultEnabled: false,
    inert: [
      'The heatmap section is not rendered in the item panel or on /item/[id].',
    ],
  },
  {
    slug: EXT_COMPLETION_CONFETTI,
    name: 'Completion confetti',
    description: 'A small burst when you complete something. Purely celebratory.',
    icon: PartyPopper,
    category: 'fun',
    defaultEnabled: false,
    inert: [
      'No burst on completion, from any surface.',
      'canvas-confetti is never imported, so it stays out of the bundle.',
    ],
  },
  {
    slug: EXT_VOICE_ANNOUNCEMENTS,
    name: 'Speak reminders aloud',
    // Says what it needs, because the setting is useless without it and finding
    // that out three screens later is the worst version of this.
    description: 'Reads reminders through your Home Assistant speakers. Needs a Home Assistant URL and token.',
    icon: Speaker,
    category: 'integrations',
    defaultEnabled: false,
    inert: [
      'The reminder scan does not select it as a delivery channel.',
      'No Home Assistant request is made, at a cue or at last call.',
    ],
  },
  {
    slug: EXT_SMS_NUDGE,
    name: 'Text me',
    description: 'Sends reminders as a text message through Twilio. Needs a Twilio account.',
    icon: MessageSquare,
    category: 'integrations',
    defaultEnabled: false,
    inert: [
      'The reminder scan does not select it as a delivery channel.',
      'No Twilio message is sent, at a cue or at last call.',
    ],
  },
  {
    slug: EXT_PHONE_CALL,
    name: 'Call me',
    // Names the default out loud. A channel that rings a phone must not leave
    // anyone guessing how often it will.
    description: 'Rings you through Twilio. Last call only unless you change it — a call for every reminder is a lot.',
    icon: PhoneCall,
    category: 'integrations',
    defaultEnabled: false,
    inert: [
      'The reminder scan does not select it as a delivery channel.',
      'No Twilio call is placed, at a cue or at last call.',
    ],
  },
  {
    slug: EXT_BEEMINDER,
    name: 'Beeminder',
    description: 'Posts each completed habit to a Beeminder goal, where missing costs real money.',
    icon: LineChart,
    category: 'habits',
    defaultEnabled: false,
    inert: [
      'The live path at setItemCompletion posts no datapoint.',
      'The nightly settlement claims no stake_events row for it.',
    ],
  },
  {
    slug: EXT_PLEDGE,
    name: 'Pledge',
    // The limitation is IN the description, not buried in a doc. A commitment
    // device that seems to collect and does not is worse than none, because you
    // keep trusting it — so the one sentence everyone reads has to say it.
    description:
      'Records what each miss costs, payable to a cause you can’t stand. Anchor keeps the ledger — it cannot take payment.',
    icon: HandCoins,
    category: 'habits',
    defaultEnabled: false,
    inert: [
      'The nightly settlement records no pledge for a missed day.',
      'Nothing new reaches the ledger at /ledger; what is already there stays.',
    ],
  },
  {
    slug: EXT_ACCOUNTABILITY_PARTNER,
    name: 'Accountability partner',
    description: 'Sends a short daily digest to a Slack or Discord webhook. Someone expecting it is the point.',
    icon: Users,
    category: 'habits',
    defaultEnabled: false,
    inert: [
      'The nightly settlement posts no digest to the webhook.',
    ],
  },
  {
    slug: EXT_FEEDBACK,
    name: 'Send feedback',
    description: 'A bug-and-idea form that files a GitHub issue. Bound to ? and in the account menu.',
    icon: Bug,
    category: 'workspace',
    defaultEnabled: true,
    inert: [
      'The “Share feedback” palette row is not offered.',
      'The ? binding runs nothing and does not swallow the keystroke.',
      'The account menu shows no feedback entry, on desktop or on mobile.',
      'Settings → Anchor → “Send feedback” says why instead of opening the form.',
      'POST /api/bug-report refuses a signed-in author, so no issue is filed.',
    ],
  },
  {
    slug: EXT_GUIDED_TOUR,
    name: 'Guided tour',
    description: 'The first-run walkthrough of the shell, replayable from Settings.',
    icon: Compass,
    category: 'workspace',
    defaultEnabled: true,
    inert: [
      'A new account is never interrupted by the tour on first load.',
      'The tour never mounts, so it spotlights nothing and blocks nothing.',
      'Beacon is not put into its first-run onboarding mode.',
      'Settings → Anchor → “Replay the tour” says why instead of replaying.',
    ],
  },
  {
    slug: EXT_BULK_PASTE,
    name: 'Paste a list',
    description: 'A multi-line paste becomes one item per line, anywhere you capture.',
    icon: ListPlus,
    category: 'workspace',
    defaultEnabled: true,
    inert: [
      'A multi-line paste falls through to the browser — one field, one value.',
      'The omnibar, the braindump, the item dialog and the subtask field stop intercepting paste.',
      'The “Add many items…” palette row is not offered.',
      'openBulkAdd() opens nothing, so no other caller can route around the above.',
    ],
  },
];

export function extensionManifest(slug: string): ExtensionManifest | undefined {
  return OFFICIAL_EXTENSIONS.find((extension) => extension.slug === slug);
}

/** Resolve a slug against sparse per-user rows, falling back to the manifest default. */
export function resolveEnabled(enabled: Record<string, boolean>, slug: string): boolean {
  return enabled[slug] ?? extensionManifest(slug)?.defaultEnabled ?? false;
}
