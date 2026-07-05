import type { Task, Habit } from './planner-types';

/**
 * Pure search parsing + matching for the omnibar (and anything else that
 * needs it). Extracted per the redesign plan; behaviour is specified by
 * tests/unit/search-parser.test.ts.
 *
 * Keyword grammar:
 *   task:foo      → type filter 'task', "foo" becomes search text
 *   habit:foo     → type filter 'habit', "foo" becomes search text
 *   priority:high → priority filter (low|medium|high), value consumed
 *   project:Name  → project filter, value consumed
 * Unknown "word:value" tokens are treated as plain text.
 */

export interface ParsedSearchQuery {
  text: string;
  type: 'task' | 'habit' | null;
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
            matchText(t.title, t.project) &&
            (query.priority === null || t.priority === query.priority) &&
            (query.project === null ||
              (t.project?.toLowerCase() ?? '') === query.project.toLowerCase())
        );

  const matchedHabits =
    query.type === 'task' || query.priority !== null || query.project !== null
      ? []
      : habits.filter((h) => matchText(h.title, h.group));

  return { tasks: matchedTasks, habits: matchedHabits };
}
