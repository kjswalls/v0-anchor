import { DEFAULT_HABIT_GROUPS, DEFAULT_PROJECTS, type ContainerSeed } from './planner-types';
import type { Item } from './planner-types';

/**
 * WHAT, IF ANYTHING, TO CREATE FOR AN ACCOUNT ON ITS FIRST CONSIDERED LOAD.
 *
 * Pure, and separate from the store on purpose: this decides whether to write
 * rows into an account automatically, which is the highest-consequence automatic
 * write in the app. Every branch is reachable from a plain function call, so the
 * blast radius is testable without standing up a store or a network.
 *
 * THREE OUTCOMES, and the middle one is the reason this is not a one-liner.
 *
 *   'none'        — the account already has containers. Touch nothing at all.
 *   'new-account' — no containers AND no items. The full starter set.
 *   'adopt'       — no containers but items exist. Create ONLY the containers
 *                   those items already name, and nothing else.
 *
 * The 'adopt' branch exists because the live data made the naive rule
 * indefensible. The main account carries 763 items, zero container rows, and 119
 * habits whose `group` text reads "Personal" with nothing behind it. "Sections
 * are empty, so seed" would have written Work, Home and Health into an account
 * that has visibly never used projects — inventing three containers to fix a
 * problem about one. Adopting says the only thing the data supports: these items
 * claim a container, so give them the container they claim.
 *
 * It also fixes something the text-only reference could not. Until a row exists,
 * "Personal" cannot be renamed, cannot be given a glyph, cannot be deleted, and
 * does not appear in the console at all — while 119 items sit inside it.
 *
 * AN ACCOUNT WITH SOME CONTAINERS IS LEFT ALONE ENTIRELY, including its dangling
 * names. One live account references a project "Housework" that has no row; the
 * account has four other projects, so its owner is clearly managing them by
 * hand, and a name they have not created in all that time is a name they do not
 * want. That is today's behaviour and 027's backfill made the same call.
 *
 * TRASHED NAMES ARE EXCLUDED, and this is a correctness guard rather than
 * politeness. `projects_user_id_name_key` and `habit_groups_user_id_name_key`
 * are PLAIN unique indexes over `(user_id, name)` with no `WHERE deleted_at IS
 * NULL`, so a soft-deleted container reserves its name for the full 30 days
 * while being invisible to every `deleted_at`-filtered fetch the store makes.
 * Adopting a name the bin still holds would raise 23505 and seat exactly the
 * phantom container `undoFailedCreate` exists to clean up — from an automatic
 * write the user never asked for.
 */
export type SeedReason = 'none' | 'new-account' | 'adopt';

export interface SeedPlan {
  reason: SeedReason;
  projects: ContainerSeed[];
  groups: ContainerSeed[];
}

const NOTHING: SeedPlan = { reason: 'none', projects: [], groups: [] };

export function planSeed(input: {
  items: readonly Item[];
  projects: readonly { name: string }[];
  habitGroups: readonly { name: string }[];
  /** Container names held by soft-deleted rows — see the note above. */
  trashedProjectNames?: readonly string[];
  trashedGroupNames?: readonly string[];
}): SeedPlan {
  const { items, projects, habitGroups } = input;

  // Either list being non-empty means the account is already being managed.
  // Deliberately NOT "projects empty → seed projects": an account with habit
  // groups and no projects has made a choice, and a first-run seed is not the
  // place to second-guess it.
  if (projects.length > 0 || habitGroups.length > 0) return NOTHING;

  const heldProjects = new Set(input.trashedProjectNames ?? []);
  const heldGroups = new Set(input.trashedGroupNames ?? []);

  if (items.length === 0) {
    return {
      reason: 'new-account',
      // Filtered even here. A genuinely new account has an empty bin, but
      // "genuinely new" is an inference and 23505 is not — and the whole branch
      // is reachable by anyone who deletes every container AND every item
      // before the latch is set.
      projects: DEFAULT_PROJECTS.filter((p) => !heldProjects.has(p.name)),
      groups: DEFAULT_HABIT_GROUPS.filter((g) => !heldGroups.has(g.name)),
    };
  }

  return {
    reason: 'adopt',
    projects: adoptable(namesUsed(items, 'project'), heldProjects),
    groups: adoptable(namesUsed(items, 'group'), heldGroups),
  };
}

