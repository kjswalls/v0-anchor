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

import { TASK_FIELDS, HABIT_FIELDS } from '@anchor-app/types'
import type { ItemType, RepeatFrequency, TimeBucket } from '@anchor-app/types'

export interface ItemTypeConfig {
  type: ItemType
  label: string
  labelPlural: string
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
  schedule: {
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
}

export const ITEM_TYPES: Record<ItemType, ItemTypeConfig> = {
  task: {
    type: 'task',
    label: 'Task',
    labelPlural: 'Tasks',
    allowedStatuses: ['pending', 'completed', 'cancelled'],
    doneStatus: 'completed',
    defaultFrequency: 'none',
    allowedFrequencies: ['none', 'daily', 'weekdays', 'weekends', 'monthly', 'custom'],
    dateAnchored: true,
    dateAddressable: true,
    orderable: true,
    containerKind: 'projects',
    containerRequired: false,
    orphanContainerFallback: null,
    counters: { streak: false, dailyCounts: false },
    schedule: { resizable: true, defaultBlockMinutes: 60 },
    braindumpEligible: true,
    carryForwardEligible: true,
    defaultTimeBucket: null,
    webhookEvent: 'tasks.updated',
    webhookPayloadKey: 'task',
    fields: TASK_FIELDS,
  },
  habit: {
    type: 'habit',
    label: 'Habit',
    labelPlural: 'Habits',
    allowedStatuses: ['pending', 'done', 'skipped'],
    doneStatus: 'done',
    defaultFrequency: 'daily',
    allowedFrequencies: ['daily', 'weekdays', 'weekends', 'monthly', 'custom'],
    dateAnchored: false,
    dateAddressable: false,
    orderable: false,
    containerKind: 'habitGroups',
    containerRequired: true,
    orphanContainerFallback: 'Personal',
    counters: { streak: true, dailyCounts: true },
    schedule: { resizable: false, defaultBlockMinutes: 30 },
    braindumpEligible: false,
    carryForwardEligible: false,
    defaultTimeBucket: null,
    webhookEvent: 'habits.updated',
    webhookPayloadKey: 'habit',
    fields: HABIT_FIELDS,
  },
}

export function getItemTypeConfig(type: ItemType): ItemTypeConfig {
  return ITEM_TYPES[type]
}

export const ALL_ITEM_TYPES = Object.keys(ITEM_TYPES) as ItemType[]
