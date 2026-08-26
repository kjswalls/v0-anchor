import type { DragInput } from './sensors';

/**
 * Which drop targets each input type is offered — the one place that answers it.
 *
 * ## What this is for
 *
 * The droppable grammar in lib/dnd/CONTRACT.md is written for a cursor. One
 * entry in it is a target a finger cannot use:
 * `scheduled:{bucket}:{before|after}:{ref}` is an 8px sliver between two timed
 * rows (`h-2 -my-0.5`, `day-buckets.tsx`). Mechanically it is a MOVE like every
 * other drop — `inferDropTime` resolves it as ±30 min from the reference row's
 * own time — so it is not the drag-to-reorder that `dnd-no-reorder.test.ts`
 * forbids. It is worse in a different way: unaimable with a thumb, and, being
 * the target that sits *in the scroll path between rows*, the one most likely to
 * take a gesture that meant to scroll.
 *
 * Kirby's call: remove it for touch, and accept the cost — on a phone there is
 * no longer a way to say "put this just before that one"; you drop the row in
 * the bucket and set its time. Mouse and pen keep it exactly as it was.
 *
 * ## Why a table and not an `isTouch &&`
 *
 * Two places must agree: the view must not MOUNT the target for a touch drag
 * (so `closestCenter` cannot pick it, and so nothing paints a hover the finger
 * cannot land on), and `resolveDrop` must not RESOLVE it (so a target that
 * comes back by accident does not quietly resume writing times). An `isTouch`
 * branch at each of those, plus at any future site, is exactly the scattering
 * the registry convention in CLAUDE.md exists to prevent — and the reason the
 * rule is easy to half-revert. So the rule is a `Record` keyed by the target
 * KIND, and both sites ask it.
 *
 * `Record<DropTargetKind, …>` makes it a compile-time question too: a new kind
 * of drop target fails `tsc` until someone answers "can a thumb hit this?".
 */
export type DropTargetKind =
  /** `scheduled:{bucket}:{before|after}:{refType}:{refId}` — the 8px sliver. */
  | 'relative-time'
  /** `scheduled:{bucket}:empty` — the labelled tray in an empty timed section. */
  | 'bucket-timed'
  /** `unscheduled:{bucket}` and the bare `{bucket}` fallback. */
  | 'bucket-untimed'
  /** `week:{date}:{bucket}` — a week-view day cell, Anytime strip included. */
  | 'week-cell'
  /** `hour:{H}` and `weekhour:{date}:{H}` — a schedule-grid hour slot. */
  | 'hour-slot'
  /** `projectblock:{name}`. */
  | 'project-block'
  /** `sidebar` — the braindump. */
  | 'braindump';

const EVERY_INPUT: readonly DragInput[] = ['pointer', 'touch'];
/** Mouse and pen only. The list a target lands on when a fingertip cannot aim it. */
const POINTER_ONLY: readonly DragInput[] = ['pointer'];

/**
 * The rule itself. Every kind is offered to everything except the sliver.
 *
 * Note what is NOT restricted, because the boundary is the point: every other
 * mobile drag Kirby kept lands here — row → another bucket (`bucket-untimed`),
 * row → another day (`week-cell`), row → an hour on the schedule grid
 * (`hour-slot`), row → a project block, braindump → grid, and the labelled
 * "Drop here to schedule with time" tray (`bucket-timed`), which is a 40px box
 * with a label, not a sliver between rows.
 */
export const OFFERED_TO: Record<DropTargetKind, readonly DragInput[]> = {
  'relative-time': POINTER_ONLY,
  'bucket-timed': EVERY_INPUT,
  'bucket-untimed': EVERY_INPUT,
  'week-cell': EVERY_INPUT,
  'hour-slot': EVERY_INPUT,
  'project-block': EVERY_INPUT,
  braindump: EVERY_INPUT,
};

const BARE_BUCKETS = new Set(['anytime', 'morning', 'afternoon', 'evening']);

/**
 * Parse a droppable id into its kind, or `null` if the grammar does not know it.
 *
 * This mirrors `resolveDrop`'s parse rather than sharing it, because the mount
 * site needs the answer while the drop is still hypothetical — there is no
 * command to classify yet. `dnd-touch-drop-targets.test.tsx` runs the same id
 * list through both, so the two cannot drift apart silently.
 */
export function dropTargetKind(targetId: string): DropTargetKind | null {
  if (targetId.startsWith('scheduled:')) {
    const position = targetId.split(':')[2];
    if (position === 'empty') return 'bucket-timed';
    if (position === 'before' || position === 'after') return 'relative-time';
    return null;
  }
  if (targetId.startsWith('unscheduled:')) return 'bucket-untimed';
  if (BARE_BUCKETS.has(targetId)) return 'bucket-untimed';
  if (targetId.startsWith('weekhour:') || targetId.startsWith('hour:')) return 'hour-slot';
  if (targetId.startsWith('week:')) return 'week-cell';
  if (targetId.startsWith('projectblock:')) return 'project-block';
  if (targetId === 'sidebar') return 'braindump';
  return null;
}

/**
 * May this input type reach this drop target?
 *
 * An id the grammar does not recognise answers YES — permissive, so a droppable
 * added without a kind keeps behaving as it always did rather than vanishing for
 * half the users. The test that keeps that honest is the one asserting every id
 * in CONTRACT.md § Droppable IDs classifies to a non-null kind: a new grammar
 * entry that nobody classified fails there, not in production.
 */
export function isDropTargetOffered(targetId: string, input: DragInput): boolean {
  const kind = dropTargetKind(targetId);
  return kind === null || OFFERED_TO[kind].includes(input);
}
