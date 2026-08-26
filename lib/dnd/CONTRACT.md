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

### The bucket droppables only have a rect while a drag is in progress

The day-spine layout (`components/primitives/bucket-card.tsx`) gives a bucket no filled box
at rest — an empty one is a 22px caption on a hairline. Two consequences the IDs above do not
show:

1. **Nothing moved.** `setBucketRef` is still on the always-present wrapper in
   `day-buckets.tsx`, so `{bucket}` always has a measurable rect and every `data-dnd-*`
   marker still appears on the equivalent element. No ID, marker or action changed.
2. **The slot opens on activation, by design.** `BucketCard` takes a `dragging` prop and
   renders a recess for the duration of the drag. Four caption-only buckets would otherwise
   put their centres ~44px apart — inside the noise floor for `closestCenter` — and give the
   hover state nothing to paint. The slot must never be *animated* in: `MeasuringStrategy`
   is `Always`, but the rect has to be stable before the first collision pass, so only its
   height and fill transition. `helpers/dnd.ts` already relies on this ordering — it waits
   for the target *after* crossing the activation threshold, with the comment "the target
   may only have mounted just now."

### A collapsed bucket drops its inner droppables on purpose

A bucket the user has shut (`view-store.collapsedBuckets`, chevron on the caption) renders
its slot under a drag but **not its children** — so for that bucket
`unscheduled:{bucket}`, `scheduled:{bucket}:{pos}:…` and `scheduled:{bucket}:empty` do not
mount at all, and every drop onto it resolves on the bare `{bucket}` id.

That is safe rather than lossy: `resolveDrop` maps bare `{bucket}` and `unscheduled:{bucket}`
to the *same* command (assign the bucket, no time), so the outcome is identical to dropping
on the untimed section of an open bucket. It is also the point — a shut card holds one rect
instead of three, so there is nothing inside it for `closestCenter` to have to separate. The
alternative (mounting the real rows under a drag) would reflow the column at drag start,
which the rect-stability rule above forbids.

Two consequences for tests: `dragItemToBucket(..., 'untimed')` must accept the bare id (it
already does), and a spec that needs a *timed* drop has to ensure the target bucket is
expanded first — `[data-testid=bucket-card][data-bucket=X][data-collapsed=false]`.

`app-shell.tsx` expands the target bucket after any drop that carries one, so a drop never
lands behind a closed sliver.

### Known-flaky: leftover rows change every bucket drag's geometry

`global-setup.ts` sweeps litter, but only titles matching `TEST_TITLE_PREFIX` (`e2e_`). Rows
from older conventions (`Panel first …`, `EOD complete test …`, `Mobile daily future …`)
accumulate permanently in the shared test user, make the morning bucket arbitrarily tall, and
push later buckets toward or past the scroll boundary — which is the autoscroll
non-determinism described at the bottom of this file. Measured on 2026-08-09: with ~23 such
rows present, `dnd.spec.ts` fails a *different* test on each run, and does so identically on
a pristine checkout. If a bucket drag flakes, check the account's row count before the diff.
Locally also pass `--workers=1`: `workers` is only pinned under `CI`, and parallel specs
share one test user.

## Sensors (`components/shell/app-shell.tsx`, policy in `lib/dnd/sensors.ts`)

- `NonTouchPointerSensor` — activationConstraint `{ distance: 5 }`
- `TouchSensor` — activationConstraint `{ delay: 250, tolerance: 5 }`
- `collisionDetection` — `closestCenter`

`NonTouchPointerSensor` is `PointerSensor` with one extra line in its activator:
it returns `false` for `pointerType === 'touch'`. That line is the whole reason
touch drag and touch scroll can coexist, and it is load-bearing rather than
cosmetic — a plain `PointerSensor` also fires for fingers, and dnd-kit lets only
the *first* sensor claim a gesture (`activeRef.current !== null` → "another
sensor is already instantiating"). Since `pointerdown` precedes `touchstart`,
the pointer sensor used to win every touch and the `TouchSensor` line below was
dead configuration: a 5px flick dragged a row instead of scrolling the list, and
raced `components/mobile/swipe-row.tsx`, which claims horizontal intent at 10px.

**Split by input type, never by viewport.** A media query mis-handles a
touchscreen laptop in both directions. `pointerType` is per-gesture and honest.

Two consequences for tests and helpers:

- Anything driving a drag through Playwright's `page.mouse` (`tests/e2e/helpers/dnd.ts`)
  is unaffected — those are `pointerType: 'mouse'`, so the 5px distance
  constraint still governs, exactly as before.
- A drag driven by *touch* must press and hold ≥250ms, moving <5px, before it
  moves. There is no e2e touch drag today; one would need that hold.

### The schedule grid's resize handles are mouse/pen only

`components/views/day-schedule.tsx` declines `onResizeDown` for touch pointers.
The hit zone is 12px tall — unaimable with a fingertip, yet crossed constantly by
a scrolling thumb, and every crossing captured the pointer and wrote a new
duration on release. It is not a drop target and no ID above changes; the touch
path to the same edit is the duration field in the item dialog.

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
