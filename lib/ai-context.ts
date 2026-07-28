import { format } from 'date-fns'
import { ALL_ITEM_TYPES, ITEM_TYPES } from './item-registry'
import type { Item, Project, HabitGroupType } from './planner-types'

/**
 * Builds the Beacon chat context. Each item type contributes its own section
 * via the registry's `ai.renderContextSection` — the per-type presentations
 * (task: date-scoped with Overdue; habit: date-blind, streak-annotated) are
 * pinned there, byte-identical to the pre-unification builder.
 */
export function buildAnchorContext(state: {
  items: Item[]
  projects: Project[]
  habitGroups: HabitGroupType[]
}): string {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const lines: string[] = []

  lines.push('## Anchor Context')
  lines.push(`Date: ${format(today, 'EEEE, MMMM d yyyy')}`)
  lines.push('')

  for (const type of ALL_ITEM_TYPES) {
    lines.push(
      ...ITEM_TYPES[type].ai.renderContextSection(
        state.items.filter((i) => i.type === type),
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
