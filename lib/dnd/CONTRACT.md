# DnD ID Contract

Parity spec for the view rewrites. `tests/e2e/dnd.spec.ts` is the acceptance gate and
asserts against this grammar — views may change styling and DOM structure freely, but
every draggable/droppable ID below must keep its exact shape and semantics, and every
DOM marker in the next section must keep appearing on the equivalent element. Edits to
either are forbidden without updating this document and the spec together.

Source of truth: `handleDragEnd` in `lib/dnd/handle-drag-end.ts`, wired up by
`components/shell/app-shell.tsx`.

## DOM markers (what the tests actually select on)

The droppable IDs below are dnd-kit's internal registry — invisible to Playwright. These
attributes are how they become testable, and they are as much a part of the contract as
the IDs:

| Attribute | On | Meaning |
|---|---|---|
| `data-dnd-bucket="{bucket}"` | bucket section container | that bucket's region |
| `data-dnd-id="{id}"` | every droppable | its ID from the table below |
| `data-dnd-over="true\|false"` | every droppable | dnd-kit reports the pointer over it |
| `data-testid="item-card"` + `data-item-id` + `data-item-kind` | every draggable row | identity |
| `data-bucket` / `data-start-time` | every draggable row | the row's resolved slot |

`data-dnd-over` is load-bearing, not decorative: it is the only way a test can wait for
the app to confirm a drop target instead of sleeping. `tests/e2e/helpers/dnd.ts` homes in
on it, and `dnd.spec.ts` asserts that no droppable is missing it.

## Draggable IDs

Raw item ids: `active.id === item.id`. Type is resolved by store lookup, not encoded in
the id. **Both tasks and habits are drag sources** (`components/primitives/task-row.tsx`).

## Droppable IDs

| Pattern | Meaning | Action on drop (task / habit) |
|---|---|---|
| `scheduled:{bucket}:{pos}:{refType}:{refId}` | Timed slot relative to a reference item. `pos` = `before` \| `after`; `refType` = `task` \| `habit` | `scheduleTask(id, bucket, inferDropTime(bucket, pos, refTime), selectedDateStr)` / `scheduleHabit(id, bucket, time)` |
| `scheduled:{bucket}:empty` | Empty timed section of a bucket | same, with `inferDropTime(bucket, 'empty')` |
| `unscheduled:{bucket}` | Untimed section of a bucket | `scheduleTask(id, bucket, undefined, selectedDateStr)` / `assignHabitToBucket(id, bucket)` |
| `anytime` \| `morning` \| `afternoon` \| `evening` | Bare outer bucket (fallback) | same as `unscheduled:{bucket}` |
| `week:{yyyy-MM-dd}:{bucket}` | Week-view day cell | `scheduleTask(id, bucket, undefined, date)` / `scheduleHabit(id, bucket)` |
| `hour:{H}` | Day-schedule grid slot (0–23) | schedule at `HH:00`; bucket = morning <12, afternoon <17, else evening |
| `weekhour:{yyyy-MM-dd}:{H}` | Week-schedule grid slot | schedule task on that day at `HH:00` (habit: time only, no date) |
| `week:{yyyy-MM-dd}:anytime` | Week-schedule per-day Anytime strip | schedule on that day, `anytime` bucket, no time |
| `projectblock:{projectName}` | Project block in day view | `moveTaskToProjectBlock(id)` — only if `task.project === projectName`; habits ignored |
| `sidebar` | Braindump | `unscheduleTask(id)`; **no-ops for habits** (they are not braindump-eligible) |

`{bucket}` ∈ `anytime | morning | afternoon | evening` (`TimeBucket`).

### The bare bucket and `unscheduled:{bucket}` are not separable by pointer

For an EMPTY bucket their centres sit ~3px apart (measured: 802 vs 799), and collision is
`closestCenter`, which compares centres — so no pointer position reliably selects one over
the other. They are defined as the same action, so this is harmless, but a test must accept
either. `dragItemToBucket(..., 'untimed')` does exactly that. Demanding one specific id is a
test that cannot pass.

## Sensors (`components/shell/app-shell.tsx`)

- `PointerSensor` — activationConstraint `{ distance: 5 }`
- `TouchSensor` — activationConstraint `{ delay: 250, tolerance: 5 }`
- `collisionDetection` — `closestCenter`

`closestCenter` compares the **dragged element's rect centre**, not the cursor. A helper
that aims the pointer at the target's centre is aiming at the wrong thing whenever the grab
point is off-centre on the row.

## Helpers

- `inferDropTime(bucket, pos, refTime?)` — `lib/dnd/infer-drop-time.ts`. Derives a `HH:mm`
  for a drop relative to a reference item's `startTime`, or a bucket default for `empty`.
- `autoCorrectBucket(time, bucket)` — re-derives the bucket from an explicit time, so a
  drop that sets a time cannot leave the row in a contradictory bucket.

## Store actions consumed

`scheduleTask(id, bucket, time?, dateStr?)` · `scheduleHabit(id, bucket, time?)` ·
`assignHabitToBucket(id, bucket)` · `unscheduleTask(id)` · `moveTaskToProjectBlock(id)`
(all `lib/planner-store.ts`).

## Definition sites

`useDroppable`: `components/views/day-buckets.tsx` (bucket, unscheduled, scheduled:*:empty,
scheduled:*:before/after), `components/views/week-buckets.tsx` (`week:*`),
`components/views/day-schedule.tsx` (`hour:*`, `unscheduled:anytime`),
`components/views/week-schedule.tsx` (`weekhour:*`, `week:*:anytime`),
`components/views/project-block.tsx` (`projectblock:*`), `components/sidebar/braindump.tsx`
(`sidebar`).

`useDraggable`: `components/primitives/task-row.tsx` (rows),
`components/views/day-schedule.tsx` (schedule blocks).

## Testing note: autoscroll

A drag that crosses a scroll boundary triggers dnd-kit's autoscroll, and dnd-kit collides
droppable rects measured at drag START against a scroll-COMPENSATED active rect. After an
autoscroll its model and the live layout disagree by the scroll delta, so the outcome
depends on how much scrolling accumulated mid-gesture and is not deterministically
drivable from Playwright. Test bucket reassignment against a NEIGHBOURING bucket — the
store action and observable are identical — and cover long-distance moves through the
schedule sheet, which issues the same commands without a gesture.
