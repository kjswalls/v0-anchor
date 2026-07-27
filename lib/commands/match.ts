import { COMMAND_GROUPS, isAvailable, isHidden, resolveLabel } from './types';
import type { Command, CommandArgOption, CommandContext, CommandGroupId } from './types';
import { COMMANDS, COMMAND_ORDER } from './registry';
import {
  frequencyBoost,
  recentCommandIds,
  type CommandUsageEntry,
} from '../command-usage-store';

/**
 * Ranking for the palette.
 *
 * The omnibar runs cmdk with shouldFilter={false} and does all its own
 * filtering, which was a pair of `includes()` calls back when there were six
 * commands. At this size that ranks badly — "task" would surface "Toggle
 * end-of-day review" above "Add task" — so scoring is explicit: exact label,
 * then label prefix, then word prefix, then substring, then keywords, with
 * measured usage and declaration order breaking ties.
 */

export interface CommandRow {
  /**
   * Unique within a rendered list, and the cmdk item `value`.
   *
   * It must encode the bound argument, not just the command id: a flattened
   * enum emits several rows for ONE command, and cmdk keys selection off
   * `value`, so identical values collapse into a single selectable item and
   * arrow-key navigation desyncs from what is painted.
   */
  value: string;
  command: Command;
  /** Set when the row is a flattened enum option that runs in one step. */
  arg?: CommandArgOption;
  label: string;
  group: CommandGroupId;
  disabled: boolean;
  score: number;
}

const NO_MATCH = -1;

/** Higher is better; NO_MATCH means the query does not apply to this text. */
function scoreText(query: string, text: string): number {
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
function scoreAliases(query: string, aliases: string[] | undefined): number {
  if (!query || !aliases?.length) return NO_MATCH;
  if (aliases.some((alias) => alias === query)) return 1200;
  if (aliases.some((alias) => alias.startsWith(query))) return 700;
  return NO_MATCH;
}

function scoreKeywords(query: string, keywords: string | undefined): number {
  if (!query || !keywords) return NO_MATCH;
  const words = keywords.toLowerCase().split(/\s+/);
  if (words.some((w) => w === query)) return 300;
  if (words.some((w) => w.startsWith(query))) return 250;
  return keywords.toLowerCase().includes(query) ? 200 : NO_MATCH;
}

/**
 * Flattened option rows sit one notch below a plain command at the same
 * textual score, so a built-in always wins a tie against a value nested
 * under another command.
 */
const FLATTENED_PENALTY = 30;

export interface MatchOptions {
  usage?: Record<string, CommandUsageEntry>;
  /** Cap the result set — the mobile panel has room for far fewer rows. */
  limit?: number;
}

export function matchCommands(
  query: string,
  ctx: CommandContext,
  options: MatchOptions = {}
): CommandRow[] {
  const q = query.trim().toLowerCase();
  const usage = options.usage ?? {};
  const rows: CommandRow[] = [];

  for (const command of COMMANDS) {
    if (isHidden(command, ctx)) continue;

    const label = resolveLabel(command, ctx);
    const disabled = !isAvailable(command, ctx);
    const boost = frequencyBoost(usage, command.id);

    // The command itself. Score against both the canonical label (what the
    // matcher is specced on) and the displayed one, which may differ —
    // "Toggle completed tasks" vs the rendered "Hide completed tasks".
    const own = Math.max(
      scoreAliases(q, command.aliases),
      scoreText(q, command.label),
      scoreText(q, label),
      scoreKeywords(q, command.keywords)
    );
    if (own !== NO_MATCH) {
      rows.push({
        value: `cmd:${command.id}`,
        command,
        label,
        group: command.group,
        disabled,
        score: own + boost,
      });
    }

    // Flattened enum options become their own rows, but only once the user has
    // typed. Showing every option at rest would triple the resting list on a
    // surface with ~320px of vertical room.
    const arg = command.argument;
    if (!q || !arg || arg.kind !== 'enum' || !arg.flatten) continue;

    for (const option of arg.options(ctx)) {
      const optionScore = Math.max(
        scoreAliases(q, option.aliases),
        scoreText(q, option.label),
        scoreText(q, `${command.label} ${option.label}`),
        scoreKeywords(q, option.keywords)
      );
      if (optionScore === NO_MATCH) continue;
      rows.push({
        value: `cmd:${command.id}::${option.value}`,
        command,
        arg: option,
        label: `${label} → ${option.label}`,
        group: command.group,
        disabled,
        score: optionScore + boost - FLATTENED_PENALTY,
      });
    }
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ai = COMMAND_ORDER.get(a.command.id) ?? 0;
    const bi = COMMAND_ORDER.get(b.command.id) ?? 0;
    if (ai !== bi) return ai - bi;
    // Same command: the plain row before its flattened options.
    return (a.arg ? 1 : 0) - (b.arg ? 1 : 0);
  });

  return options.limit ? rows.slice(0, options.limit) : rows;
}

/**
 * The "Recent" group — a custom-commands section that needs no authoring UI
 * and is non-empty after your very first command.
 */
export function recentRows(
  ctx: CommandContext,
  usage: Record<string, CommandUsageEntry>,
  limit = 4
): CommandRow[] {
  const rows: CommandRow[] = [];
  for (const id of recentCommandIds(usage, limit * 2)) {
    const command = COMMANDS.find((c) => c.id === id);
    if (!command || isHidden(command, ctx)) continue;
    rows.push({
      // Prefixed so it never collides with the same command's row in its own
      // group further down the list.
      value: `recent:${command.id}`,
      command,
      label: resolveLabel(command, ctx),
      group: 'recent',
      disabled: !isAvailable(command, ctx),
      score: 0,
    });
    if (rows.length === limit) break;
  }
  return rows;
}

/** Rows bucketed into palette render order; empty groups are dropped. */
export function groupRows(rows: CommandRow[]): { id: CommandGroupId; heading: string; rows: CommandRow[] }[] {
  return COMMAND_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.group === group.id),
  })).filter((group) => group.rows.length > 0);
}

/** Options for a command in argument mode, filtered by the typed value. */
export function matchArgOptions(
  command: Command,
  query: string,
  ctx: CommandContext
): CommandArgOption[] {
  const arg = command.argument;
  if (!arg || arg.kind !== 'enum') return [];
  const all = arg.options(ctx);
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all
    .map((option) => ({
      option,
      score: Math.max(
        scoreAliases(q, option.aliases),
        scoreText(q, option.label),
        scoreKeywords(q, option.keywords)
      ),
    }))
    .filter((entry) => entry.score !== NO_MATCH)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.option);
}
