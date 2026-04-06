import { createClient } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;
import type { Task, Habit, Project, HabitGroupType } from './planner-types';
import { notifyPlugins } from './openclaw-registry';

// ---- Task row type ----
interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  priority?: string | null;
  project?: string | null;
  start_date?: string | null;
  status: string;
  time_bucket?: string | null;
  start_time?: string | null;
  duration?: number | null;
  is_scheduled: boolean;
  repeat_frequency?: string | null;
  repeat_days?: number[] | null;
  repeat_month_day?: number | null;
  completed_dates: string[] | null;
  order: number;
  in_project_block?: boolean | null;
  previous_start_time?: string | null;
  previous_start_date?: string | null;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    priority: (row.priority ?? undefined) as Task['priority'],
    project: row.project ?? undefined,
    startDate: row.start_date ?? undefined,
    status: row.status as Task['status'],
    timeBucket: (row.time_bucket ?? undefined) as Task['timeBucket'],
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
    isScheduled: row.is_scheduled,
    repeatFrequency: (row.repeat_frequency ?? undefined) as Task['repeatFrequency'],
    repeatDays: row.repeat_days ?? undefined,
    repeatMonthDay: row.repeat_month_day ?? undefined,
    completedDates: row.completed_dates ?? [],
    order: row.order,
    inProjectBlock: row.in_project_block ?? undefined,
    previousStartTime: row.previous_start_time ?? undefined,
    previousStartDate: row.previous_start_date ?? undefined,
  };
}

function taskToRow(userId: string, task: Task): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    priority: task.priority ?? null,
    project: task.project ?? null,
    start_date: task.startDate ?? null,
    status: task.status,
    time_bucket: task.timeBucket ?? null,
    start_time: task.startTime ?? null,
    duration: task.duration ?? null,
    is_scheduled: task.isScheduled,
    repeat_frequency: task.repeatFrequency ?? null,
    repeat_days: task.repeatDays ?? null,
    repeat_month_day: task.repeatMonthDay ?? null,
    completed_dates: task.completedDates ?? [],
    order: task.order,
    in_project_block: task.inProjectBlock ?? null,
    previous_start_time: task.previousStartTime ?? null,
    previous_start_date: task.previousStartDate ?? null,
  };
}

function taskUpdatesToRow(updates: Partial<Task>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('priority' in updates) row.priority = updates.priority ?? null;
  if ('project' in updates) row.project = updates.project ?? null;
  if ('startDate' in updates) row.start_date = updates.startDate ?? null;
  if ('status' in updates) row.status = updates.status;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  if ('isScheduled' in updates) row.is_scheduled = updates.isScheduled;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency ?? null;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('completedDates' in updates) row.completed_dates = updates.completedDates ?? [];
  if ('order' in updates) row.order = updates.order;
  if ('inProjectBlock' in updates) row.in_project_block = updates.inProjectBlock ?? null;
  if ('previousStartTime' in updates) row.previous_start_time = updates.previousStartTime ?? null;
  if ('previousStartDate' in updates) row.previous_start_date = updates.previousStartDate ?? null;
  return row;
}

