import { getCache } from './cache.js'

const PLANNING_KEYWORDS = [
  'task', 'tasks', 'todo', 'to-do', 'habit', 'habits', 'project', 'projects',
  'today', 'tomorrow', 'schedule', 'plan', 'planning', 'reminder', 'remind',
  'what should i', 'what do i', "what's on", 'on my list', 'overdue',
  'morning', 'afternoon', 'evening', 'priority', 'high priority', 'urgent',
  'working on', 'work on', 'finish', 'complete', 'done', 'streak',
]

export function isPlanning(message: string): boolean {
  const lower = message.toLowerCase()
  return PLANNING_KEYWORDS.some((kw) => lower.includes(kw))
}

/** ~20 tokens — always injected */
export function buildHeader(): string {
  const cache = getCache()
  if (!cache) return ''
  const today = new Date().toISOString().slice(0, 10)
  const pending = cache.tasks.filter((t) => t.status === 'pending')
  const overdue = pending.filter((t) => t.startDate && t.startDate < today)
  const todayTasks = pending.filter((t) => !t.startDate || t.startDate === today)
  const pendingHabits = cache.habits.filter((h) => h.status === 'pending')
  return `[Anchor: ${todayTasks.length} tasks today, ${overdue.length} overdue, ${pendingHabits.length} habits pending — say "show my tasks" for details]`
}

/** ~200–400 tokens — injected on planning-related messages */
export function buildFullContext(): string {
  const cache = getCache()
  if (!cache) return ''
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = []

  const pending = cache.tasks.filter((t) => t.status === 'pending')
  const todayTasks = pending.filter((t) => !t.startDate || t.startDate === today)
  const overdue = pending.filter((t) => t.startDate && t.startDate < today)
  const upcoming = pending.filter((t) => t.startDate && t.startDate > today)

  if (todayTasks.length) {
    lines.push("## Today's Tasks")
    for (const t of todayTasks) {
      const pri = t.priority ? ` [${t.priority}]` : ''
      const proj = t.project ? ` (${t.project})` : ''
      const time = t.startTime ? ` @ ${t.startTime}` : ''
      lines.push(`- ${t.title}${pri}${proj}${time}`)
    }
  }
  if (overdue.length) {
    lines.push('\n## Overdue Tasks')
    for (const t of overdue) lines.push(`- ${t.title} [overdue: ${t.startDate}]`)
  }
  if (upcoming.length) {
    lines.push('\n## Upcoming Tasks')
    for (const t of upcoming.slice(0, 5)) lines.push(`- ${t.title} (${t.startDate})`)
    if (upcoming.length > 5) lines.push(`  …and ${upcoming.length - 5} more`)
  }

  const pendingHabits = cache.habits.filter((h) => h.status === 'pending')
  const doneHabits = cache.habits.filter((h) => h.status === 'done')
  if (pendingHabits.length || doneHabits.length) {
    lines.push('\n## Habits')
    for (const h of doneHabits) lines.push(`- ✅ ${h.title} (${h.streak} day streak)`)
    for (const h of pendingHabits) lines.push(`- ⬜ ${h.title} (${h.streak} day streak)`)
  }

  if (cache.projects.length) {
    lines.push('\n## Projects')
    for (const p of cache.projects) lines.push(`- ${p.emoji} ${p.name}`)
  }

  return lines.join('\n')
}
