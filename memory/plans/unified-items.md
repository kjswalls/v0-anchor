# Unified Items Plan — merge Tasks + Habits into one Item entity

**Goal:** One `items` table / one `Item` entity with a user-selectable `type` property
(`task`, `habit`, and later user-defined types like `goal`), with per-type behavior driven
by a **type-capability registry** instead of parallel code paths.

**Status (2026-07-26):** Phases 0–2 implemented and adversarially verified (4-reviewer
pass; all blockers fixed). Shipped: migration 019, unified `lib/db.ts` behind legacy-named
exports, `ItemSchema` + registry, agent routes on shared ownership check. **Migration 019
is NOT yet applied to Supabase — the app breaks against the live DB until it is** (follow
the runbook in the migration header). Verification items deliberately deferred:
agent-route body validation returning 400s instead of CHECK-constraint 500s (Phase 5);
types-package publish CI + dist-matches-src check (Phase 5); mixed-type `order`
interleaving policy for `fetchItems` with no type filter (decide in Phase 3 — `order` is
currently only meaningful within a type); a dated deadline for the frozen-table drop
(cleanup migration). Phase 3 is unblocked; Phase 4 remains blocked on committing the
command-palette working-tree changes.

---

## Locked design decisions

1. **Status vocabularies stay per-type.** Task `pending|completed|cancelled`, habit
   `pending|done|skipped`. Both are external contracts (openclaw plugin `safeParse`s the
   context response and **throws** on drift — `openclaw-plugin/src/cache.ts:55-61`). The
   unified `ItemSchema` is a Zod **discriminated union** on `type`; the DB gets a
   type-conditional status CHECK. No merged status enum, no value translation.
2. **Streak migrates as-is** (opaque stored counter, `+1`/`-1` on toggle). It is NOT
   recomputable from `completedDates` without changing user-visible numbers.
   `resetHabitStreak` must reset counter fields only — never `completedDates`.
3. **Habits stay un-anchored** (`start_date` stays NULL for migrated habits). Tasks gate
   recurring occurrences by `startDate <= date`; habits render on every matching day.
   `dateAnchored` is a registry capability, not inferred from code path.
4. **Containers stay split in v1.** `projects` and `habit_groups` tables remain; the
   registry declares which container kind a type resolves against (`containerKind`).
   Container unification is its own follow-up refactor.
5. **Projects-as-item-type is deferred** (edit-project has a quasi-item time-block form;
   candidate future type, out of scope).
6. **External API projections live indefinitely.** `/api/agent/context` keeps serving
   `tasks[]` / `habits[]` as exact-legacy-schema projections of items (future custom types
   omitted from both). Webhooks keep emitting `tasks.updated`/`habits.updated` with
   `{task}`/`{habit}` payload keys mapped from `item.type` — `notifyPlugins` drops
   unregistered event names, so `items.updated` would silently never arrive
   (`lib/openclaw-registry.ts:46`).
7. **Old tables freeze, not drop.** Migration copies ALL rows (including soft-deleted —
   30-day trash must survive), keeps UUIDs, leaves `tasks`/`habits` untouched as rollback
   for a bake window. Drop is a later cleanup migration.
8. **DB `type` column is open** (`text NOT NULL`), v1 CHECK `('task','habit')`; the CHECK
   is dropped when the custom-types phase adds a per-user `item_types` table.
9. **Migrations are authoritative; `supabase/schema.sql` is stale** (missing `deleted_at`,
   `tasks.completed_dates`, all 007 columns, CHECKs, RPC, cron). Author all SQL against
   migration state, never schema.sql.

## Target DB shape (migration 019)

`items` = superset of both tables, kind-specific columns nullable, plus:

- `type text NOT NULL` (CHECK task|habit for now)
- Shared: id, user_id, profile_id, title, status, notes, time_bucket, start_time,
  repeat_frequency (nullable — defaults move to app code per type: task `none`, habit
  `daily`), repeat_days, repeat_month_day, completed_dates, sort_order, created_at,
  updated_at, deleted_at
- Task-side: priority, project, start_date, duration, is_scheduled, "order",
  in_project_block, previous_start_time, previous_start_date, assignee, ai_result,
  ai_status, parent_item_id (was parent_task_id), reminder_at, external_id,
  calendar_source, completed_at, duration_minutes
