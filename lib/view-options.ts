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
  type LucideIcon,
} from 'lucide-react';
import type { GroupBy } from './planner-types';
import type { TypeFilter, ViewLayout, ViewScope } from './view-store';

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
