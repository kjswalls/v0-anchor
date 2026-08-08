/**
 * item-registry.ts — per-type behavior config for unified items.
 *
 * Every place the app used to ask "is this a task or a habit?" should instead
 * ask the registry what the item's type can do. Adding a new type (built-in or,
 * later, user-defined via an item_types table) means adding a config here — not
 * adding code paths.
 *
 * Values are transcribed from pre-unification behavior; changing one is a
 * product decision, not a refactor step. See memory/plans/unified-items.md.
 */

import { format } from 'date-fns'
import { TASK_FIELDS, HABIT_FIELDS } from '@anchor-app/types'
import { accentColorForName } from './accent-colors'
import { selectOverdue, toDateOnly } from './overdue'
import { isRecurring } from './recurrence'
import type {
  HabitItem,
  Item,
  ItemType,
  ItemTypeDef,
  KnownItemType,
  RepeatFrequency,
  TaskItem,
  TimeBucket,
} from '@anchor-app/types'

export interface ItemTypeConfig {
  type: ItemType
  label: string
  labelPlural: string
  /**
   * CSS color string (a var() token) for the type's identity swatch — the
   * colored square on the dialog's type chip and inside the type picker.
   * Custom types use their stored color when set, else the same name-hash
   * accent ramp projects draw from.
   */
  accent: string
  /** Valid values for the item's scalar `status` field. */
  allowedStatuses: readonly string[]
  /** The status meaning "finished" for one-shot (non-recurring) items. */
  doneStatus: string
  /** Recurring items track per-date completion in completedDates, never scalar status. */
  defaultFrequency: RepeatFrequency
  /** Habit UI deliberately forbids 'none' — a habit is recurring by definition. */
  allowedFrequencies: readonly RepeatFrequency[]
  /**
   * Anchored items have a startDate and gate recurring occurrences by
   * startDate <= date; un-anchored items render on every matching day.
   * Migrated habits stay un-anchored (start_date NULL) — backfilling would
   * retroactively hide historical occurrences.
   */
  dateAnchored: boolean
  /** Whether drag-and-drop may target a specific date (week-view column drops). */
  dateAddressable: boolean
  /**
   * May a single recurring occurrence be marked "not this one" — skipped —
   * without counting as done? Skips are per-DATE (`skippedDates`), exactly like
   * completions, so this capability only bites on a recurring item; a one-shot
   * item is completed, cancelled or deleted, never skipped. Ask
   * `isSkippable(item)` rather than reading this flag directly.
   */
  skippable: boolean
  /**
   * Scalar `status` value this type denormalizes a skip into, or null for
   * "skippedDates only".
   *
   * Habits keep a last-toggle snapshot in `status` and their vocabulary has a
   * 'skipped' member. Tasks must NOT: `pending|completed|cancelled` is an
   * external contract the OpenClaw plugin safeParses and throws on, so a
   * skipped task is a task with a date in `skippedDates` and nothing else.
   */
  skipStatus: string | null
  /** Participates in manual ordering (the "order" column + reorder actions). */
  orderable: boolean
  /** Which container table names this type resolves against. */
  containerKind: 'projects' | 'habitGroups' | null
  containerRequired: boolean
  /** Fallback container when the referenced one is deleted (null → clear the ref). */
  orphanContainerFallback: string | null
  counters: {
    streak: boolean
    dailyCounts: boolean
  }
  /** May carry child items (items.parent_item_id) — the panel's Subtasks section. */
  subtasks: boolean
  /** May be handed to OpenClaw/Beacon (assignee / ai_status / ai_result). */
  agentAssignable: boolean
  schedule: {
    /**
     * Whether the schedule grid offers drag-to-resize handles on this type's
     * blocks. Requires `duration` in `fields` — there is nowhere to write the
     * result otherwise.
     */
    resizable: boolean
    /** Minutes a block occupies on the schedule grid when no duration is set. */
    defaultBlockMinutes: number
  }
  /** May live in / return to the braindump (sidebar unschedule drop). */
  braindumpEligible: boolean
  /** Unfinished items roll forward in EOD review / morning check. */
  carryForwardEligible: boolean
  defaultTimeBucket: TimeBucket | null
  /**
   * Legacy webhook contract: the OpenClaw plugin registers exactly
   * tasks.updated/habits.updated and notifyPlugins drops unregistered event
   * names — new types must map onto one of these until a versioned contract
   * ships (Phase 5+).
   */
  webhookEvent: 'tasks.updated' | 'habits.updated'
  webhookPayloadKey: 'task' | 'habit'
  /** Schema-derived data fields for this type (excludes the discriminator). */
  fields: readonly string[]
  /** Presentation metadata for the unified ItemDialog (add/edit form). */
  form: {
    /** Title-input placeholder. "What needs to be done?" is an e2e selector. */
    titlePlaceholder: string
    /** sr-only description for the edit dialog. */
    editDescription: string
    /** Label over the container select ("Project" / "Group"). */
    containerLabel: string
    /** Label of the create-new option inside the container select. */
    newContainerLabel: string
    /** Lucide icon name seeding the inline container creator (via makeIconToken). */
    newContainerIcon: string
    /** Body copy for the delete-confirm dialog. */
    deleteDescription: (title: string) => string
  }
  ai: {
    /**
     * Renders this type's section of the Beacon chat context (markdown lines,
     * no trailing blank). Pinned presentation — byte-identical to the
     * pre-unification builder except for the past-due heading's wording (see the
     * push site): tasks are date-scoped with a "Still waiting" block, habits are
     * date-blind and streak-annotated in store order.
     */
    renderContextSection: (
      items: readonly Item[],
      ctx: { today: Date; todayStr: string }
    ) => string[]
  }
}

