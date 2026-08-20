import type { ItemTypeConfig } from './item-registry';

/**
 * container-registry.ts — what each KIND of container is, and how its
 * references behave.
 *
 * The sibling of item-registry.ts, and the same bargain: every place the app
 * used to ask "is this a project or a habit group?" asks the registry a
 * capability question instead. Adding a kind means adding config.
 *
 * ── the three roles ──────────────────────────────────────────────────────────
 *
 * Anchor has five container tables and they are not five of a kind. Two say
 * what an item IS ABOUT, two say WHEN IT COUNTS, and one says WHY IT MATTERS —
 * and that difference decides every question anyone asks about them:
 *
 *   CLASSIFY — projects, habit groups. Exactly one per item, stored as a name on
 *     the item itself (`items.project` / `items.group`). One item, one answer, so
 *     they are a partition: filterable, groupable, and the thing a coloured dot
 *     names. This is the "container axis" the Display menu speaks about.
 *
 *   GATE — routines, programs. Many-to-many through join tables, and membership
 *     does not describe the work, it SWITCHES it — pausing a routine takes its
 *     members off the grid. An item can sit in three routines at once, so there
 *     is no "the" routine to file it under; `lib/grouping.ts` groups by routine
 *     only through a documented first-claim-wins rule, and the Display menu
 *     deliberately offers no routine FILTER because the scope rail already owns
 *     that question per-date, through the DB, with a resume date.
 *
 *   ASPIRE — goals. Many-to-many like a gate, but membership switches NOTHING:
 *     a goal says why work matters, and a goal you are behind on is the last
 *     thing that should quietly hide its work. Its members carry a ROLE
 *     (`member` | `milestone` | `checkin`, on goal_items), which is the one
 *     thing no other kind has — and the reason it is a role of its own rather
 *     than a gate with suppression turned off: an item can sit in a goal AND a
 *     program at once (the Chinese habit inside the school-year program), so
 *     the two questions have to be asked separately or the answers merge.
 *
 * The seam is enforced by types, not by convention: `ClassifyKind` is what a ref
 * can name and what `containerRefOf` returns; `GateKind` is what `ScopeKind` is
 * and what `ActivationContext` carries; `AspireKind` is neither, and nothing
 * downstream widens to it. So a routine cannot leak into a filter clause, a
 * project cannot gate a day, and a goal can do neither — which is why adding
 * this kind needed no edit in filters.ts, grouping.ts or scope-rail.ts.
 *
 * A NOTE ON DISCOVERY, because the obvious assumption is wrong: widening
 * `ContainerKind` does NOT light up the codebase with exhaustive-switch errors.
 * There are no switches over it — every consumer narrows to `ClassifyKind` or
 * `GateKind` first, which is exactly the property above. The compiler forces
 * one edit (the `CONTAINER_KINDS` record) and the role-partition test in
 * tests/unit/container-registry.test.ts forces the rest of the thinking. A
 * sixth kind's real touchpoints are hand-wired and listed in its plan.
 *
 * ── what is deliberately NOT here ────────────────────────────────────────────
 *
 * `item_types` is the fifth table and stays out. A type is what a thing IS, not
 * what it belongs to; it already has its own registry, and folding it in here
 * would make "which container does this item answer with" ambiguous at the one
 * call site that has to be unambiguous (`containerRefOf`).
 *
 * CUSTOM container kinds are not v1. The five below are the five tables that
 * exist; `CONTAINER_KINDS` is a closed record, so a sixth is a type error at
 * the record itself rather than a silent fallthrough.
 *
 * The table names and the id columns are not here either. Migration 027
 * (`feat/organize-console`, organize-console.md Phase 0) gives items
 * `project_id` and `group_id`, and the resolution that goes with them lives with
 * that work — this module stays pure and store-free, so it has nothing to
 * resolve a name against. A config field no code reads is a field that drifts.
 *
 * NOTE the id design is TWO columns, one per kind, not one `container_id`. This
 * registry's own "one axis, two namespaces" framing would suggest a single
 * column; 027 chose two so each can carry a real foreign key with ON DELETE SET
 * NULL, which one column pointing at either of two tables cannot. The axis stays
 * one axis app-side regardless — that is what `itemField` is for, and an id
 * field would join it the same way.
 */

/** Kinds an item answers with. One per item; the filter/group axis. */
export type ClassifyKind = 'project' | 'group';
/** Kinds that switch items off. Many-to-many; the scope rail's axis. */
export type GateKind = 'routine' | 'program';
/**
 * Kinds that say why work matters. Many-to-many, and they suppress NOTHING —
 * deliberately not a `GateKind`, so a goal can never reach a resolver.
 */
export type AspireKind = 'goal';
export type ContainerKind = ClassifyKind | GateKind | AspireKind;

export type ContainerRole = 'classify' | 'gate' | 'aspire';

/** The `ItemTypeConfig.containerKind` vocabulary, read from the source so it cannot drift. */
type ItemTypeContainerKind = ItemTypeConfig['containerKind'];

