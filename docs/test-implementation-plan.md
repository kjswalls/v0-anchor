# Test Implementation Plan
_Created: 2026-04-04_

## Goal
Get the test suite to a meaningful green state before dogfooding. "Meaningful" = catches real regressions, not just skips or trivial assertions.

---

## Current State

### Unit Tests (Vitest)
| File | Real tests | Skipped | Todo |
|---|---|---|---|
| `date-utils.test.ts` | 3 ✅ | 0 | 3 |
| `recurrence.test.ts` | 2 ✅ | 1 (bug #90) | 3 |
| `search-parser.test.ts` | 0 | 2 (bug #93) | 4 |
| `undo-redo-store.test.ts` | 0 | 0 | 6 |

### E2E Tests (Playwright)
All 18 active tests are `test.skip()` stubs. Auth is now fixed (PR #150). 4 additional tests are permanently skipped pending bug fixes (#90, #91, #92, #93).

| Spec | Active tests | Permanently skipped (bugs) |
|---|---|---|
| `search.spec.ts` | 2 | 2 (#91, #93) |
| `settings.spec.ts` | 2 | 1 (#92) |
| `recurring.spec.ts` | 2 | 1 (#90) |
| `task-dates.spec.ts` | 3 | 0 |
| `undo-redo.spec.ts` | 3 | 0 |
| `eod-review.spec.ts` | 3 | 0 |
| `dnd.spec.ts` | 3 | 0 |

---

## Triage: What's Actually Worth Implementing Now?

### Tier 1 — Do now (high value, low friction)
These test pure logic or simple UI interactions with no complex setup:

**Unit:**
- `date-utils.test.ts` — fill in 3 todos (getLocalMidnight, isOverdue, week-view ranges). Pure functions, trivial to test.
- `recurrence.test.ts` — fill in 3 todos (weekdays, custom days, monthly). Logic already exists in the store, just needs a pure helper extracted or tested directly.

**E2E:**
- `settings.spec.ts` — time format + compact mode. Login → open settings → toggle → reload → assert. Straightforward, high real-world value for dogfooding.
- `undo-redo.spec.ts` — the "stacks are empty on load" test is trivial. Undo/redo keyboard tests are moderately easy.
- `search.spec.ts` — type in search box → assert filtered results. Login → seed data → search → assert. Important for daily use.

### Tier 2 — Do now but needs API helper
These require creating test data (tasks/habits) via the Anchor API before asserting UI. We need a `createTestTask()` / `createTestHabit()` helper that calls the `/api/agent/` routes directly.

**E2E:**
- `task-dates.spec.ts` — all 3 tests need a task to exist with specific dates
- `recurring.spec.ts` — needs habits with specific repeatFrequency/repeatDays
- `eod-review.spec.ts` — needs incomplete tasks to roll over / complete

### Tier 3 — Defer (complex or blocked by bugs)
- `dnd.spec.ts` — drag-and-drop is notoriously finicky in Playwright. High effort, low priority for dogfood.
- `search-parser.test.ts` — parser doesn't exist as a standalone module yet; needs refactor first (#93 prerequisite)
- `undo-redo-store.test.ts` — undo/redo is in Zustand singleton; needs pure reducer extraction to be testable in isolation

---

## Implementation Plan

### Phase 1: Unit tests + helpers (Claude Code, ~1 pass)
1. Fill in `date-utils.test.ts` todos
2. Fill in `recurrence.test.ts` todos — may need to look at `shouldShowHabitOnDate()` logic in `planner-store.ts`
3. Create `tests/e2e/helpers/api.ts` — `createTestTask()`, `createTestHabit()`, `cleanupTestData()` — calls `/api/agent/` routes with the test user's auth token

### Phase 2: E2E — simple specs (Claude Code, same pass or follow-up)
Implement in this order (easiest → hardest):
1. `undo-redo.spec.ts` — "stacks empty on load" first, then keyboard shortcuts
2. `settings.spec.ts` — time format + compact mode
3. `search.spec.ts` — type to filter + clear to restore
4. `task-dates.spec.ts` — uses `createTestTask()` helper
5. `recurring.spec.ts` — uses `createTestHabit()` helper
6. `eod-review.spec.ts` — uses `createTestTask()` helper

### Phase 3: Defer
- `dnd.spec.ts` — post-launch
- `search-parser.test.ts` — post #93
- `undo-redo-store.test.ts` — post reducer extraction

---

## Key Implementation Notes for Claude Code

### API helper pattern
The test user session is available via `page.context().cookies()` — extract the token and use it to call `/api/agent/tasks` (POST) to seed data. Clean up after each test via DELETE. This avoids UI-based task creation which is slower and more brittle.

### Recurrence logic location
Look at `lib/planner-store.ts` for `shouldShowHabitOnDate` or similar — the recurrence filter logic lives there and should be importable for unit tests without mocking the full store.

### Settings selectors
Settings panel is likely opened via a gear icon or nav button. Check for `[data-testid="settings"]` or similar, or search the component tree.

### Undo/redo UI
Look for `aria-label="Undo"` / `aria-label="Redo"` buttons. Keyboard shortcut: `page.keyboard.press('Control+Z')`.

---

## Definition of Done
- `npx vitest run` → 0 failures, <5 skips (only the known bug skips)
- `npx playwright test` → 0 failures, ≤4 skips (the 4 bug-blocked ones)
- Unit tests cover: date utils, recurrence logic, basic search parsing
- E2E tests cover: search, settings, undo/redo, task dates, recurring, EOD review
