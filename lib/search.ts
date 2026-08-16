import type { Item, Task, Habit } from './planner-types';
import { getAllItemTypeNames, getItemTypeConfig } from './item-registry';
import { passesContainerFilter, typeNameOf } from './filters';
import { containerRef } from './container-registry';

/**
 * Pure search parsing + matching for the omnibar (and anything else that
 * needs it). Extracted per the redesign plan; behaviour is specified by
 * tests/unit/search-parser.test.ts.
 *
 * Keyword grammar:
 *   task:foo      → type filter 'task', "foo" becomes search text
 *   habit:foo     → type filter 'habit', "foo" becomes search text
 *   type:goal     → type filter by registry name (custom types; also accepts
 *                   type:task / type:habit)
 *   priority:high → priority filter (low|medium|high), value consumed
 *   project:Name  → project filter, value consumed
 * Unknown "word:value" tokens are treated as plain text.
 */

export interface ParsedSearchQuery {
  text: string;
  /** 'task' | 'habit' | a custom type slug. */
  type: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  project: string | null;
}

const PRIORITIES = ['low', 'medium', 'high'] as const;

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = { text: '', type: null, priority: null, project: null };
  const textParts: string[] = [];

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const sep = token.indexOf(':');
    if (sep > 0) {
      const keyword = token.slice(0, sep).toLowerCase();
      const value = token.slice(sep + 1);

      if (keyword === 'task' || keyword === 'habit') {
        result.type = keyword;
        if (value) textParts.push(value);
        continue;
      }
      if (keyword === 'type' && value) {
        result.type = value.toLowerCase();
        continue;
      }
      if (keyword === 'priority' && (PRIORITIES as readonly string[]).includes(value.toLowerCase())) {
        result.priority = value.toLowerCase() as ParsedSearchQuery['priority'];
        continue;
      }
      if (keyword === 'project' && value) {
        result.project = value;
        continue;
      }
    }
    textParts.push(token);
  }

  result.text = textParts.join(' ');
  return result;
}

export interface SearchResults {
  tasks: Task[];
  habits: Habit[];
}

// typeNameOf moved to lib/filters.ts — the filter predicates need the same
// resolution, and two copies of "which registry type is this row" is exactly
// how the four filter shapes drifted apart.

export function searchItems(raw: string, tasks: Task[], habits: Habit[]): SearchResults {
  const query = parseSearchQuery(raw);
  const text = query.text.toLowerCase();
  const hasQuery = text.length > 0 || query.type !== null || query.priority !== null || query.project !== null;
  if (!hasQuery) return { tasks: [], habits: [] };

  const matchText = (title: string, context?: string) =>
    text.length === 0 ||
    title.toLowerCase().includes(text) ||
    (context?.toLowerCase().includes(text) ?? false);

  const matchedTasks =
    query.type === 'habit'
      ? []
      : tasks.filter(
          (t) =>
            (query.type === null || typeNameOf(t) === query.type) &&
            matchText(t.title, t.project) &&
            (query.priority === null || t.priority === query.priority) &&
            (query.project === null ||
              (t.project?.toLowerCase() ?? '') === query.project.toLowerCase())
        );

  /**
   * A QUERY is not a view filter, so the pass-through rule lands differently
   * here — and the two tokens split.
   *
   * `priority:` still excludes habits, and that is correct rather than a wipe:
   * the user asked for high-priority things, a habit has no priority, so no
   * habit is one. Passing them through would answer a narrow question with the
   * whole list. (The canvas filter is the opposite case: there the user is
   * shaping a view, and deleting a whole class of work they never mentioned is
   * the surprise.)
   *
   * `project:` DID wipe, and that was wrong. It is the container axis, and a
   * habit answers it with its group — so `project:Health` now finds the habits
   * in the Health group instead of silently returning none. One axis, resolved
   * per type (see lib/filters.ts containerRefOf).
   */
  const matchedHabits =
    (query.type !== null && query.type !== 'habit') || query.priority !== null
      ? []
      : habits.filter(
          (h) =>
            matchText(h.title, h.group) &&
            (query.project === null ||
              passesContainerFilter(h, [containerRef('group', query.project)]))
        );

  return { tasks: matchedTasks, habits: matchedHabits };
}

export interface SearchGroup {
  /** Registry type name — 'task', 'habit', or a custom slug. */
  type: string;
  /** Section heading: the type's plural label. */
  heading: string;
  items: Item[];
}

/**
 * Rows per section. The built-ins keep the counts the omnibar shipped with, so
 * a workspace with no custom types sees exactly what it saw before; a new type
 * gets a section of its own rather than being filed under Tasks because it
 * happens to ride the task pipeline.
 */
const GROUP_LIMITS: Record<string, number> = { task: 6, habit: 4 };
const GROUP_LIMIT_DEFAULT = 4;
/** Ceiling across all sections — five matching types must not fill the panel. */
const TOTAL_LIMIT = 12;

/**
 * Splits a result set into one section per item type, in registry order
 * (built-ins first, then custom types as the user ordered them).
 *
 * Items whose type is no longer in the registry — a type deleted while its
 * items remain — keep their own section at the end rather than disappearing;
 * getItemTypeConfig falls back to a template for the heading.
 */
export function groupResults(results: SearchResults): SearchGroup[] {
  const byType = new Map<string, Item[]>();
  for (const row of [...results.tasks, ...results.habits] as unknown as Item[]) {
    const name = typeNameOf(row);
    const bucket = byType.get(name);
    if (bucket) bucket.push(row);
    else byType.set(name, [row]);
  }

  const known = getAllItemTypeNames().filter((name) => byType.has(name));
  const orphaned = [...byType.keys()].filter((name) => !known.includes(name));

  const order = [...known, ...orphaned].filter((type) => (byType.get(type)?.length ?? 0) > 0);

  const groups: SearchGroup[] = [];
  let budget = TOTAL_LIMIT;
  for (let i = 0; i < order.length; i++) {
    const type = order[i];
    // Hold back one row for each section still to come, so a matching type is
    // never dropped outright — it shrinks to a single row first. (Past ~12
    // matching types even that runs out, and the tail is cut.)
    const reserved = order.length - i - 1;
    const limit = Math.min(GROUP_LIMITS[type] ?? GROUP_LIMIT_DEFAULT, budget - reserved);
    if (limit < 1) break;
    const items = (byType.get(type) ?? []).slice(0, limit);
    budget -= items.length;
    groups.push({ type, heading: getItemTypeConfig(type).labelPlural, items });
  }
  return groups;
}
