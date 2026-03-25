export type Priority = 'low' | 'medium' | 'high'
export type TimeBucket = 'anytime' | 'morning' | 'afternoon' | 'evening'
export type TaskStatus = 'pending' | 'completed' | 'cancelled'
export type HabitStatus = 'pending' | 'done' | 'skipped'
export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'monthly' | 'custom'

export interface Task {
  id: string
  title: string
  priority?: Priority
  project?: string
  startDate?: string
  status: TaskStatus
  timeBucket?: TimeBucket
  startTime?: string
  duration?: number
  isScheduled: boolean
  repeatFrequency?: RepeatFrequency
  order: number
}

export interface Habit {
  id: string
  title: string
  group: string
  streak: number
  status: HabitStatus
  completedDates: string[]
  skippedDates: string[]
  dailyCounts: Record<string, number>
  timeBucket?: TimeBucket
  startTime?: string
  repeatFrequency: RepeatFrequency
}

export interface Project {
  name: string
  emoji: string
  timeBucket?: TimeBucket
  startTime?: string
  duration?: number
}

export interface HabitGroupType {
  name: string
  emoji: string
  color?: string
}

export interface AnchorCache {
  userId: string
  tasks: Task[]
  habits: Habit[]
  projects: Project[]
  habitGroups: HabitGroupType[]
  fetchedAt: number
}

export interface PluginConfig {
  anchorUrl: string
  apiKey: string
  webhookSecret?: string
  cacheTtlMs?: number
}
