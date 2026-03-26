import { format, isBefore, startOfDay } from 'date-fns'
import type { Task, Habit, Project, HabitGroupType } from './planner-types'

export function buildAnchorContext(state: {
  tasks: Task[]
  habits: Habit[]
  projects: Project[]
  habitGroups: HabitGroupType[]
}): string {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const lines: string[] = []

  lines.push('## Anchor Context')
  lines.push(`Date: ${format(today, 'EEEE, MMMM d yyyy')}`)
  lines.push('')

  // --- Tasks ---
  lines.push("### Today's Tasks")

  const todayTasks = state.tasks.filter(
    (t) => t.startDate === todayStr && t.status !== 'cancelled'
  )

  const overdueTasks = state.tasks.filter((t) => {
    if (!t.startDate || t.status === 'completed' || t.status === 'cancelled') return false
    return isBefore(startOfDay(new Date(t.startDate + 'T00:00:00')), startOfDay(today))
  })

  const pendingTasks = todayTasks.filter((t) => t.status === 'pending')
  const completedTasks = todayTasks.filter((t) => t.status === 'completed')

  function formatTask(t: Task): string {
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
    lines.push('**Overdue**')
    overdueTasks.forEach((t) => {
      const dateLabel = `was ${format(new Date(t.startDate! + 'T00:00:00'), 'MMM d')}`
      const priority = t.priority
        ? `, ${t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}`
        : ''
      lines.push(`- ${t.title} (${dateLabel}${priority})`)
    })
  }

  if (pendingTasks.length === 0 && completedTasks.length === 0 && overdueTasks.length === 0) {
    lines.push('No tasks scheduled for today.')
  }

  lines.push('')

  // --- Habits ---
  lines.push('### Habits')

  if (state.habits.length === 0) {
    lines.push('No habits tracked.')
  } else {
    state.habits.forEach((h) => {
      const todayStatus = h.completedDates.includes(todayStr)
        ? '✓ done today'
        : h.skippedDates.includes(todayStr)
        ? 'skipped today'
        : 'pending today'
      const streakStr = h.streak > 0 ? `🔥 ${h.streak} day streak` : 'no streak'
      lines.push(`- ${h.title} — ${streakStr} — ${todayStatus}`)
    })
  }

  lines.push('')

  // --- Projects ---
  lines.push('### Projects')
  if (state.projects.length === 0) {
    lines.push('No projects.')
  } else {
    lines.push(state.projects.map((p) => p.name).join(', '))
  }

  return lines.join('\n')
}
