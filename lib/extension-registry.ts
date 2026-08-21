import {
  CalendarRange,
  MessageSquare,
  PartyPopper,
  PhoneCall,
  Speaker,
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
  category: 'habits' | 'views' | 'integrations' | 'fun';
  /** What a user who never touched the toggle gets. Extensions are opt-in. */
  defaultEnabled: boolean;
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

export const OFFICIAL_EXTENSIONS: ExtensionManifest[] = [
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
];

export function extensionManifest(slug: string): ExtensionManifest | undefined {
  return OFFICIAL_EXTENSIONS.find((extension) => extension.slug === slug);
}

/** Resolve a slug against sparse per-user rows, falling back to the manifest default. */
export function resolveEnabled(enabled: Record<string, boolean>, slug: string): boolean {
  return enabled[slug] ?? extensionManifest(slug)?.defaultEnabled ?? false;
}