export async function fetchTasks(userId: string, client?: DbClient): Promise<Task[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('order', { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(taskFromRow);
}

export async function createTask(userId: string, task: Task, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('tasks').insert(taskToRow(userId, task));
  if (error) throw error;
  notifyPlugins(userId, 'tasks.updated', { action: 'create', task });
}

export async function updateTask(id: string, updates: Partial<Task>, userId?: string, client?: DbClient): Promise<void> {
  const row = taskUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('tasks').update(row).eq('id', id);
  if (error) throw error;
  if (userId) notifyPlugins(userId, 'tasks.updated', { action: 'update', id, updates });
}

export async function deleteTask(id: string, userId?: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  if (userId) notifyPlugins(userId, 'tasks.updated', { action: 'delete', id });
}

export async function restoreTask(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('tasks').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

export async function dbToggleTaskCompletedDate(id: string, dateStr: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("toggle_task_completed_date", {
    task_id: id,
    date_str: dateStr,
  });
  if (error) throw error;
}

// ---- Habit row type ----
interface HabitRow {
  id: string;
  user_id: string;
  title: string;
  group: string;
  streak: number;
  status: string;
  completed_dates: string[];
  skipped_dates: string[];
  daily_counts: Record<string, number>;
  time_bucket?: string | null;
  start_time?: string | null;
  repeat_frequency: string;
  repeat_days?: number[] | null;
  repeat_month_day?: number | null;
  times_per_day?: number | null;
  current_day_count?: number | null;
}

function habitFromRow(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    group: row.group,
    streak: row.streak,
    status: row.status as Habit['status'],
    completedDates: row.completed_dates ?? [],
    skippedDates: row.skipped_dates ?? [],
    dailyCounts: row.daily_counts ?? {},
    timeBucket: (row.time_bucket ?? undefined) as Habit['timeBucket'],
    startTime: row.start_time ?? undefined,
    repeatFrequency: row.repeat_frequency as Habit['repeatFrequency'],
    repeatDays: row.repeat_days ?? undefined,
    repeatMonthDay: row.repeat_month_day ?? undefined,
    timesPerDay: row.times_per_day ?? undefined,
    currentDayCount: row.current_day_count ?? undefined,
  };
}

function habitToRow(userId: string, habit: Habit): HabitRow {
  return {
    id: habit.id,
    user_id: userId,
    title: habit.title,
    group: habit.group,
    streak: habit.streak,
    status: habit.status,
    completed_dates: habit.completedDates,
    skipped_dates: habit.skippedDates,
    daily_counts: habit.dailyCounts,
    time_bucket: habit.timeBucket ?? null,
    start_time: habit.startTime ?? null,
    repeat_frequency: habit.repeatFrequency,
    repeat_days: habit.repeatDays ?? null,
    repeat_month_day: habit.repeatMonthDay ?? null,
    times_per_day: habit.timesPerDay ?? null,
    current_day_count: habit.currentDayCount ?? null,
  };
}

function habitUpdatesToRow(updates: Partial<Habit>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in updates) row.title = updates.title;
  if ('group' in updates) row.group = updates.group;
  if ('streak' in updates) row.streak = updates.streak;
  if ('status' in updates) row.status = updates.status;
  if ('completedDates' in updates) row.completed_dates = updates.completedDates;
  if ('skippedDates' in updates) row.skipped_dates = updates.skippedDates;
  if ('dailyCounts' in updates) row.daily_counts = updates.dailyCounts;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('timesPerDay' in updates) row.times_per_day = updates.timesPerDay ?? null;
  if ('currentDayCount' in updates) row.current_day_count = updates.currentDayCount ?? null;
  return row;
}

export async function fetchHabits(userId: string, client?: DbClient): Promise<Habit[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as HabitRow[]).map(habitFromRow);
}

export async function createHabit(userId: string, habit: Habit, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habits').insert(habitToRow(userId, habit));
  if (error) throw error;
  notifyPlugins(userId, 'habits.updated', { action: 'create', habit });
}

export async function updateHabit(id: string, updates: Partial<Habit>, userId?: string, client?: DbClient): Promise<void> {
  const row = habitUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habits').update(row).eq('id', id);
  if (error) throw error;
  if (userId) notifyPlugins(userId, 'habits.updated', { action: 'update', id, updates });
}

export async function deleteHabit(id: string, userId?: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habits').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  if (userId) notifyPlugins(userId, 'habits.updated', { action: 'delete', id });
}

