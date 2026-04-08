# EOD Task Completion Bugfix Plan

## Summary

The EOD Review modal has three interrelated bugs caused by a **dual-state design** where task completion is tracked in two independent places: the Zustand store (`task.status`) and local React state (`justCompletedIds`). These can desync, causing tasks to appear in both sections, disappear, or fail to move back correctly.

---

## Bug 1: Tasks appear in BOTH "Done today" AND "Still on your list" simultaneously

### Root Cause

When a user marks a task complete in the "Still on your list" section via `handleMarkDone`:

1. `updateTask(id, { status: 'completed' })` is called → store updates `task.status` to `'completed'`
2. `justCompletedIds` adds the task ID

Now the task satisfies **both** display conditions:
- **"Done today"** section: `completedTasks` is derived from `tasks.filter(t => t.startDate === today && t.status === 'completed')` — the task now matches because `status === 'completed'`
- **"Still on your list"** section: `pendingTasks` is a **snapshot** taken when the modal opened (line ~82: `pendingTasksSnapshot`). The snapshot still contains this task (it was pending at open time). The task renders in this section with a green checkmark (because `justCompletedIds.has(task.id)` is true), but it's **still in the list**.

**The task appears in both sections simultaneously.** The "Done today" section shows it because the store updated. The "Still on your list" section shows it because the snapshot is frozen.

### Fix

The "Done today" section should **exclude** tasks that are in `justCompletedIds`, OR the "Still on your list" section should filter out tasks whose store status has changed to `'completed'`.

**Recommended approach:** Filter `completedTasks` in the "Done today" rendering to only show tasks that were *already* completed when the modal opened (i.e., not in `justCompletedIds`). Tasks in `justCompletedIds` are already shown with a checkmark in the pending section — that's the intended UX (checked off inline with undo capability).

**File:** `components/ai/eod-review.tsx`

**Change:** In the "Done today" section rendering (~line 155), filter out tasks that are in `justCompletedIds`:

```tsx
// Current (buggy):
{completedTasks.map((task) => (

// Fixed:
{completedTasks.filter(t => !justCompletedIds.has(t.id)).map((task) => (
```

Also update the section visibility condition (~line 149):
```tsx
// Current:
{(completedTasks.length > 0 || doneHabits.length > 0) && (

// Fixed:
{(completedTasks.filter(t => !justCompletedIds.has(t.id)).length > 0 || doneHabits.length > 0) && (
```

**Better approach** — compute once:
```tsx
// Add after justCompletedIds state declaration:
const preExistingCompletedTasks = useMemo(
  () => completedTasks.filter(t => !justCompletedIds.has(t.id)),
  [completedTasks, justCompletedIds]
);
```
Then use `preExistingCompletedTasks` everywhere `completedTasks` was used in rendering.

---

## Bug 2: Completed tasks sometimes don't appear in the "Done today" section

### Root Cause

This is the **inverse** of Bug 1's scenario — tasks completed *before* opening the modal work fine. But tasks completed *during* the session via the timeline (or outside the EOD modal) won't appear in "Done today" if they were in the pending snapshot.

More importantly: if a task was completed earlier today via the **timeline**, it correctly shows in "Done today" (`completedTasks` from the store). **However**, if the user completed it via the timeline and then opened the EOD modal, the `pendingTasksSnapshot` was captured *after* the task was already completed — so it won't be in the snapshot, and it correctly shows only in "Done today". This path works.

The actual "doesn't appear" bug happens in a subtler scenario:
1. User opens EOD modal — task A is pending, appears in snapshot
2. User marks task A done via `handleMarkDone` — it gets a checkmark in "Still on your list"
3. User closes and reopens the EOD modal
4. On reopen: `justCompletedIds` is **NOT reset** (the `useEffect` that resets state on close only resets `taskActions`, `undoStack`, and `datePickerOpenId` — **not** `justCompletedIds`)
5. Now `justCompletedIds` still has task A's ID from the previous session
6. The new `pendingTasksSnapshot` doesn't include task A (it's now completed in store)
7. Task A is in `completedTasks` (from store) but if we applied Bug 1's fix, it would be filtered out by `justCompletedIds` — making it **invisible in both sections**

### Fix

**Reset `justCompletedIds` when the modal closes.** Add it to the cleanup effect (~line 101):

