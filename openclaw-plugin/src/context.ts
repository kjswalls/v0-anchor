import type { Item, Program, Routine } from '@anchor-app/types'
import { getCache } from './cache.js'
import type { AnchorCache } from './plugin-types.js'

function getLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date())
}

/** ~200–400 tokens — returned by anchor_get_context tool */
export function buildFullContext(): string {
  const cache = getCache()
  if (!cache) return ''
  const timezone = cache.userTimezone ?? "UTC"
  const today = getLocalDate(timezone)
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
      lines.push(`- ${t.title} [id: ${t.id}]${pri}${proj}${time}`)
    }
  }
  if (overdue.length) {
    lines.push('\n## Overdue Tasks')
    for (const t of overdue) lines.push(`- ${t.title} [id: ${t.id}] [overdue: ${t.startDate}]`)
  }
  if (upcoming.length) {
    lines.push('\n## Upcoming Tasks')
    for (const t of upcoming.slice(0, 5)) lines.push(`- ${t.title} [id: ${t.id}] (${t.startDate})`)
    if (upcoming.length > 5) lines.push(`  …and ${upcoming.length - 5} more`)
  }

  const pendingHabits = cache.habits.filter((h) => h.status === 'pending')
  const doneHabits = cache.habits.filter((h) => h.status === 'done')
  if (pendingHabits.length || doneHabits.length) {
    lines.push('\n## Habits')
    for (const h of doneHabits) lines.push(`- ✅ ${h.title} [id: ${h.id}] (${h.streak} day streak)`)
    for (const h of pendingHabits) lines.push(`- ⬜ ${h.title} [id: ${h.id}] (${h.streak} day streak)`)
  }

  if (cache.projects.length) {
    lines.push('\n## Projects')
    for (const p of cache.projects) lines.push(`- ${p.emoji} ${p.name}`)
  }

  lines.push(...renderCollections(cache.routines, cache.programs, today))
  lines.push(...renderPaused(cache, today))

  return lines.join('\n')
}

/**
 * Is a pause interval still open on `today`?
 *
 * `pausedUntil` is EXCLUSIVE, and an expired pause leaves BOTH columns in place
 * on purpose (the app's resume normalizes rather than clearing, so the interval
 * survives for the auto-age sweep). So the presence of `pausedAt` alone does
 * not mean paused, and reading it that way would report a comeback date already
 * in the past.
 *
 * This is a date comparison, not a second resolver: it never looks at
 * containers, and nothing here decides what is VISIBLE — the server already did
 * that, and renderPaused reads its answer.
 */
function pauseIsOpen(x: { pausedAt?: string; pausedUntil?: string }, today: string): boolean {
  if (!x.pausedAt) return false
  return !x.pausedUntil || x.pausedUntil > today
}

/**
 * Routines and programs, so the ids above are actionable rather than mysterious.
 *
 * Program state is reported as stored, not resolved: 'auto' plus a range is a
 * different thing from 'active', and flattening them to on/off would invite the
 * repair that destroys the distinction — writing 'active' onto an `auto`
 * program short-circuits the range permanently.
 */
function renderCollections(routines: Routine[], programs: Program[], today: string): string[] {
  if (!routines.length && !programs.length) return []
  const lines = ['\n## Collections']
  for (const r of routines) {
    const state = pauseIsOpen(r, today)
      ? r.pausedUntil
        ? ` (paused until ${r.pausedUntil})`
        : ' (paused)'
      : ''
    lines.push(`- Routine: ${r.name} [id: ${r.id}]${state}`)
  }
  for (const p of programs) {
    const range = p.startsOn || p.endsOn ? ` ${p.startsOn ?? '…'} → ${p.endsOn ?? '…'}` : ''
    lines.push(`- Program: ${p.name} [id: ${p.id}] (${p.state}${range})`)
  }
  return lines
}

/**
 * The work that is deliberately set aside.
 *
 * Derived as a SET DIFFERENCE — items[] arrives unfiltered while tasks[] and
 * habits[] have had suppressed open loops removed server-side, so the gap
 * between them is the server's own answer, read rather than recomputed. That is
 * the whole point: reimplementing lib/active.ts's path algebra out here would
 * be a second resolver, and the two would disagree the first time either
 * changed.
 *
 * Without this section a paused item simply vanishes from the lists above, and
 * a model asked about it by name will answer from the absence — that it was
 * finished, dropped, or never existed. The last two invite a recreate that
 * duplicates the row.
 */
function renderPaused(cache: AnchorCache, today: string): string[] {
  if (!cache.items.length) return []
  const visible = new Set([...cache.tasks.map((t) => t.id), ...cache.habits.map((h) => h.id)])
  // Only the two projected types. A custom type appears in items[] and in
  // NEITHER projection by design, so without this it would read as suppressed.
  const suppressed = cache.items.filter(
    (i) => (i.type === 'task' || i.type === 'habit') && !visible.has(i.id),
  )
  if (!suppressed.length) return []

  const lines = [
    '\n## Set aside',
    'Deliberately paused — NOT overdue and not missed. Do not suggest these or ' +
      'count them as slipping, and do not recreate them: they still exist and ' +
      'come back on their own.',
  ]
  for (const item of suppressed) {
    lines.push(`- ${item.title} [id: ${item.id}] — ${causeFor(item, cache, today)}`)
  }
  return lines
}

function causeFor(item: Item, cache: AnchorCache, today: string): string {
  // The item's own pause wins the explanation, matching lib/active.ts — it is
  // the one the user set on this row and the one this row's own resume undoes.
  // Naming a container instead would send them to a control that leaves the
  // item hidden.
  if (pauseIsOpen(item, today)) {
    return item.pausedUntil ? `paused until ${item.pausedUntil}` : 'paused'
  }

  const routines = cache.routines.filter((r) => r.itemIds.includes(item.id))
  const routineIds = new Set(routines.map((r) => r.id))
  const program = cache.programs.find(
    (p) => p.itemIds.includes(item.id) || p.routineIds.some((id) => routineIds.has(id)),
  )
  // No return DATE is offered for a container, deliberately. An item can be
  // blocked by a routine inside an out-of-season program at once, and naming
  // the one that clears FIRST would promise a comeback the item will not
  // honour. The app settles that with a binding-constraint rule; half of that
  // rule out here would be worse than none, so this names a cause and stops.
  if (program) return `set aside with the ${program.name} program`
  if (routines.length) return `set aside with the ${routines[0].name} routine`
  return 'set aside'
}
