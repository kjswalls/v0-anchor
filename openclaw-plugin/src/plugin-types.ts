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
  webhookSecret?: string
  cacheTtlMs?: number
}