export async function restoreHabit(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('habits').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

// ---- Project row type ----
interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  repeat_frequency?: string | null;
  repeat_days?: number[] | null;
  repeat_month_day?: number | null;
  time_bucket?: string | null;
  start_time?: string | null;
  duration?: number | null;
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    repeatFrequency: (row.repeat_frequency ?? undefined) as Project['repeatFrequency'],
    repeatDays: row.repeat_days ?? undefined,
    repeatMonthDay: row.repeat_month_day ?? undefined,
    timeBucket: (row.time_bucket ?? undefined) as Project['timeBucket'],
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
  };
}

function projectToRow(userId: string, project: Project): ProjectRow {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    emoji: project.emoji,
    repeat_frequency: project.repeatFrequency ?? null,
    repeat_days: project.repeatDays ?? null,
    repeat_month_day: project.repeatMonthDay ?? null,
    time_bucket: project.timeBucket ?? null,
    start_time: project.startTime ?? null,
    duration: project.duration ?? null,
  };
}

function projectUpdatesToRow(updates: Partial<Project>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('emoji' in updates) row.emoji = updates.emoji;
  if ('repeatFrequency' in updates) row.repeat_frequency = updates.repeatFrequency ?? null;
  if ('repeatDays' in updates) row.repeat_days = updates.repeatDays ?? null;
  if ('repeatMonthDay' in updates) row.repeat_month_day = updates.repeatMonthDay ?? null;
  if ('timeBucket' in updates) row.time_bucket = updates.timeBucket ?? null;
  if ('startTime' in updates) row.start_time = updates.startTime ?? null;
  if ('duration' in updates) row.duration = updates.duration ?? null;
  return row;
}

export async function fetchProjects(userId: string, client?: DbClient): Promise<Project[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as ProjectRow[]).map(projectFromRow);
}

export async function createProject(userId: string, project: Project, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').insert(projectToRow(userId, project));
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'create', project });
}

export async function updateProject(userId: string, id: string, updates: Partial<Project>, client?: DbClient): Promise<void> {
  const row = projectUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').update(row).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'update', id, updates });
}

export async function deleteProject(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'projects.updated', { action: 'delete', id });
}

export async function restoreProject(userId: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null })
    .eq('user_id', userId)
    .eq('name', name);
  if (error) throw error;
}

// ---- HabitGroup row type ----
interface HabitGroupRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color?: string | null;
}

function habitGroupFromRow(row: HabitGroupRow): HabitGroupType {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color ?? undefined,
  };
}

function habitGroupToRow(userId: string, group: HabitGroupType): HabitGroupRow {
  return {
    id: group.id,
    user_id: userId,
    name: group.name,
    emoji: group.emoji,
    color: group.color ?? null,
  };
}

function habitGroupUpdatesToRow(updates: Partial<HabitGroupType>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('name' in updates) row.name = updates.name;
  if ('emoji' in updates) row.emoji = updates.emoji;
  if ('color' in updates) row.color = updates.color ?? null;
  return row;
}

export async function fetchHabitGroups(userId: string, client?: DbClient): Promise<HabitGroupType[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from('habit_groups')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return (data as HabitGroupRow[]).map(habitGroupFromRow);
}

export async function createHabitGroup(userId: string, group: HabitGroupType, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').insert(habitGroupToRow(userId, group));
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'create', group });
}

export async function updateHabitGroup(userId: string, id: string, updates: Partial<HabitGroupType>, client?: DbClient): Promise<void> {
  const row = habitGroupUpdatesToRow(updates);
  if (Object.keys(row).length === 0) return;
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').update(row).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'update', id, updates });
}

export async function deleteHabitGroup(userId: string, id: string, client?: DbClient): Promise<void> {
  const supabase = client ?? createClient();
  const { error } = await supabase.from('habit_groups').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyPlugins(userId, 'habitGroups.updated', { action: 'delete', id });
}

export async function restoreHabitGroup(userId: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('habit_groups')
    .update({ deleted_at: null })
    .eq('user_id', userId)
    .eq('name', name);
  if (error) throw error;
}
