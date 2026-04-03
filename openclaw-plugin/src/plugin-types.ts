import type { Task, Habit, Project, HabitGroupType } from '@anchor-app/types'

/** Plugin-internal cache shape */
export interface AnchorCache {
  userId: string
  tasks: Task[]
  habits: Habit[]
  projects: Project[]
  habitGroups: HabitGroupType[]
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