```tsx
// Current:
useEffect(() => {
  if (!isOpen) {
    setTaskActions(new Map());
    setUndoStack(new Map());
    setDatePickerOpenId(null);
  }
}, [isOpen]);

// Fixed:
useEffect(() => {
  if (!isOpen) {
    setJustCompletedIds(new Set());
    setTaskActions(new Map());
    setUndoStack(new Map());
    setDatePickerOpenId(null);
  }
}, [isOpen]);
```

This is **critical** and must be applied alongside Bug 1's fix — otherwise stale `justCompletedIds` from a previous session corrupt the next session's rendering.

---

## Bug 3: Uncompleting a task from "Done today" doesn't always move it back to "Still on your list"

### Root Cause

When clicking the checkmark on a task in the "Done today" section, `handleUnmarkDone` is called:

1. `updateTask(id, { status: 'pending' })` — store sets task back to pending
2. `justCompletedIds` removes the ID

After this:
- The task is removed from `completedTasks` (status is no longer `'completed'`) — it disappears from "Done today" ✓
- But `pendingTasks` is a **frozen snapshot** from modal open time. If this task was *already completed* when the modal opened, it was never in the snapshot → it **won't appear in "Still on your list"** either

The task simply vanishes from the UI.

### Fix

The pending section needs to include tasks that were uncompleted from "Done today" during this session. Two approaches:

**Option A (simpler):** Track "just uncompleted" IDs and merge them into the pending list.

**Option B (recommended):** Instead of using a frozen snapshot, derive the pending list more intelligently. Replace the snapshot approach with a **live** pending list that includes:
- All tasks from the original snapshot that haven't been moved/dismissed
- Plus any tasks the user just uncompleted from "Done today"

Implementation:

```tsx
// Add new state to track IDs uncompleted from "Done today" during this session
const [justUncompletedIds, setJustUncompletedIds] = useState<Set<string>>(new Set());

// Reset on close:
// Add to the cleanup useEffect:
setJustUncompletedIds(new Set());

// Update handleUnmarkDone:
const handleUnmarkDone = (id: string) => {
  updateTask(id, { status: 'pending' });
  setJustCompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  // If the task wasn't in the original snapshot (was pre-completed), track it
  if (!pendingTasksSnapshot.some(t => t.id === id)) {
    setJustUncompletedIds((prev) => new Set(prev).add(id));
  }
};

// Derive the effective pending list:
const pendingTasks = useMemo(() => {
  if (!isOpen) return livePendingTasks;
  // Start with snapshot, add any tasks that were uncompleted from "Done today"
  const uncompletedTasks = tasks.filter(t => justUncompletedIds.has(t.id) && t.status === 'pending');
  const snapshotIds = new Set(pendingTasksSnapshot.map(t => t.id));
  const extras = uncompletedTasks.filter(t => !snapshotIds.has(t.id));
  return [...pendingTasksSnapshot, ...extras];
}, [isOpen, pendingTasksSnapshot, tasks, justUncompletedIds]);
```

Also: when a task is re-marked done from "Still on your list" after being uncompleted, remove it from `justUncompletedIds`:

```tsx
const handleMarkDone = (id: string) => {
  updateTask(id, { status: 'completed' });
  setJustCompletedIds((prev) => new Set(prev).add(id));
  setJustUncompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
};
```

---

## Bug 4 (Now Live): Recurring tasks excluded from EOD entirely — and completion path is wrong

### Root Cause

- **Timeline** (`timeline.tsx` line ~130 in TaskCard): calls `toggleTaskStatus(task.id, undefined, taskIsRecurring ? selectedDate : undefined)` which handles both recurring and one-off tasks properly (recurring → `completedDates` array; one-off → `status` field)
- **EOD modal** (`eod-review.tsx`): calls `updateTask(id, { status: 'completed' })` directly, bypassing the recurring-task logic entirely

This means:
- For **recurring tasks**, the EOD modal sets `status: 'completed'` globally instead of adding to `completedDates` — this would mark ALL future occurrences as complete, which is wrong
- The EOD modal's filter `t.status === 'completed'` won't catch recurring tasks that were properly completed via the timeline (which only modifies `completedDates`, not `status`)

### Impact

Recurring tasks completed via the timeline won't show in "Done today". Recurring tasks completed via the EOD modal will be broken (globally marked complete instead of per-date).

### Fix

**EOD `handleMarkDone` and `handleUnmarkDone` should use `toggleTaskStatus` instead of `updateTask`:**

```tsx
const handleMarkDone = (id: string) => {
  toggleTaskStatus(id, 'completed');
  setJustCompletedIds((prev) => new Set(prev).add(id));
};

const handleUnmarkDone = (id: string) => {
  toggleTaskStatus(id, 'pending');
  setJustCompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
};
```