/**
 * The container names this account's items actually reference.
 *
 * Trimmed and de-duped EXACTLY, never case-folded, because the unique index is
 * case-sensitive: "personal" and "Personal" are two legal rows, and folding them
 * here would adopt one name for items that reference the other, leaving half of
 * them still dangling with no sign of why.
 *
 * Blank and whitespace-only values are dropped rather than adopted. They exist —
 * a cleared container used to write `''` rather than NULL — and a container
 * named "" is not something any surface can render or the user can delete.
 */
function namesUsed(items: readonly Item[], field: 'project' | 'group'): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const raw = (item as unknown as Record<string, unknown>)[field];
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * Adopted containers get a name-hashed glyph, not a picked one.
 *
 * `emoji: ''` lets `CategoryIcon` fall back to its name hash, which is the same
 * glyph the app has been drawing for that name all along — so adopting changes
 * nothing on screen except that the row now exists. Choosing an icon here would
 * silently restyle 119 rows as a side effect of a repair.
 */
function adoptable(names: readonly string[], held: ReadonlySet<string>): ContainerSeed[] {
  return names.filter((name) => !held.has(name)).map((name) => ({ name, emoji: '' }));
}

/**
 * The whole first-run pass, run after a load that RESOLVED CLEANLY.
 *
 * Lives here rather than in supabase-provider.tsx because the order of its four
 * steps is the design, and an ordering that only exists inside a provider
 * closure is an ordering no test can reach. The provider keeps the trigger; this
 * keeps the decision.
 *
 *   1. LATCH FIRST, so every load after the first costs one SELECT and stops.
 *      `fetchContainersSeeded` fails CLOSED — a read that did not work answers
 *      "already seeded" — because the failure on the other side is writing
 *      containers into an account whose state could not be read.
 *   2. RE-CHECK THE STORE. The latch read is an await, and Supabase re-emits
 *      SIGNED_IN on every hidden→visible transition, so the store can have been
 *      replaced underneath by then.
 *   3. READ THE BIN. The container name indexes have no
 *      `WHERE deleted_at IS NULL`, so a soft-deleted row holds its name for
 *      thirty days while being invisible to the store; creating it anyway is
 *      23505 and a phantom container, out of a write nobody asked for.
 *   4. LATCH BEFORE CREATING. If the writes then fail, the account is never
 *      seeded and its owner sees the empty sections they would have seen
 *      anyway. Latch afterwards and a failure in between leaves a load that
 *      seeds again — the store's de-dupe would catch most of it, and "most" is
 *      not the standard for an automatic write.
 *
 * An account that HAS containers is latched too. It needs nothing, but it has
 * now been considered, and leaving it unlatched would spend a SELECT on every
 * load forever asking a question whose answer cannot change.
 */
export interface SeedDeps {
  hasSeeded: (userId: string) => Promise<boolean>;
  markSeeded: (userId: string) => Promise<void>;
  trashedNames: (userId: string) => Promise<{ projects: { name: string }[]; groups: { name: string }[] }>;
  snapshot: () => {
    userId: string | null;
    isLoading: boolean;
    items: readonly Item[];
    projects: readonly { name: string }[];
    habitGroups: readonly { name: string }[];
  };
  commit: (plan: SeedPlan) => void;
}

export async function runFirstRunSeed(userId: string, deps: SeedDeps): Promise<SeedReason> {
  if (await deps.hasSeeded(userId)) return 'none';

  const before = deps.snapshot();
  if (before.userId !== userId || before.isLoading) return 'none';

  if (before.projects.length > 0 || before.habitGroups.length > 0) {
    await deps.markSeeded(userId);
    return 'none';
  }

  const trashed = await deps.trashedNames(userId);
  const plan = planSeed({
    items: before.items,
    projects: before.projects,
    habitGroups: before.habitGroups,
    trashedProjectNames: trashed.projects.map((t) => t.name),
    trashedGroupNames: trashed.groups.map((t) => t.name),
  });

  await deps.markSeeded(userId);
  deps.commit(plan);
  return plan.reason;
}
