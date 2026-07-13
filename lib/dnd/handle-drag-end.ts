import type { TimeBucket } from '../planner-types';

/**
 * Pure resolution of a dnd-kit drop into a planner command.
 *
 * The droppable-ID grammar this parses is the parity contract for all view
 * rewrites — see lib/dnd/CONTRACT.md. The shell owns mapping the returned
 * command onto planner-store actions.
 */

export const BUCKET_IDS: readonly TimeBucket[] = ['anytime', 'morning', 'afternoon', 'evening'];

export type DropPosition = 'before' | 'after' | 'empty';

export type DropCommand =
  | { kind: 'schedule-task'; taskId: string; bucket: TimeBucket; time?: string; dateStr: string }
  | { kind: 'schedule-habit'; habitId: string; bucket: TimeBucket; time?: string }
  | { kind: 'assign-habit-bucket'; habitId: string; bucket: TimeBucket }
  | { kind: 'unschedule'; itemId: string }
  | { kind: 'move-task-to-project-block'; taskId: string };

export interface DropContext {
  /** What kind of item is being dragged (null → drop is ignored). */
  itemType: 'task' | 'habit' | null;
  /** Project of the dragged task, for the projectblock guard. */
  draggedTaskProject?: string;
  /** The date the canvas is showing, yyyy-MM-dd. */
  selectedDateStr: string;
  /** Start time of the reference item in a scheduled:{...}:{before|after} drop. */
  getRefTime: (refType: 'task' | 'habit', refId: string) => string | undefined;
  /** Infer a concrete time for a drop into a scheduled section. */
  inferDropTime: (bucket: TimeBucket, position: DropPosition, refTime?: string) => string;
}

export function resolveDrop(
  itemId: string,
  targetId: string,
  ctx: DropContext
): DropCommand | null {
  const { itemType, selectedDateStr } = ctx;
  if (!itemType) return null;

  // scheduled:{bucket}:{before|after}:{refType}:{refId} | scheduled:{bucket}:empty
  if (targetId.startsWith('scheduled:')) {
    const parts = targetId.split(':');
    const bucket = parts[1] as TimeBucket;
    const position = parts[2] as DropPosition;

    let time: string;
    if (position === 'empty') {
      time = ctx.inferDropTime(bucket, 'empty');
    } else {
      const refTime = ctx.getRefTime(parts[3] as 'task' | 'habit', parts[4]);
      time = ctx.inferDropTime(bucket, position, refTime);
    }

    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, time, dateStr: selectedDateStr }
      : { kind: 'schedule-habit', habitId: itemId, bucket, time };
  }

  // Bare bucket id (outer bucket droppable) — assign without a time
  if ((BUCKET_IDS as readonly string[]).includes(targetId)) {
    const bucket = targetId as TimeBucket;
    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, dateStr: selectedDateStr }
      : { kind: 'assign-habit-bucket', habitId: itemId, bucket };
  }

  // unscheduled:{bucket} — untimed section of a bucket
  if (targetId.startsWith('unscheduled:')) {
    const bucket = targetId.replace('unscheduled:', '') as TimeBucket;
    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, dateStr: selectedDateStr }
      : { kind: 'assign-habit-bucket', habitId: itemId, bucket };
  }

  // sidebar — drop back into the Braindump, i.e. unschedule
  if (targetId === 'sidebar') {
    return { kind: 'unschedule', itemId };
  }

  // projectblock:{projectName} — only tasks belonging to that project
  if (targetId.startsWith('projectblock:')) {
    const projectName = targetId.replace('projectblock:', '');
    if (itemType === 'task' && ctx.draggedTaskProject === projectName) {
      return { kind: 'move-task-to-project-block', taskId: itemId };
    }
    return null;
  }

  // hour:{H} — day-schedule grid slot; drop lands at the top of that hour
  // in the bucket that owns it (P5d "drop-on-hour" v1)
  if (targetId.startsWith('hour:')) {
    const hour = Number(targetId.slice(5));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    const bucket: TimeBucket = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const time = `${String(hour).padStart(2, '0')}:00`;
    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, time, dateStr: selectedDateStr }
      : { kind: 'schedule-habit', habitId: itemId, bucket, time };
  }

  // weekhour:{yyyy-MM-dd}:{H} — week-schedule grid slot; drop lands at the top
  // of that hour on that day's column (date has no colons, so split is safe)
  if (targetId.startsWith('weekhour:')) {
    const parts = targetId.split(':');
    const dateStr = parts[1];
    const hour = Number(parts[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    const bucket: TimeBucket = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const time = `${String(hour).padStart(2, '0')}:00`;
    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, time, dateStr }
      : { kind: 'schedule-habit', habitId: itemId, bucket, time };
  }

  // week:{yyyy-MM-dd}:{bucket}
  if (targetId.startsWith('week:')) {
    const parts = targetId.split(':');
    const dateStr = parts[1];
    const bucket = parts[2] as TimeBucket;
    return itemType === 'task'
      ? { kind: 'schedule-task', taskId: itemId, bucket, dateStr }
      : { kind: 'schedule-habit', habitId: itemId, bucket };
  }

  return null;
}