export interface ContainerKindConfig {
  kind: ContainerKind;
  role: ContainerRole;
  /** Singular noun, as the user sees it. */
  label: string;
  labelPlural: string;
  /**
   * The heading for "carries this axis, value unset" — `null` on gates, which
   * have no unset state (an item is in a routine or it is not).
   *
   * Per-kind rather than one shared "No container" because the two sides of the
   * axis are visibly different work: "No project" over a stack of habits is
   * false, and habits are exactly what the axis used to hoist out of the
   * question. The FILTER still needs one checkbox catching both sides — that is
   * `NO_CONTAINER`, undecorated — but a heading has room to say which side it is.
   */
  unsetLabel: string | null;
  /**
   * The `Item` field naming this container, or `null` for gates (their
   * membership lives in join tables, never on the item).
   */
  itemField: 'project' | 'group' | null;
  /** The `ItemTypeConfig.containerKind` value that resolves to this kind, or null. */
  itemTypeKey: ItemTypeContainerKind;
  /**
   * Do two refs of this kind compare case-INSENSITIVELY?
   *
   * True for habit groups and only for habit groups, and it is not a
   * preference. `makeAddDraft` writes a lowercase 'personal'
   * (item-dialog.tsx:383-387) against DEFAULT_HABIT_GROUPS' capitalised
   * 'Personal' whenever the groups list has not loaded yet, so both spellings
   * live in real data and must select together. A project name is typed once by
   * the user and compared exactly everywhere else, so folding it would make it
   * the odd one out.
   *
   * This flag is the WHOLE policy: it is read at exactly one site,
   * `foldContainerName`, which `foldRef` and `sameContainerName` are both built
   * from — so every comparison, every group key and every store lookup answers
   * through it.
   *
   * What that buys is a one-line change if the policy ever moves. It is NOT the
   * same as the stored data being normalized: an account holding both `Work` and
   * `work` as habit groups still holds two rows, and folding only decides which
   * one a name resolves to. Merging them is a data decision with a visible
   * consequence (which colour and which icon survive) and belongs to whoever
   * runs the migration, not here.
   */
  caseFold: boolean;
}

export const CONTAINER_KINDS: Record<ContainerKind, ContainerKindConfig> = {
  project: {
    kind: 'project',
    role: 'classify',
    label: 'Project',
    labelPlural: 'Projects',
    unsetLabel: 'No project',
    itemField: 'project',
    itemTypeKey: 'projects',
    caseFold: false,
  },
  group: {
    kind: 'group',
    role: 'classify',
    label: 'Group',
    labelPlural: 'Habit Groups',
    unsetLabel: 'No group',
    itemField: 'group',
    itemTypeKey: 'habitGroups',
    caseFold: true,
  },
  routine: {
    kind: 'routine',
    role: 'gate',
    label: 'Routine',
    labelPlural: 'Routines',
    unsetLabel: null,
    itemField: null,
    itemTypeKey: null,
    caseFold: false,
  },
  program: {
    kind: 'program',
    role: 'gate',
    label: 'Program',
    labelPlural: 'Programs',
    unsetLabel: null,
    itemField: null,
    itemTypeKey: null,
    caseFold: false,
  },
  goal: {
    kind: 'goal',
    role: 'aspire',
    label: 'Goal',
    labelPlural: 'Goals',
    // No unset state, like the gates: an item serves a goal or it does not.
    unsetLabel: null,
    // Membership lives in goal_items, never on the item — which is what lets it
    // carry a role, and what keeps `items` (and therefore the pinned legacy
    // projections) untouched by this whole feature.
    itemField: null,
    // No item TYPE resolves against goals. `containerKind` on an item type
    // answers "which container does this type file itself under", and a goal
    // files nothing — every type may join one.
    itemTypeKey: null,
    caseFold: false,
  },
};

export const getContainerKindConfig = (kind: ContainerKind): ContainerKindConfig =>
  CONTAINER_KINDS[kind];

/**
 * Derived from the roles, never hand-listed — a fifth kind joins the right list
 * by declaring its role, and cannot be forgotten in one of two places.
 */
export const CLASSIFY_KINDS: readonly ClassifyKind[] = Object.values(CONTAINER_KINDS)
  .filter((c): c is ContainerKindConfig & { kind: ClassifyKind } => c.role === 'classify')
  .map((c) => c.kind);

export const GATE_KINDS: readonly GateKind[] = Object.values(CONTAINER_KINDS)
  .filter((c): c is ContainerKindConfig & { kind: GateKind } => c.role === 'gate')
  .map((c) => c.kind);

export const ASPIRE_KINDS: readonly AspireKind[] = Object.values(CONTAINER_KINDS)
  .filter((c): c is ContainerKindConfig & { kind: AspireKind } => c.role === 'aspire')
  .map((c) => c.kind);

/* ── the ref grammar ────────────────────────────────────────────────────────*/