- Habit-side: "group", streak, skipped_dates, daily_counts, times_per_day,
  current_day_count, color
- One RLS policy, one updated_at trigger, type-conditional status CHECK, shared repeat
  CHECK
- **Habit `order` backfill** from current insertion order (created_at per group) so the
  unified order-by doesn't reshuffle; tasks keep their existing global sequence.
- New RPC `toggle_item_completed_date(item_id, date_str)` + legacy-named
  `toggle_task_completed_date` wrapper delegating to it (deployed clients mid-rollout).
- `cron.unschedule('purge-deleted-items')` + recreate purging `items` (and containers).

## Type-capability registry (`lib/item-registry.ts`)

Per type: `allowedStatuses`, `doneStatus`, `defaultFrequency`, `allowedFrequencies`,
`dateAnchored`, `dateAddressable` (DnD dateStr), `orderable`, `containerKind`
(`projects`|`habitGroups`) + required?, `counters` (streak/dailyCounts/timesPerDay),
`schedulable`/`resizable`/`defaultBlockDuration`, `braindumpEligible`,
`carryForwardEligible` (EOD/morning), rail-slot policy (priority glyph vs StreakFlame),
confirm copy. Custom types later = rows in an `item_types` table hydrated into this shape.

## Phasing (app must work at every step)