**BUT WAIT** — the EOD modal already filters with `t.startDate === today`, which excludes recurring tasks (their `startDate` is the series start, not today). So recurring tasks are already excluded from the EOD modal entirely (the code even has a comment about this on line ~73).

This is a **design gap** rather than a live bug — recurring tasks don't appear in EOD at all. If that's intended, no fix is needed here. If it should be fixed, both the filtering logic and completion logic need to be updated to handle recurring tasks.

**Decision: Include recurring tasks in EOD.** Both completed and not-yet-completed recurring tasks that should show today need to appear in the modal. This makes Bug 4 a live bug.

### Fix for Bug 4

**Step 1 — Fix task filter (which tasks appear in EOD):**

Replace the naive `startDate === today` filter with `shouldShowOnDate` (already imported in the project via `@/lib/recurrence`):

```tsx
import { shouldShowOnDate, isCompletedOnDate, isRecurring, toDateStr } from '@/lib/recurrence';

const todayTasks = tasks.filter((t) =>
  t.status !== 'cancelled' && shouldShowOnDate(t, today, resolvedTz)
);
```

**Step 2 — Fix done/pending split (recurring use completedDates, not status):**

```tsx
const isTaskDoneToday = (task: Task): boolean =>
  isRecurring(task)
    ? isCompletedOnDate(task, today)
    : task.status === 'completed';

pendingTasks: todayTasks.filter(t => !isTaskDoneToday(t) && t.status !== 'completed'),
completedTasks: todayTasks.filter(t => isTaskDoneToday(t)),
```

**Step 3 — Fix completion actions to use `toggleTaskStatus`:**

Pull `toggleTaskStatus` from the store. Replace `updateTask` calls in `handleMarkDone`/`handleUnmarkDone`:

```tsx
const { tasks, habits, updateTask, unscheduleTask, toggleHabitStatus, toggleTaskStatus } = usePlannerStore();

const handleMarkDone = (id: string) => {
  toggleTaskStatus(id, undefined, undefined, new Date());
  setJustCompletedIds((prev) => new Set(prev).add(id));
  setJustUncompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
};

const handleUnmarkDone = (id: string) => {
  toggleTaskStatus(id, undefined, undefined, new Date()); // toggles back to pending/incomplete
  setJustCompletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  if (!pendingTasksSnapshot.some(t => t.id === id)) {
    setJustUncompletedIds((prev) => new Set(prev).add(id));
  }
};
```

Note: verify `toggleTaskStatus` signature in planner-store — it may take `(id, status, count, date)` or just `(id, date)`. Use whatever signature correctly handles both recurring and one-off tasks.

---

## Risk Areas & Edge Cases

1. **Rapid open/close/reopen:** Ensure all session state resets properly. The `justCompletedIds` reset fix (Bug 2) is critical for this.

2. **Concurrent completion from another tab/device:** If task status changes via real-time sync while the EOD modal is open, the snapshot will be stale. This is pre-existing and acceptable — the snapshot is intentionally frozen.

3. **`handleMoveAllToTomorrow`:** Currently filters by `!justCompletedIds.has(t.id) && !taskActions.has(t.id)` — this is correct and won't be affected by the fixes.

4. **`unactionedCount`:** Same filter as above — correct, unaffected.

5. **Empty state rendering:** The empty state condition checks `completedTasks.length === 0 && pendingTasks.length === 0` — after Bug 1 fix, should check `preExistingCompletedTasks.length` instead.

---

## Implementation Order

1. **Bug 2 first** — Reset `justCompletedIds` on modal close. Smallest change, prevents cascading issues.
2. **Bug 4 — recurring task support** — Fix task filter, done/pending split, and switch to `toggleTaskStatus`. This is the biggest change and must be done before Bug 1/3 since it changes which tasks exist in which lists.
3. **Bug 1** — Filter `justCompletedIds` out of "Done today" section. Prevents dual-display.
4. **Bug 3** — Add `justUncompletedIds` tracking and merge into pending list. Fixes the vanishing task issue.
5. **TypeScript check** — `npx tsc --noEmit 2>&1 | grep eod-review`, fix any errors.
6. **Test the full flow:** Open → mark done (one-off + recurring) → close → reopen → verify clean state. Unmark from "Done today" → verify it appears in "Still on your list". Mark done in "Still on your list" → verify it doesn't appear in "Done today" simultaneously.