/**
 * A container reference is `<kind>:<name>`.
 *
 * Prefixed because Project and Habit Group are ONE axis with two namespaces,
 * and a bare "Work" cannot say which one it means. The starter sets used to make
 * that concrete — DEFAULT_PROJECTS and DEFAULT_HABIT_GROUPS both seeded Work /
 * Wellness / Personal — and organize-console's Phase 6 gave them disjoint names
 * (Work/Home/Health against Morning/Movement/Wind-down) so a new account no
 * longer starts life with three ambiguous ones. The prefix stays: nothing stops
 * a user naming a project and a group the same thing, and it is also what lets a
 * single `containers: string[]` carry both without a discriminated shape.
 *
 * Only CLASSIFY kinds have refs. Routines, programs and goals are referenced by
 * id, because their names are not unique and rename ships from day one.
 */
export const containerRef = (kind: ClassifyKind, name: string): string => `${kind}:${name}`;

/** Sentinel for "carries this axis, but the value is unset". */
export const NO_CONTAINER = 'none:';

/**
 * The kind-tagged unset key — `none:project`, `none:group`.
 *
 * Grouping needs to say WHICH side of the axis is empty; the filter needs one
 * checkbox that catches both. Both live off the same sentinel so a heading key
 * can never be mistaken for a real ref (no kind is named "none").
 */
export const unsetContainerRef = (kind: ClassifyKind): string => `${NO_CONTAINER}${kind}`;

/**
 * `project:Work` → `Work`. An unprefixed legacy value is returned as-is.
 *
 * Splits on the FIRST colon only: project names are unvalidated free text
 * (manage-categories only trims; there is no CHECK constraint), so "Client:
 * Acme" is a legal name and must survive the round trip.
 */
export function containerName(ref: string): string {
  const i = ref.indexOf(':');
  return i === -1 ? ref : ref.slice(i + 1);
}

/** `project:Work` → `'project'`, or null when the ref names no known classify kind. */
export function containerKindOf(ref: string): ClassifyKind | null {
  const i = ref.indexOf(':');
  if (i === -1) return null;
  const kind = ref.slice(0, i);
  return (CLASSIFY_KINDS as readonly string[]).includes(kind) ? (kind as ClassifyKind) : null;
}

/**
 * The classify kind an item TYPE answers with, resolved from the item registry's
 * own vocabulary — `'projects'` → `'project'`, `'habitGroups'` → `'group'`.
 *
 * The two registries name the same concept differently on purpose: the item
 * registry says which TABLE a type resolves against (plural), the ref grammar
 * says which NAMESPACE a value lives in (singular). This is the one function
 * that knows both, so neither has to learn the other's spelling.
 */
export function classifyKindForItemType(itemTypeKey: ItemTypeContainerKind): ClassifyKind | null {
  for (const kind of CLASSIFY_KINDS) {
    if (CONTAINER_KINDS[kind].itemTypeKey === itemTypeKey) return kind;
  }
  return null;
}

/**
 * The comparison key for a bare NAME of a known kind — the single expression of
 * the case policy, and the one every other fold is built from.
 *
 * Names, not refs, because that is what the store holds: `items.group` is
 * `'personal'`, `habitGroups[i].name` is `'Personal'`, and every identity lookup
 * in planner-store.ts compares those two directly. Before A′ six of them
 * compared exactly and three folded by hand, which is how deleting the habit
 * group 'Personal' left a habit stored as 'personal' pointing at a row that no
 * longer existed.
 */
export function foldContainerName(kind: ClassifyKind, name: string): string {
  return CONTAINER_KINDS[kind].caseFold ? name.toLowerCase() : name;
}

/** Do these two bare names name the same container of this kind? */
export const sameContainerName = (kind: ClassifyKind, a: string, b: string): boolean =>
  foldContainerName(kind, a) === foldContainerName(kind, b);

/**
 * The comparison key for a ref.
 *
 * Everything that compares, dedupes or keys on a container ref goes through
 * here: `sameContainerRef`, and `lib/grouping.ts`'s section key. Keyed on the
 * raw ref instead, one habit group split into two sections that the menu's
 * single checkbox selected together (shipped that way for one commit).
 *
 * Unknown and unprefixed refs pass through untouched rather than being folded
 * defensively — an unprefixed value is legacy free text whose case nothing has
 * ever folded, and `none:project` is a heading key, not a name.
 */
export function foldRef(ref: string): string {
  const kind = containerKindOf(ref);
  if (!kind) return ref;
  return containerRef(kind, foldContainerName(kind, containerName(ref)));
}

/** Do these two refs name the same container? See `foldRef` for the case policy. */
export const sameContainerRef = (a: string, b: string): boolean => foldRef(a) === foldRef(b);

/** The bare names of one kind's half of a mixed selection. */
export const namesOfKind = (refs: readonly string[], kind: ClassifyKind): string[] =>
  refs.filter((ref) => containerKindOf(ref) === kind).map(containerName);
