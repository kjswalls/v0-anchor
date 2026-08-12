import type { Priority } from './planner-types';

/**
 * The filter vocabulary, and the pure predicates over it.
 *
 * Deliberately store-free — `lib/day-items.ts` is documented pure and imports
 * only planner-types + recurrence, and it needs these. Phase 1 adds the
 * registry-backed pass-through rule here; Phase 0 is just the container
 * vocabulary and the shape.
 */

/**
 * A container reference is `<kind>:<name>`.
 *
 * Prefixed because Project and Habit Group are ONE filter axis with two
 * namespaces, and the namespaces collide: DEFAULT_PROJECTS and
 * DEFAULT_HABIT_GROUPS both seed Work / Wellness / Personal, so a bare "Work"
 * cannot say which one it means. The prefix is also what lets a single
 * `containers: string[]` carry both without a discriminated shape.
 */
export type ContainerKind = 'project' | 'group';

/** Sentinel for "carries this axis, but the value is unset". */
export const NO_CONTAINER = 'none:';

export const containerRef = (kind: ContainerKind, name: string): string => `${kind}:${name}`;

/** `project:Work` → `Work`. An unprefixed legacy value is returned as-is. */
export function containerName(ref: string): string {
  const i = ref.indexOf(':');
  return i === -1 ? ref : ref.slice(i + 1);
}

/** `project:Work` → `project`, or null when the ref carries no namespace. */
export function containerKindOf(ref: string): ContainerKind | null {
  const i = ref.indexOf(':');
  if (i === -1) return null;
  const kind = ref.slice(0, i);
  return kind === 'project' || kind === 'group' ? kind : null;
}

/** The `project:` half of a container selection, as bare names. */
export function projectNamesFrom(containers: string[]): string[] {
  return containers.filter((c) => c.startsWith('project:')).map(containerName);
}

/** The `group:` half of a container selection, as bare names. */
export function groupNamesFrom(containers: string[]): string[] {
  return containers.filter((c) => c.startsWith('group:')).map(containerName);
}

/**
 * One filter set. Held separately by the braindump and the canvas — only the
 * shape is shared. See lib/view-store.ts for why it used to be four types.
 */
export interface ViewFilters {
  containers: string[];
  priorities: Priority[];
  hideFinished: boolean;
}

export const EMPTY_VIEW_FILTERS: ViewFilters = {
  containers: [],
  priorities: [],
  hideFinished: false,
};

/**
 * Rehydrate a filter object from whatever an existing localStorage payload
 * holds.
 *
 * Load-bearing, not defensive dressing: see the `merge` note on view-store's
 * persist config. A stored blob predates `containers`/`hideFinished` and
 * carries `projects`/`hideCompleted`, so without this every existing install
 * reads `filters.containers` as `undefined` and `.length` throws.
 *
 * Legacy `projects` held bare names which were project names by construction,
 * so they map into the `project:` namespace. An already-prefixed value passes
 * through untouched, which makes this safe to re-run.
 */
export function normalizeFilters(raw: unknown): ViewFilters {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_VIEW_FILTERS };
  const f = raw as Record<string, unknown>;

  const containers = Array.isArray(f.containers)
    ? (f.containers as string[])
    : Array.isArray(f.projects)
      ? (f.projects as string[]).map((name) =>
          name.includes(':') ? name : containerRef('project', name)
        )
      : [];

  return {
    containers,
    priorities: Array.isArray(f.priorities) ? (f.priorities as Priority[]) : [],
    hideFinished:
      typeof f.hideFinished === 'boolean'
        ? f.hideFinished
        : typeof f.hideCompleted === 'boolean'
          ? f.hideCompleted
          : false,
  };
}

/** True when nothing is narrowing the view. */
export const isEmptyFilters = (f: ViewFilters): boolean =>
  f.containers.length === 0 && f.priorities.length === 0 && !f.hideFinished;

/** How many clauses are active — the trigger's dot and the reset row's count. */
export const activeFilterCount = (f: ViewFilters): number =>
  f.containers.length + f.priorities.length + (f.hideFinished ? 1 : 0);