export const ITEM_TYPES: Record<KnownItemType, ItemTypeConfig> = {
  task: {
    type: 'task',
    label: 'Task',
    labelPlural: 'Tasks',
    accent: 'var(--primary)',
    allowedStatuses: ['pending', 'completed', 'cancelled'],
    doneStatus: 'completed',
    defaultFrequency: 'none',
    allowedFrequencies: ['none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'],
    dateAnchored: true,
    dateAddressable: true,
    skippable: true,
    skipStatus: null,
    orderable: true,
    containerKind: 'projects',
    containerRequired: false,
    orphanContainerFallback: null,
    counters: { streak: false, dailyCounts: false },
    subtasks: true,
    agentAssignable: true,
    // 30, not the 60 this said before it was consumed anywhere: the ItemDialog
    // seeds a new item's duration at '30' and the grid has always rendered a
    // duration-less block as 30 minutes. The 60 was aspirational config that
    // nothing read, so wiring it up would have silently doubled every such
    // block — the value follows the behavior, not the reverse.
    schedule: { resizable: true, defaultBlockMinutes: 30 },
    braindumpEligible: true,
    carryForwardEligible: true,
    defaultTimeBucket: null,
    webhookEvent: 'tasks.updated',
    webhookPayloadKey: 'task',
    fields: TASK_FIELDS,
    form: {
      titlePlaceholder: 'What needs to be done?',
      editDescription:
        'Edit the details of your task including title, priority, project, and schedule.',
      containerLabel: 'Project',
      newContainerLabel: 'New Project',
      newContainerIcon: 'Briefcase',
      deleteDescription: (title) =>
        `This will permanently delete "${title}". This action cannot be undone.`,
    },
    ai: {
      renderContextSection: (items, { todayStr }) => {
        // Subtasks stay out of Beacon's narration — no view shows them as
        // free-floating tasks, so Beacon must not either. (The focused-item
        // section in ai-context.ts is where they speak.) Pre-subtask fixtures
        // carry no parentItemId, so the pinned byte-output is unchanged.
        const tasks = items.filter(
          (i): i is TaskItem => i.type === 'task' && !i.parentItemId
        )
        const lines: string[] = []
        lines.push("### Today's Tasks")

        const todayTasks = tasks.filter(
          (t) => t.startDate === todayStr && t.status !== 'cancelled'
        )

        // Past-due has exactly one definition (lib/overdue.ts). The copy that
        // used to live here had no recurrence guard, so Beacon was told about
        // phantom overdue items — a daily habit-shaped task anchored months ago
        // is `status: 'pending'` forever by design. Passing the already-narrowed
        // `tasks` keeps this section's task-only shape; ordering is now the
        // selector's (recent newest-first, then the long-overdue tail).
        const overdueTasks = selectOverdue(tasks, todayStr)

        const pendingTasks = todayTasks.filter((t) => t.status === 'pending')
        const completedTasks = todayTasks.filter((t) => t.status === 'completed')

        function formatTask(t: TaskItem): string {
          const parts: string[] = []
          if (t.project) parts.push(`Project: ${t.project}`)
          if (t.timeBucket) {
            parts.push(t.timeBucket.charAt(0).toUpperCase() + t.timeBucket.slice(1))
          }
          if (t.priority) {
            parts.push(`${t.priority.charAt(0).toUpperCase() + t.priority.slice(1)} priority`)
          }
          return parts.length > 0 ? `- ${t.title} (${parts.join(', ')})` : `- ${t.title}`
        }

        if (pendingTasks.length > 0) {
          lines.push('**Pending**')
          pendingTasks.forEach((t) => lines.push(formatTask(t)))
        }

        if (completedTasks.length > 0) {
          lines.push('**Completed today**')
          completedTasks.forEach((t) => lines.push(`- ${t.title} ✓`))
        }

        if (overdueTasks.length > 0) {
          // "Still waiting", not "Overdue" — and this one IS a deliberate tone
          // decision, not a copy tidy-up. These lines are Beacon's prompt, so the
          // heading is the frame it answers in: handed a section called Overdue,
          // it opens by telling the user what they are behind on, which is the one
          // thing every other surface here has just stopped doing (see the copy
          // contract on BarCopy in components/ai/morning-check.tsx).
          //
          // No information is withheld from the model: same items, same order,
          // same dates, and "from Jul 10" carries the age exactly as well as "was
          // Jul 10" did. tests/unit/ai-context.test.ts pins this whole string as
          // the frozen pre-unification presentation and was updated in the same
          // commit — the freeze is there to catch DRIFT, and an intentional
          // rewording is not drift, so if this line changes again the test should
          // fail again and be re-read, not loosened.
          lines.push('**Still waiting**')
          overdueTasks.forEach((t) => {
            // toDateOnly: the selector admits legacy full-ISO startDates, which
            // `+ 'T00:00:00'` would turn into an Invalid Date.
            const dateLabel = `from ${format(new Date(toDateOnly(t.startDate!) + 'T00:00:00'), 'MMM d')}`
            const priority = t.priority
              ? `, ${t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}`
              : ''
            lines.push(`- ${t.title} (${dateLabel}${priority})`)
          })
        }

        if (pendingTasks.length === 0 && completedTasks.length === 0 && overdueTasks.length === 0) {
          lines.push('No tasks scheduled for today.')
        }

        return lines
      },
    },
  },
  habit: {
    type: 'habit',
    label: 'Habit',
    labelPlural: 'Habits',
    // Honey is already the habit hue everywhere it has one (streak strip,
    // flame) via the warning alias — reuse it rather than minting a token.
    accent: 'var(--warning)',
    allowedStatuses: ['pending', 'done', 'skipped'],
    doneStatus: 'done',
    defaultFrequency: 'daily',
    allowedFrequencies: ['daily', 'weekdays', 'weekends', 'monthly', 'custom'],
    dateAnchored: false,
    dateAddressable: false,
    skippable: true,
    skipStatus: 'skipped',
    orderable: false,
    containerKind: 'habitGroups',
    containerRequired: true,
    orphanContainerFallback: 'Personal',
    counters: { streak: true, dailyCounts: true },
    // Habits recur; a habit "subtask" or agent handoff has no defined meaning.
    subtasks: false,
    agentAssignable: false,
    // Habits carry a real length now (`duration` joined habitShape), so their
    // blocks resize like any other — "30 minutes of reading a day" is the habit
    // itself. This was false only because there was no field to store the drag
    // into; it was never a statement that habits are momentary.
    schedule: { resizable: true, defaultBlockMinutes: 30 },
    braindumpEligible: false,
    carryForwardEligible: false,
    defaultTimeBucket: null,
    webhookEvent: 'habits.updated',
    webhookPayloadKey: 'habit',
    fields: HABIT_FIELDS,
    form: {
      titlePlaceholder: 'What habit to track?',
      editDescription:
        'Edit the details of your habit including title, group, and repeat schedule.',
      containerLabel: 'Group',
      newContainerLabel: 'New Group',
      newContainerIcon: 'Star',
      deleteDescription: (title) =>
        `This will permanently delete "${title}" and all its history. This action cannot be undone.`,
    },
    ai: {
      renderContextSection: (items, { todayStr }) => {
        const habits = items.filter((i): i is HabitItem => i.type === 'habit')
        const lines: string[] = []
        lines.push('### Habits')

        if (habits.length === 0) {
          lines.push('No habits tracked.')
        } else {
          habits.forEach((h) => {
            const todayStatus = h.completedDates.includes(todayStr)
              ? '✓ done today'
              : h.skippedDates.includes(todayStr)
              ? 'skipped today'
              : 'pending today'
            const streakStr = h.streak > 0 ? `🔥 ${h.streak} day streak` : 'no streak'
            lines.push(`- ${h.title} — ${streakStr} — ${todayStatus}`)
          })
        }

        return lines
      },
    },
  },
}

