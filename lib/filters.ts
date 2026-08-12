import type { Habit, Item, Priority, Task } from './planner-types';
import { getItemTypeConfig } from './item-registry';

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
 * "Carries the field, but the value is unset."
 *
 * A first-class value, not an absence. `buildListGroups` has always minted
 * "No priority" / "No project" buckets for GROUPING; the filter path never
 * learned about them, so "show me High" silently deleted every task whose
 * priority was never set — which is most of them.
 *
 * 'none' is safe as the priority sentinel: it is already the item dialog's
 * draft vocabulary for unset (item-dialog.tsx:279) and is converted to
 * `undefined` before every write (`:336`, `:747`), so no stored item can carry
 * it as a real value.
 */
export const NO_PRIORITY = 'none';
export type PriorityFilterValue = Priority | typeof NO_PRIORITY;

/**
 * One filter set. Held separately by the braindump and the canvas — only the
 * shape is shared. See lib/view-store.ts for why it used to be four types.
 */
export interface ViewFilters {
  containers: string[];
  priorities: PriorityFilterValue[];
  hideFinished: boolean;
}

/* ── the pass-through rule ─────────────────────────────────────────────── */

/**
 * THE RULE: a predicate on field F may only exclude items of a type that
 * CARRIES F. Types where F is absent pass through untouched.
 *
 * What it replaces: three copies of `if (priorities.length || projects.length)
 * return []` — one per surface — which deleted every habit the moment any
 * priority or project filter was on. Habits carry neither field, so the filter
 * silently meant "and also hide all habits". It was commented as intended.
 *
 * `fields` is Object.keys(taskShape)/Object.keys(habitShape), so it cannot
 * drift from the schemas, and ItemDialog already interrogates it exactly this
 * way (`config.fields.includes('duration')`).
 */
export function fieldApplies(typeName: string, field: string): boolean {
  return getItemTypeConfig(typeName).fields.includes(field);
}

/**
 * The registry type name for a projection row or a full Item.
 *
 * The projections carry their runtime discriminator, so a row from `tasks` is
 * an Item in all but declared type. `tasks` is task-LIKE — custom-type items
 * ride it — which is why this resolves the registry name rather than assuming
 * 'task'.
 */
export function typeNameOf(row: Task | Habit | Item): string {
  const r = row as { type?: string; customType?: string };
  if (r.type === 'custom') return r.customType ?? 'custom';
  return r.type ?? 'task';
}

/**
 * The container this item answers with, as a prefixed ref — or `null` when its
 * type carries no container axis at all (pass-through).
 *
 * This is the load-bearing half of the habits fix. A habit is not
 * container-less: it answers with its GROUP. The axis is one question resolved
 * per type through the registry's `containerKind`, so a habit is excluded from
 * "show me Work" because its group is not selected, never because it cannot be
 * asked.
 *
 * An empty string counts as unset, not as a container named "". itemFromRow
 * maps `group: row.group ?? ''` (db.ts:108), so '' is a real live value and is
 * exactly what "No group" must catch.
 */
export function containerRefOf(row: Task | Habit | Item, typeName = typeNameOf(row)): string | null {
  const kind = getItemTypeConfig(typeName).containerKind;
  if (kind === 'projects') {
    const project = (row as { project?: string }).project;
    return project ? containerRef('project', project) : NO_CONTAINER;
  }
  if (kind === 'habitGroups') {
    const group = (row as { group?: string }).group;
    return group ? containerRef('group', group) : NO_CONTAINER;
  }
  return null;
}

/**
 * Habit-group refs compare case-INSENSITIVELY; project refs compare exactly.
 *
 * Not a preference — the seeds collide on case. makeAddDraft writes a lowercase
 * 'personal' (item-dialog.tsx:383-387) against DEFAULT_HABIT_GROUPS'
 * capitalised 'Personal', and the codebase already case-folds groups at
 * group-section.tsx and in getHabitGroupColor. A project name is typed once by
 * the user and is compared exactly everywhere else, so folding it here would be
 * the odd one out.
 */
const sameContainer = (a: string, b: string): boolean =>
  a === b || (a.startsWith('group:') && b.startsWith('group:') && a.toLowerCase() === b.toLowerCase());

/** Empty selection = no-op. Otherwise the rule above, then membership. */
export function passesContainerFilter(
  row: Task | Habit | Item,
  containers: string[],
  typeName = typeNameOf(row)
): boolean {
  if (containers.length === 0) return true;
  const ref = containerRefOf(row, typeName);
  if (ref === null) return true; // carries no container axis — pass through
  return containers.some((c) => sameContainer(c, ref));
}

/** Empty selection = no-op. Habits carry no priority, so they pass through. */
export function passesPriorityFilter(
  row: Task | Habit | Item,
  priorities: PriorityFilterValue[],
  typeName = typeNameOf(row)
): boolean {
  if (priorities.length === 0) return true;
  if (!fieldApplies(typeName, 'priority')) return true;
  const value = (row as { priority?: Priority }).priority ?? NO_PRIORITY;
  return priorities.includes(value);
}

/**
 * Both narrowing axes. `hideFinished` is deliberately NOT here — "finished" is
 * a question about a DATE (completed-on, skipped-on), and this module is
 * date-blind. Each surface applies it beside its own date logic.
 */
export function passesFilters(
  row: Task | Habit | Item,
  filters: ViewFilters,
  typeName = typeNameOf(row)
): boolean {
  return (
    passesPriorityFilter(row, filters.priorities, typeName) &&
    passesContainerFilter(row, filters.containers, typeName)
  );
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
 * Legacy `projects` held bare names which were project names by construction —
 * both writers stored `project.name` verbatim — so they map into the `project:`
 * namespace UNCONDITIONALLY.
 *
 * Not "unless it already looks prefixed". Project names are unvalidated free
 * text (manage-categories only trims; there is no CHECK constraint), so a
 * project called "Client: Acme" would fail a contains-a-colon test and be left
 * bare — after which `projectNamesFrom` drops it, the project filter silently
 * stops narrowing, and the habits-wipe stops firing, while the trigger still
 * counts it as one active clause. The filter reads as active and does nothing.
 *
 * Re-run safety comes from branch ORDER, not from inspecting the value: output
 * always carries `containers`, so a second pass takes the first branch and
 * never reaches here.
 */
export function normalizeFilters(raw: unknown): ViewFilters {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_VIEW_FILTERS };
  const f = raw as Record<string, unknown>;

  const containers = Array.isArray(f.containers)
    ? (f.containers as string[])
    : Array.isArray(f.projects)
      ? (f.projects as string[]).map((name) => containerRef('project', name))
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