- **Phase 0 — stabilize:** fix latent bugs unification amplifies: habit toggle timezone
  null → RangeError (`planner-store.ts:650` — use task path's `?? Intl` fallback);
  `reorderTasks` silently drops items missing from the id list (`:567-574`); `restore*`
  missing client param (`db.ts:134-138`); annotate schema.sql as stale. Habit undo
  partial-sync bug is absorbed by the Phase 3 rewrite.
- **Phase 1 — types:** `ItemSchema` discriminated union in `packages/types` (branches
  structurally identical to today's Task/Habit + `type`); keep `TaskSchema`/`HabitSchema`
  exports unchanged for the plugin; apply the `weekly→custom` preprocess to the habit
  branch too (it only existed on tasks); add registry. Rebuild committed `dist/`.
- **Phase 2 — DB:** migration 019 as above; collapse `lib/db.ts` to one mapper trio + one
  CRUD set parameterized by type, **per-type update allowlists kept separate** (a merged
  allowlist would let habit fields write onto tasks — the allowlist is the only field
  filter for agent PATCH routes), webhook names/payloads mapped from type; agent routes'
  service-role ownership pre-checks point at `items` (do NOT lose these — they exist
  because the service client bypasses RLS).
- **Phase 3 — store:** single `items: Item[]` in planner-store with `tasks`/`habits`
  exposed as projections (limits component churn to zero initially); unified action set
  dispatching via registry; one `getBucketForTime` helper (kills 6 copies); both types'
  per-date completion through the atomic RPC (habit read-modify-write was race-prone);
  undo/redo unified with schema-derived field list (kills hardcoded lists at
  `planner-store.ts:1043,1137` and the habit status-gate bug at `:1060-1075`); history
  reset at cutover; persisted `timelineItemFilter` migration; `deriveDayItems` keeps its
  `tasksByBucket`/`habitsByBucket` output shape as a projection.
- **Phase 4 — UI:** one ItemDialog (add/edit) driven by the registry; unified sentinel
  handling (`''` vs `'none'`); keep local-date parsing (`edit-task-dialog.tsx:78-89` —
  off-by-one guard); `ui-store` single `edit-item` dialog; migrate edit-habit's legacy
  emoji grid to IconPicker; rows keep per-kind testids for now. **NOTE: dialogs/omnibar/
  braindump currently have UNCOMMITTED command-palette changes in the working tree — do
  not start Phase 4 until that work is committed.**
- **Phase 5 — external/AI:** context endpoint adds `items[]` + `schemaVersion` additively
  (Zod strips unknown keys — safe for deployed plugins); `/api/agent/tasks|habits` become
  facades over one handler with one shared ownership-check helper; AI context/EOD/morning
  become per-type renderers on the registry with today's presentation preserved verbatim
  (task section date-scoped w/ overdue; habit section streak-ranked, date-blind);
  types→plugin publish ordering.
- **Phase 6 — extensibility:** `item_types` table + CRUD + manage-types UI (create
  "goal" etc.); drop the type CHECK; registry hydrated from DB; dynamic `TYPE_OPTIONS`,
  `create.<type>` palette commands, `type:<name>` search grammar (keep `task:`/`habit:`);
  testid policy `item-card` + `data-item-type` migrating all e2e selectors in one PR;
  after bake: drop legacy tables, retire RPC wrapper.

## Phase 3 deliberate behavior changes (reviewed + documented 2026-07-27)

The store rewrite is behavior-preserving EXCEPT these conscious changes:

1. **Completion writes are intent-based + atomic** (migration 020
   `set_item_completion(id, type, date, completed, adjust_streak)`): one
   statement sets the desired end state and moves streak only when the date
   array actually changes. Fixes the old read-modify-write races, the
   parity-toggle intent inversion under stale clients, and streak/date desync
   under partial failure. Streak is server-owned on live toggles; the store's
   companion habit update excludes completedDates AND streak. Undo/redo
   replays completion diffs as per-date intents with adjust_streak=false and
   restores streak via the normal patch.
2. **`updateTask`/`updateHabit` persist the auto-corrected timeBucket** (old
   code corrected only local state, so the correction vanished on reload).
3. **Store-miss = full no-op**: actions on ids absent from the store no longer
   issue blind DB writes (old code could mutate soft-deleted trash rows).
4. **`resetHabitStreak` sends `{streak: 0}` only** — completedDates AND
   dailyCounts survive (history, not counters). Confirm-dialog copy updated
   to match.
5. **Undo/redo diffs ALL fields for both types** (old habit sync fired only on
   status change — title/group edits never persisted their undo) and
   **containers diff by id, not name** (a name-keyed diff turned rename-undo
   into soft-deleting the only copy). `restoreProject`/`restoreHabitGroup`
   are id-based now; a restore also re-pushes the full snapshot shape.
6. Action labels added for scheduleHabit/moveTask*ProjectBlock (previously
   inherited stale labels).

Deferred, recorded here on purpose: persisted `timelineItemFilter` migration
(needed only when the filter vocabulary opens up in Phase 6); `projectItems`
rebuilds both projection arrays per mutation (extra cross-kind re-renders,
verified loop-free — memoize only if profiling ever demands it); db allowlist
↔ schema-fields drift is now guarded by tests/unit/db-allowlists.test.ts.

## Behavioral invariants to preserve (regression traps)

- Priority/project filters hide ALL habits (day-items, search, braindump) — once habits
  *can* carry those fields this must stay explicit, not accidental.
- `showCompletedTasks` gates tasks only; habits-before-tasks bucket ordering is implicit
  concatenation — preserve via projection ordering.
- Habit drops in week view are global (no dateStr) — a unified DnD path must keep
  `dateAddressable=false` for habits or week drops become single-date moves.
- Sidebar drop relies on `unscheduleTask` no-oping for habit ids
  (`handle-drag-end.ts:79-81`) — make the no-op explicit via `braindumpEligible`.
- StreakFlame at streak 0 is the only visual habit marker in rows.
- Recurring tasks NEVER mutate scalar `status` (migration 016 semantics; per-date
  `completed_dates` is truth); habit `status` is a denormalized "last toggle" snapshot.
- Habit UI forbids `repeatFrequency: 'none'`; add-dialog uses `''` sentinel vs
  edit-dialog `'none'` sentinel — don't leak either into the DB.

## Verification gates

Unit: `tests/unit/*` (recurrence, day-items, search-parser, handle-drag-end, commands,
grid-range). E2E (needs migrated DB + running app): dnd, recurring, undo-redo, smoke,
view-matrix, omnibar, settings, eod-review. Plugin smoke: `GET /api/agent/context` parses
with the **old** published `AnchorContextResponseSchema`. Every `lib/dnd/CONTRACT.md`
change lands with its e2e spec in the same commit.

## Supabase access + applying the migration

Official Supabase MCP (OAuth, project-scoped `ctcspcferkdlzdcqlozq`) is configured in
`.mcp.json`. First use: run `/mcp` → authenticate in browser. Then Claude can
`apply_migration` directly. Until then: paste `supabase/migrations/019_unified_items.sql`
into the SQL editor (same workflow as migrations 001–018). **The app must not run against
the DB until 019 is applied** once the db-layer cutover lands.