/**
 * Key order of ITEM_TYPES is presentation-load-bearing: the Beacon context
 * sections and the system-prompt noun lists iterate this array, and their
 * output is pinned byte-for-byte (tests/unit/ai-context.test.ts). Insert new
 * types at the end.
 */
export const ALL_ITEM_TYPES = Object.keys(ITEM_TYPES) as KnownItemType[]

// ── User-defined types (Phase 6) ─────────────────────────────────────────────
// item_types rows hydrate into ItemTypeConfig via a fixed v1 template: custom
// types are task-shaped, date-anchored, container-less, counter-less. The
// `config` jsonb column is carried on the def for future capability overrides
// but is NOT applied yet — overriding capabilities is a product decision per
// capability, not a generic merge.

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export function buildCustomTypeConfig(
  def: Pick<ItemTypeDef, 'name' | 'label' | 'labelPlural' | 'color'>
): ItemTypeConfig {
  const label = def.label || capitalize(def.name)
  const labelPlural = def.labelPlural || `${label}s`
  return {
    type: 'custom',
    label,
    labelPlural,
    accent: def.color?.trim() || accentColorForName(def.name),
    allowedStatuses: ['pending', 'completed', 'cancelled'],
    doneStatus: 'completed',
    defaultFrequency: 'none',
    allowedFrequencies: ['none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'],
    dateAnchored: true,
    dateAddressable: true,
    // Task-shaped in every respect, skips included: a recurring custom item
    // gets the same per-date skip + minimized row a habit does, with no code
    // path of its own.
    skippable: true,
    skipStatus: null,
    // Manual ordering is per-type ("order" sequences would collide); custom
    // types sort by created_at until reordering becomes a real need.
    orderable: false,
    containerKind: null,
    containerRequired: false,
    orphanContainerFallback: null,
    counters: { streak: false, dailyCounts: false },
    // Custom types are task-shaped (v1 template) — they grow the same way.
    subtasks: true,
    agentAssignable: true,
    // 30 to match the built-in types — see the note on task.schedule.
    schedule: { resizable: true, defaultBlockMinutes: 30 },
    braindumpEligible: true,
    // The store's task actions operate on any task-like item (Phase 6b), so
    // dated custom items roll forward in morning check / EOD like tasks do.
    carryForwardEligible: true,
    defaultTimeBucket: null,
    // Trigger-only for the plugin: it refetches context on any event and its
    // tasks[]/habits[] projections exclude custom types (items[] carries them).
    webhookEvent: 'tasks.updated',
    webhookPayloadKey: 'task',
    fields: TASK_FIELDS,
    form: {
      titlePlaceholder: `Add a ${label.toLowerCase()}…`,
      editDescription: `Edit the details of your ${label.toLowerCase()}.`,
      containerLabel: 'Project',
      newContainerLabel: 'New Project',
      newContainerIcon: 'Star',
      deleteDescription: (title) =>
        `This will permanently delete "${title}". This action cannot be undone.`,
    },
    ai: {
      renderContextSection: (items, _ctx) => {
        const lines: string[] = [`### ${labelPlural}`]
        const active = items.filter(
          (i) => i.type === 'custom' && i.status !== 'cancelled'
        )
        if (active.length === 0) {
          lines.push(`No ${labelPlural.toLowerCase()} yet.`)
        } else {
          active.forEach((i) =>
            lines.push(`- ${i.title}${i.status === 'completed' ? ' ✓' : ''}`)
          )
        }
        return lines
      },
    },
  }
}

