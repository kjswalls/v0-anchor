import type { Task, Habit, Project, HabitGroupType, Item, Routine, Program } from '@anchor-app/types'

/** Plugin-internal cache shape */
export interface AnchorCache {
  userId: string
  userTimezone: string
  tasks: Task[]
  habits: Habit[]
  projects: Project[]
  habitGroups: HabitGroupType[]
  /**
   * Unified items (schemaVersion 3+), UNFILTERED — where tasks[]/habits[] have
   * had suppressed open loops removed by the server. The difference between
   * them is exactly the set of work that is deliberately set aside, which is
   * how context.ts accounts for it without reimplementing the resolver.
   */
  items: Item[]
  /** schemaVersion 4+. Absent (not empty) when the server did not say. */
  routines: Routine[]
  programs: Program[]
  fetchedAt: number
}

/** Plugin config (from openclaw.json) */
export interface PluginConfig {
  anchorUrl: string
  apiKey: string
  publicUrl?: string   // Gateway's public URL (e.g. https://midgar-1b4eaa3.turkey-rockhopper.ts.net)
  webhookSecret?: string
  cacheTtlMs?: number
  /** OpenClaw agent for Anchor sidebar chat (default: main). */
  agentId?: string
  /** Fallback agent id if agentId unset (legacy / alternate key in openclaw.json). */
  id?: string
}
