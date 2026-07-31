import { format } from 'date-fns'
import { getAllItemTypeNames, getItemTypeConfig, itemTypeName } from './item-registry'
import type { Item, Project, HabitGroupType } from './planner-types'

/**
 * Builds the Beacon chat context. Each item type contributes its own section
 * via the registry's `ai.renderContextSection` — the per-type presentations
 * (task: date-scoped with Overdue; habit: date-blind, streak-annotated) are
 * pinned there, byte-identical to the pre-unification builder.
 *
 * `focusItemId` (per-item threads) prepends a focused-item section; the base
 * output without it stays byte-identical — the pinned tests parse that shape.
 */
export function buildAnchorContext(state: {
  items: Item[]
  projects: Project[]
  habitGroups: HabitGroupType[]
  focusItemId?: string
}): string {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const lines: string[] = []

  lines.push('## Anchor Context')
  lines.push(`Date: ${format(today, 'EEEE, MMMM d yyyy')}`)
  lines.push('')

  if (state.focusItemId) {
    const focus = state.items.find((i) => i.id === state.focusItemId)
    if (focus) {
      const config = getItemTypeConfig(itemTypeName(focus))
      const subtasks = state.items.filter(
        (i) => i.type !== 'habit' && i.parentItemId === focus.id
      )
      lines.push('### Focused item')
      lines.push(
        'This conversation is about ONE item. Prioritize it; the rest of the ' +
          'context is background.'
      )
      lines.push(`- ${focus.title} [id: ${focus.id}] (${config.label}, status: ${focus.status})`)
      if (focus.type !== 'habit') {
        const parts: string[] = []
        if (focus.project) parts.push(`Project: ${focus.project}`)
        if (focus.startDate) parts.push(`Date: ${focus.startDate}`)
        if (focus.priority) parts.push(`Priority: ${focus.priority}`)
        if (focus.assignee) parts.push(`Assigned to: ${focus.assignee} (${focus.aiStatus ?? 'no status'})`)
        if (parts.length > 0) lines.push(`- ${parts.join(' · ')}`)
      }
      // Outside the non-habit branch on purpose: habits carry notes too (they
      // are in habitShape, and the panel renders the field for them), and a
      // per-item thread about a habit is exactly where that context is wanted.
      if (focus.notes) lines.push(`- Notes: ${focus.notes}`)
      if (subtasks.length > 0) {
        lines.push('- Subtasks:')
        subtasks.forEach((s) =>
          lines.push(`  - [${s.status === 'completed' ? 'x' : ' '}] ${s.title} [id: ${s.id}]`)
        )
      }
      lines.push('')
    }
  }

  for (const type of getAllItemTypeNames()) {
    lines.push(
      ...getItemTypeConfig(type).ai.renderContextSection(
        state.items.filter((i) => itemTypeName(i) === type),
        { today, todayStr }
      )
    )
    lines.push('')
  }

  // --- Projects ---
  lines.push('### Projects')
  if (state.projects.length === 0) {
    lines.push('No projects.')
  } else {
    lines.push(state.projects.map((p) => p.name).join(', '))
  }

  return lines.join('\n')
}