let customTypeDefs: ItemTypeDef[] = []
let customTypeConfigs: Record<string, ItemTypeConfig> = {}

/** Replace the hydrated custom-type set (called by the planner store on load/CRUD). */
export function hydrateCustomTypes(defs: ItemTypeDef[]): void {
  customTypeDefs = defs
  customTypeConfigs = Object.fromEntries(
    defs.map((d) => [d.name, buildCustomTypeConfig(d)])
  )
}

export function getCustomTypeDefs(): ItemTypeDef[] {
  return customTypeDefs
}

/** All type machine names: built-ins first (order pinned), then custom. */
export function getAllItemTypeNames(): string[] {
  return [...ALL_ITEM_TYPES, ...customTypeDefs.map((d) => d.name)]
}

/** The registry name an item resolves against ('goal', not 'custom'). */
export function itemTypeName(item: Item): string {
  return item.type === 'custom' ? item.customType : item.type
}

/**
 * Never returns undefined: built-in → hydrated custom → an on-the-fly default
 * template (covers items whose item_types row was deleted — they keep working
 * with a capitalized-name label).
 */
export function getItemTypeConfig(name: string): ItemTypeConfig {
  if (name === 'task' || name === 'habit') return ITEM_TYPES[name]
  return (
    customTypeConfigs[name] ??
    buildCustomTypeConfig({ name, label: capitalize(name), labelPlural: `${capitalize(name)}s` })
  )
}

/**
 * Can this item's occurrences be skipped? Capability AND recurrence: a skip is
 * a date in `skippedDates`, which is only meaningful when the item has more
 * than one occurrence to skip. Habits pass on both counts by construction
 * (their allowed frequencies exclude 'none'), so this is the same predicate
 * the habit row has always applied — now stated once, for every type.
 */
export function isSkippable(item: Item): boolean {
  return getItemTypeConfig(itemTypeName(item)).skippable && isRecurring(item)
}
