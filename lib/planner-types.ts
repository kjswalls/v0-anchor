/**
 * planner-types.ts
 *
 * Core entity types (Task, Habit, Project, HabitGroupType) are the source of
 * truth in @anchor-app/types and re-exported from there.
 *
 * This file adds Anchor app-specific types and constants that don't need to
 * be shared externally (ViewMode, FilterState, UI helpers, etc.).
 */

// ── Re-export shared types from @anchor-app/types ─────────────────────────────
export type {
  Priority,
  TimeBucket,
  TaskStatus,
  HabitStatus,
  RepeatFrequency,
  Task,
  Habit,
  Item,
  ItemType,
  KnownItemType,
  TaskItem,
  HabitItem,
  CustomItem,
  ItemTypeDef,
  Project,
  HabitGroupType,
  Routine,
  Program,
  ProgramState,
  Goal,
  GoalState,
  GoalRole,
  Proposal,
  ProposalDraft,
  ProposalOperation,
  ProposalCreateOp,
  ProposalUpdateOp,
} from '@anchor-app/types'

// ── App-only types ────────────────────────────────────────────────────────────

export type HabitGroup = string;
export type ViewMode = 'day' | 'week';
/**
 * 'status' is gone. It was a legal member with no branch anywhere — picking it
 * rendered identically to 'none' — and it can never gain one: the task and habit
 * status vocabularies (`pending|completed|cancelled` / `pending|done|skipped`)
 * are frozen external contracts that the OpenClaw plugin `safeParse`s, so a
 * section heading would have to either merge them or show two ladders for one
 * axis. It survives only as a stale persisted string; see `isGroupBy`.
 */
export type GroupBy = 'none' | 'project' | 'priority' | 'bucket' | 'routine' | 'program';

export const GROUP_BY_VALUES: readonly GroupBy[] = [
  'none',
  'project',
  'priority',
  'bucket',
  'routine',
  'program',
];

/**
 * Coerce whatever a persisted payload holds.
 *
 * Two live sources can carry `'status'`: `anchor-view`'s own `canvasGroupBy`,
 * and `planner-storage`'s `groupBy`, which `adoptLegacyViewPrefs` copies across
 * on first mount. Unrecognised values reach `groupRows`, whose container branch
 * is the fallthrough — so an unknown string would silently group by project.
 */
export const isGroupBy = (v: unknown): v is GroupBy =>
  typeof v === 'string' && (GROUP_BY_VALUES as readonly string[]).includes(v);
export type FilterType = 'project' | 'priority' | 'startDate' | 'repeat' | 'status';

export interface FilterState {
  project?: string;
  priority?: Priority;
  startDate?: 'today' | 'week' | 'overdue' | 'none';
  repeat?: boolean;
  status?: TaskStatus;
}

export interface PlannerState {
  tasks: Task[];
  habits: Habit[];
  selectedDate: Date;
  viewMode: ViewMode;
  groupBy: GroupBy;
  filters: FilterState;
  projects: Project[];
  habitGroups: HabitGroupType[];
}

// ── UI helpers ────────────────────────────────────────────────────────────────

import type { Priority, TimeBucket, RepeatFrequency, TaskStatus, Task, Habit, Project, HabitGroupType } from '@anchor-app/types'

export const TIME_BUCKET_RANGES: Record<TimeBucket, { start: number; end: number; label: string }> = {
  anytime:   { start: 0,  end: 24, label: 'Anytime'   },
  morning:   { start: 0,  end: 12, label: 'Morning'   },
  afternoon: { start: 12, end: 17, label: 'Afternoon' },
  evening:   { start: 17, end: 24, label: 'Evening'   },
};

export function formatBucketHour(hour: number, use24h = false): string {
  const h = hour % 24;
  if (use24h) return `${String(h).padStart(2, '0')}:00`;
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function formatBucketRange(range: { start: number; end: number }, use24h = false): string {
  return `${formatBucketHour(range.start, use24h)} - ${formatBucketHour(range.end, use24h)}`;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};

/**
 * The starter set a brand-new account is given (organize-console decision 2).
 *
 * NO `id`, and the type says so. These are TEMPLATES: an id baked into a module
 * constant would be the same uuid in every account, which the `(user_id, id)`
 * composite key would tolerate and every other assumption in the app would not.
 * The seeding action mints one per row. (This is also why the constants had six
 * of the branch's tsc errors — they were typed as finished `Project` /
 * `HabitGroupType` values, which have required ids since 027.)
 *
 * `icon:PascalName` tokens, not bare emoji. The emoji here predate the token
 * system by a year and were never migrated, because nothing ever imported these
 * — they would have rendered as a literal "💼" in a row that draws Lucide glyphs
 * everywhere else.
 *
 * THE TWO LISTS SHARE NO NAME, deliberately. They used to be Work / Wellness /
 * Personal twice over, and lib/filters.ts documents what that costs: a saved
 * filter stores a bare name, the project and habit-group namespaces are
 * separate, and a chip reading "Work" cannot say which it means. Seeding both
 * lists handed that collision to every new account on its first day. Groups are
 * named after WHEN a habit happens because that is how habits are actually
 * gardened; projects after WHERE work belongs.
 */
export interface ContainerSeed {
  name: string;
  emoji: string;
}

export const DEFAULT_PROJECTS: ContainerSeed[] = [
  { name: 'Work',   emoji: 'icon:Briefcase' },
  { name: 'Home',   emoji: 'icon:House' },
  { name: 'Health', emoji: 'icon:HeartPulse' },
];

export const DEFAULT_HABIT_GROUPS: ContainerSeed[] = [
  { name: 'Morning',   emoji: 'icon:Sunrise' },
  { name: 'Movement',  emoji: 'icon:Footprints' },
  { name: 'Wind-down', emoji: 'icon:Moon' },
];

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none:     'No repeat',
  daily:    'Daily',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  monthly:  'Monthly',
  custom:   'Custom days',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
