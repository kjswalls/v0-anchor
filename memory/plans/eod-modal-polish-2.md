# EOD Modal Polish — Round 2
**Branch:** fix/eod-modal-mobile-ux
**Date:** 2026-04-07 (updated)

---

## Issues to Fix

### 1. 📅 Calendar icon missing on mobile
Wrap the native `<input type="date">` in a `<label>` styled as a button. Label shows 📅 emoji; input is `sr-only`. Tapping the label triggers the native picker. Desktop Popover is unchanged (hidden via `sm:hidden` on the label).

```tsx
<label
  htmlFor={`date-input-${task.id}`}
  className="sm:hidden inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background cursor-pointer text-sm"
>
  📅
  <input
    id={`date-input-${task.id}`}
    type="date"
    min={tomorrowStr(userTimezone)}
    className="sr-only"
    onBlur={(e) => { if (e.target.value) handleMoveTo(task.id, e.target.value); }}
    aria-label="Move task to date"
  />
</label>
```

### 2. Date picker closes immediately on mobile
iOS fires `onChange` as the wheel scrolls — not on confirm. Fix: switch to `onBlur`, which fires only when the picker is dismissed/confirmed. If user cancels, value is empty string and we guard with `if (e.target.value)`.

---

### 3. Section restructure + habits

#### What "Set aside today" actually is
Skipped habits — habits that should have shown today but were explicitly skipped (or have `status: 'skipped'`). Currently read-only, no actions. Just shows "Tomorrow's a fresh start." copy.

#### What Kirby wants
- **Completed tasks** should move to a "Done today" section as users check them off — and be uncheckable from there too (two-way toggle).
- **Habits** should have the same flexibility: complete → uncomplete in both directions.
- **"Set aside today"** (skipped habits): should also be actionable — let user mark them done from there if they actually did it.

#### Data flow analysis

**Tasks:**
- `pendingTasks` = today's tasks with `status: 'pending'` (live from store)
- `justCompletedIds` = Set of task IDs completed *in this session*
- `handleMarkDone` / `handleUnmarkDone` already exist and toggle between sections correctly
- Currently: completed tasks don't show at all. Need to re-add `completedTasks` to useMemo.
  - `completedTasks` = today's tasks with `status: 'completed'`
  - These live-update correctly since they come from store

**Habits:**
- `doneHabits` = habits with `completedDates.includes(today)` or `status: 'done'` — currently read-only
- `skippedHabits` = habits skipped today — currently read-only
- The habit store has `toggleHabitCompletion` / similar — need to check planner-store for the right action
- Need to add `handleToggleHabit(id)` in the component

#### Proposed section structure

1. ✅ **Done today** — completed tasks + done habits, with undo/uncheck capability
2. ⬜ **Still on your list** — pending tasks with Tomorrow / 📅 / ✕ pills
3. ○ **Skipped habits** — skipped habits with a "Mark done" option
4. Empty state (if all sections empty)

**Section header decisions:**
- "Done today": `CheckCircle2` (emerald) icon — no encouraging copy, just the list
- "Still on your list": no section icon (task rows have their own completion circles)
- "Skipped habits": keep `Circle` (muted) icon, rename from "Set aside today" → **"Skipped today"** (clearer)
- Remove "Habits kept" as a separate section — merge done habits into "Done today"

#### "Done today" row design
- Tasks: green `CheckCircle2` button (clickable → unchecks, moves back to "Still on your list")
- Habits: green `CheckCircle2` button (clickable → unmarks habit completion)
- No Tomorrow/📅/✕ pills on done items — just the uncheck toggle

#### "Skipped today" row design
- Current: read-only text + "Tomorrow's a fresh start." copy
- Add: small "Mark done" button per row — calls `handleToggleHabit(id)` → moves to "Done today"
- Remove the italicised copy (it's filler)

---

## Implementation Steps

1. **Fix 📅 label+input pattern** (issue 1 + 2 combined)

2. **Re-add `completedTasks` to useMemo**
   - `completedTasks = todayTasks.filter(t => t.status === 'completed')`

3. **Find habit toggle action in planner-store** and wire `handleToggleHabit(id)` in component

4. **Render "Done today" section** above "Still on your list":
   - Completed tasks: `CheckCircle2` button → calls `handleUnmarkDone`
   - Done habits: `CheckCircle2` button → calls `handleToggleHabit` (uncomplete)
   - Only show section if `completedTasks.length > 0 || doneHabits.length > 0`

5. **Update "Still on your list" section** — remove ArrowRight icon from header

6. **Remove "Habits kept" section** (merged into Done today)

7. **Update "Skipped today" section** — rename, add per-row "Mark done" button, remove copy

8. **Update empty state condition** to account for new sections

9. **Commit + push**

---

## Files Changed
- `components/ai/eod-review.tsx` only

---

## Deferred
- Undo for habit toggle (V2)
- Count badges on section headers (V2)
