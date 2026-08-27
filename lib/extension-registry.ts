import {
  CalendarRange,
  FolderCog,
  HandCoins,
  LineChart,
  MessageSquare,
  PartyPopper,
  PhoneCall,
  Speaker,
  Target,
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
  category: 'habits' | 'views' | 'integrations' | 'fun' | 'planning';
  /** What a user who never touched the toggle gets. Extensions are opt-in. */
  defaultEnabled: boolean;
}

/**
 * Ideas, not peripherals (Tier 0) — the first two entries that gate what Anchor
 * MEANS rather than what it TOUCHES.
 *
 * Everything else in this catalog is a peripheral: a heatmap, a burst of
 * confetti, six ways to reach out of the app. "The Weight of Anchor" found the
 * registry was gating only those, so a brand-new account arrived holding the
 * entire conceptual model — goals, programs, routines, two rituals and a
 * twelve-section console — on day one. These two are the first half of the
 * answer, and they are the two the audit named as safest to cut first: goals
 * were built as a role that deliberately reaches nothing downstream, and the
 * console is one self-contained surface.
 *
 * OFF is INERT, NOT HIDDEN, and that is the whole design (Kirby, 2026-08-26):
 * "off means inert, but still findable. Like an extension store." A switched-off
 * extension keeps its catalog row, its settings pane and its search hits — every
 * one of these slugs is in OFFICIAL_EXTENSIONS below, which is what generates
 * all three. Only the BEHAVIOUR stops. What that means per surface is stated at
 * each gate and gathered in lib/extension-gates.ts.
 *
 * These two default OFF for a different reason than the channels do. A channel
 * defaults off because it can ring a phone or spend money. These default off
 * because a concept you have not met is weight you carry for nothing — see the
 * note on `defaultEnabled` in each entry, and the migration question in the
 * PR that landed them, which is about the accounts that ALREADY hold this data.
 */
export const EXT_GOALS = 'goals';
export const EXT_ORGANIZE = 'organize';

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

export const OFFICIAL_EXTENSIONS: ExtensionManifest[] = [
  {
    slug: EXT_GOALS,
    name: 'Goals',
    // Says what it costs as well as what it buys. A goal is a third container
    // role on top of projects and routines, and someone who has not asked for
    // one should be able to read this row and decide they do not want it.
    description:
      'Long-term goals with milestones and check-ins, plus a Goal filter and grouping. A goal hides nothing — it only says why work matters.',
    icon: Target,
    category: 'planning',
    defaultEnabled: false,
  },
  {
    slug: EXT_ORGANIZE,
    name: 'Organize console',
    description:
      'One console for bulk container management — routines, programs, projects, item types, habit groups and the trash.',
    icon: FolderCog,
    category: 'planning',
    defaultEnabled: false,
  },
  {
    slug: EXT_HABIT_HEATMAP,
    name: 'Habit heatmap',
    description: 'A six-month completion grid in the item panel for anything with a streak.',
    icon: CalendarRange,
    category: 'habits',
    defaultEnabled: false,
  },
  {
    slug: EXT_COMPLETION_CONFETTI,
    name: 'Completion confetti',
    description: 'A small burst when you complete something. Purely celebratory.',
    icon: PartyPopper,
    category: 'fun',
    defaultEnabled: false,
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
  },
  {
    slug: EXT_SMS_NUDGE,
    name: 'Text me',
    description: 'Sends reminders as a text message through Twilio. Needs a Twilio account.',
    icon: MessageSquare,
    category: 'integrations',
    defaultEnabled: false,
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
  },
  {
    slug: EXT_BEEMINDER,
    name: 'Beeminder',
    description: 'Posts each completed habit to a Beeminder goal, where missing costs real money.',
    icon: LineChart,
    category: 'habits',
    defaultEnabled: false,
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
  },
  {
    slug: EXT_ACCOUNTABILITY_PARTNER,
    name: 'Accountability partner',
    description: 'Sends a short daily digest to a Slack or Discord webhook. Someone expecting it is the point.',
    icon: Users,
    category: 'habits',
    defaultEnabled: false,
  },
];

export function extensionManifest(slug: string): ExtensionManifest | undefined {
  return OFFICIAL_EXTENSIONS.find((extension) => extension.slug === slug);
}

/** Resolve a slug against sparse per-user rows, falling back to the manifest default. */
export function resolveEnabled(enabled: Record<string, boolean>, slug: string): boolean {
  return enabled[slug] ?? extensionManifest(slug)?.defaultEnabled ?? false;
}
