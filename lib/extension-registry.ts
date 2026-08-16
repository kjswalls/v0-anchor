import { CalendarRange, PartyPopper, type LucideIcon } from 'lucide-react';

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
];

export function extensionManifest(slug: string): ExtensionManifest | undefined {
  return OFFICIAL_EXTENSIONS.find((extension) => extension.slug === slug);
}

/** Resolve a slug against sparse per-user rows, falling back to the manifest default. */
export function resolveEnabled(enabled: Record<string, boolean>, slug: string): boolean {
  return enabled[slug] ?? extensionManifest(slug)?.defaultEnabled ?? false;
}
