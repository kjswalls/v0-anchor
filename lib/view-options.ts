import {
  CheckCheck,
  ListTodo,
  Repeat,
  Rows3,
  Clock,
  List,
  Sun,
  CalendarDays,
  Layers,
  Folder,
  Flag,
  Hourglass,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import type { GroupBy } from './planner-types';
import type { BraindumpGroupBy, TypeFilter, ViewLayout, ViewScope } from './view-store';

/**
 * The canonical option lists for the canvas view controls, shared by the
 * header capsule's dropdowns and the command registry so a layout is labelled
 * and iconed identically wherever you change it from.
 */

export interface ViewOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

export const TYPE_OPTIONS: ViewOption<TypeFilter>[] = [
  { value: 'all', label: 'All', icon: CheckCheck },
  { value: 'tasks', label: 'Tasks', icon: ListTodo },
  { value: 'habits', label: 'Habits', icon: Repeat },
];

export const LAYOUT_OPTIONS: ViewOption<ViewLayout>[] = [
  { value: 'buckets', label: 'Buckets', icon: Rows3 },
  { value: 'schedule', label: 'Schedule', icon: Clock },
  { value: 'list', label: 'List', icon: List },
];

export const SCOPE_OPTIONS: ViewOption<ViewScope>[] = [
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'week', label: 'Week', icon: CalendarDays },
];

/**
 * 'status' is deliberately absent. It is a member of GroupBy, but
 * buildListGroups (components/views/day-list.tsx) has no branch for it, so
 * picking it renders identically to 'none'. Add the option back here the day
 * the branch exists.
 */
export type CanvasGroupBy = Exclude<GroupBy, 'status'>;

export const CANVAS_GROUP_BY_OPTIONS: ViewOption<CanvasGroupBy>[] = [
  { value: 'none', label: 'None', icon: Layers },
  { value: 'project', label: 'Project', icon: Folder },
  { value: 'priority', label: 'Priority', icon: Flag },
  { value: 'bucket', label: 'Time bucket', icon: Hourglass },
  // List layout only, like Priority — the Buckets layout honours Project alone
  // and the command's own description says so.
  { value: 'routine', label: 'Routine', icon: Repeat },
];

/**
 * Which canvas group-by values the CURRENT view actually honours, and why not.
 *
 * Not cosmetic: `day-list.tsx:164` passes canvasGroupBy to buildListGroups and
 * gets every branch, while `day-buckets.tsx:112` tests `=== 'project'` and
 * nothing else. So on Buckets, choosing Priority renders identically to None.
 *
 * Returns null when the value IS honoured, or the short reason for its rail when
 * it is not. The Display menu keeps unhonoured values visible and disabled with
 * that reason rather than hiding them: a menu whose contents change shape as you
 * switch layouts is harder to learn than one where a row explains itself — and a
 * hidden row cannot account for the clause the trigger's count is still adding
 * up, since neither setScope nor setLayout clears canvasGroupBy.
 *
 * Widened by Phase 5a, which is what makes Buckets and Week honour the rest.
 */
export function groupByBlockedBy(
  scope: ViewScope,
  layout: ViewLayout,
  value: CanvasGroupBy
): string | null {
  if (value === 'none') return null;
  // Seven columns already spend the primary axis; a second partition inside a
  // cell averaging two rows is decoration.
  if (scope === 'week') return 'Day only';
  // A row's y position IS its time, so a heading either breaks the axis or
  // floats free of it. Phase 5b gives Schedule lanes instead of headings.
  if (layout === 'schedule') return 'Not on Schedule';
  if (layout === 'list') return null;
  return value === 'project' ? null : 'List only';
}

/** The braindump's own group-by vocabulary — a different, smaller union. */
export const BRAINDUMP_GROUP_BY_OPTIONS: ViewOption<BraindumpGroupBy>[] = [
  { value: 'none', label: 'None', icon: Layers },
  { value: 'type', label: 'Type', icon: Shapes },
  { value: 'project', label: 'Project', icon: Folder },
];
