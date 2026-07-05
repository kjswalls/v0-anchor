# DnD ID Contract

Parity spec for the redesign view rewrites. `tests/e2e/dnd.spec.ts` is the acceptance
gate and asserts against this grammar — view rewrites (P5a-d) may change styling and
DOM structure freely, but every draggable/droppable ID below must keep its exact shape
and semantics. Edits to this grammar are forbidden without updating the e2e spec and
this document together.

Source of truth today: `handleDragEnd` in `app/page.tsx` (~line 248). P2 extracts it
verbatim into `lib/dnd/handle-drag-end.ts` as a pure function.

## Draggable IDs

Raw item ids: `active.id === task.id | habit.id`. Type is resolved by store lookup,
not encoded in the id.

## Droppable IDs

| Pattern | Meaning | Action on drop (task / habit) |
|---|---|---|
| `scheduled:{bucket}:{pos}:{refType}:{refId}` | Timed slot relative to a reference item. `pos` = `before` \| `after`; `refType` = `task` \| `habit` | `scheduleTask(id, bucket, inferDropTime(bucket, pos, refTime), selectedDateStr)` / `scheduleHabit(id, bucket, time)` |
| `scheduled:{bucket}:empty` | Empty timed section of a bucket | same, with `inferDropTime(bucket, 'empty')` |
| `unscheduled:{bucket}` | Untimed section of a bucket | `scheduleTask(id, bucket, undefined, selectedDateStr)` / `assignHabitToBucket(id, bucket)` |
| `anytime` \| `morning` \| `afternoon` \| `evening` | Bare outer bucket (legacy fallback) | same as `unscheduled:{bucket}` |
| `week:{yyyy-MM-dd}:{bucket}` | Week-view day cell | `scheduleTask(id, bucket, undefined, date)` / `scheduleHabit(id, bucket)` |
| `projectblock:{projectName}` | Project block in day view | `moveTaskToProjectBlock(id)` — only if `task.project === projectName`; habits ignored |
| `sidebar` | Sidebar (Braindump in redesign) | `unscheduleTask(id)`; habits ignored |

`{bucket}` ∈ `anytime | morning | afternoon | evening` (`TimeBucket`).

## Helpers

- `inferDropTime(bucket, pos, refTime?)` — currently exported from
  `components/planner/timeline.tsx:886`; moves to `lib/dnd/` in P2. Derives a
  `HH:mm` for a drop relative to a reference item's `startTime`, or a bucket
  default for `empty`.

## Sensors (app/page.tsx ~228)

- `PointerSensor` — activationConstraint `{ distance: 8 }`
- `TouchSensor` — activationConstraint `{ delay: 250, tolerance: 5 }`

## Store actions consumed

`scheduleTask(id, bucket, time?, dateStr?)` · `scheduleHabit(id, bucket, time?)` ·
`assignHabitToBucket(id, bucket)` · `unscheduleTask(id)` · `moveTaskToProjectBlock(id)`
(all `lib/planner-store.ts`).

## Definition sites today (for the rewrites)

useDraggable/useDroppable: `timeline.tsx` (8), `task-sidebar.tsx` (3),
`week-view.tsx` (3), `mobile-tasks-panel.tsx` (2), `mobile-schedule-panel.tsx` (2).

## P5d addition

| ID | Meaning | Handler result |
|---|---|---|
| `hour:{H}` | Day-schedule grid slot (0–23) | schedule at `HH:00`; bucket = morning <12, afternoon <17, else evening |
