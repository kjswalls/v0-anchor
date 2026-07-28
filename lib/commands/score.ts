/**
 * Text scoring, shared by the command matcher (lib/commands/match.ts) and the
 * entity picker (lib/commands/entities.ts).
 *
 * It lives in its own module because entities.ts is imported BY the registry
 * and match.ts imports the registry — scoring in match.ts would close that
 * loop. Nothing here reads app state.
 */

export const NO_MATCH = -1;

/** Higher is better; NO_MATCH means the query does not apply to this text. */
export function scoreText(query: string, text: string): number {
  if (!query) return 0;
  const t = text.toLowerCase();
  if (t === query) return 1000;
  if (t.startsWith(query)) return 800;

  const words = t.split(/[\s/&–—-]+/);
  // Word-boundary prefix: "com" hits "Toggle completed tasks".
  if (words.some((word) => word.startsWith(query))) return 600;
  if (t.includes(query)) return 400;
  // The reverse: the QUERY starts with one of the words. People type plurals
  // for singular labels — "habits" would otherwise miss "Add habit" entirely.
  // Guarded on length so three-letter words ("Set theme" vs "settings") don't
  // drag in half the registry.
  if (words.some((word) => word.length >= 4 && query.startsWith(word))) return 350;

  return NO_MATCH;
}

/**
 * Aliases outrank every other signal. `/dark` has to land on Dark, not on
 * whichever command happens to have "dark" earlier in its label.
 */
export function scoreAliases(query: string, aliases: string[] | undefined): number {
  if (!query || !aliases?.length) return NO_MATCH;
  if (aliases.some((alias) => alias === query)) return 1200;
  if (aliases.some((alias) => alias.startsWith(query))) return 700;
  return NO_MATCH;
}

export function scoreKeywords(query: string, keywords: string | undefined): number {
  if (!query || !keywords) return NO_MATCH;
  const words = keywords.toLowerCase().split(/\s+/);
  if (words.some((w) => w === query)) return 300;
  if (words.some((w) => w.startsWith(query))) return 250;
  return keywords.toLowerCase().includes(query) ? 200 : NO_MATCH;
}
