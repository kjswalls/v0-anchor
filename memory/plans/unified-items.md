# Unified Items Plan — merge Tasks + Habits into one Item entity

**Goal:** One `items` table / one `Item` entity with a user-selectable `type` property
(`task`, `habit`, and later user-defined types like `goal`), with per-type behavior driven
by a **type-capability registry** instead of parallel code paths.

**Status (2026-07-27):** Phases 0–5 shipped. Migrations 019 + 020 are APPLIED to the
live Supabase DB (backfill verified: 1,466 tasks + 231 habits); store rewritten on
`items[]` with `tasks`/`habits` projections (commit `3afc527`); Phase 4 replaced the
three dialogs with one registry-driven ItemDialog; Phase 5 put the agent routes behind
one Zod-validated handler (`lib/agent-api.ts`), added `items[]` + schemaVersion 3 to the
context response, moved the Beacon context/prompt onto registry renderers, and added the
dist-matches-src CI gate. Deliberately deferred: mixed-type `order` interleaving policy
for unfiltered `fetchItems` (`order` only meaningful within a type — items[] consumers
must not assume cross-type ordering); a dated deadline for the frozen-table drop
(cleanup migration); EOD/morning full genericization (they use registry capabilities and
constants, but their section logic still enumerates task/habit — Phase 6 work if custom
types should appear there). Next: Phase 6.

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
- **Phase 4 — UI (SHIPPED):** one ItemDialog (add/edit) driven by the registry; unified
  sentinel handling (`''` vs `'none'`); local-date parsing kept verbatim (off-by-one
  guard, now in `item-dialog.tsx` `draftFromItem`); `ui-store` single `edit-item` dialog;
  edit-habit's legacy emoji grid migrated to IconPicker; rows keep per-kind testids for
  now. See "Phase 4 deliberate behavior changes" below.
- **Phase 5 — external/AI (SHIPPED):** context endpoint adds `items[]` + schemaVersion 3
  additively (optional in the schema — a required key would brick old-plugin safeParse);
  `/api/agent/tasks|habits` are facades over `lib/agent-api.ts` (shared auth, Zod
  write-body schemas in packages/types, 400s at the boundary); Beacon chat context +
  system prompt render per-type via `ITEM_TYPES[type].ai.renderContextSection` /
  labelPlural (byte-parity locked by tests/unit/ai-context.test.ts — NOTE the original
  plan said "streak-ranked" but no surface ever sorted by streak; habits are
  streak-ANNOTATED in store order, preserved verbatim); morning-check gates on
  carryForwardEligible+dateAnchored over items[]; EOD uses registry label/streak
  constants; dist-matches-src CI gate + publish-ordering docs in packages/types/README.
  See "Phase 5 deliberate behavior changes" below.
- **Phase 6 — extensibility:** `item_types` table + CRUD + manage-types UI (create
  "goal" etc.); drop the type CHECK; registry hydrated from DB; dynamic `TYPE_OPTIONS`,
  `create.<type>` palette commands, `type:<name>` search grammar (keep `task:`/`habit:`);
  `data-item-type` attributes app-side (e2e selector migration moved to the separate
  e2e-repair effort); after bake: drop legacy tables, retire RPC wrapper.

  **Phase 6 settled design (written 2026-07-27; typing REVISED during 6a):**
  - *Typing:* custom items use a CLOSED envelope `{ type: 'custom'; customType: string;
    ...taskShape }` — an open `type: string` union branch was tried first and destroys
    discriminated narrowing at every `item.type === '…'` site (then- AND else-branches
    keep the custom member). `ItemType` = 'task'|'habit'|'custom';
    `KnownItemType = 'task' | 'habit'`. The DB stores the SLUG in items.type; the app
    maps slug ↔ envelope in itemFromRow/itemToRow, and db-layer `type` params stay the
    DB slug (`.eq('type', slug)`). Registry lookups go through
    `getItemTypeConfig(name: string)` (built-in → hydrated custom → default template,
    never undefined) with `itemTypeName(item)` = type==='custom' ? customType : type.
    'custom' joins task/habit as a reserved slug in the migration CHECK.
  - *Zod:* `CustomItemSchema` = the envelope above; `ItemSchema` stays a
    discriminatedUnion(task, habit, custom). MUST land in the types package before any
    plugin build parses `items[]`, or a custom item bricks the plugin cache.
  - *DB (migration 021):* `item_types` table (id uuid, user_id FK cascade, name slug
    UNIQUE per user + CHECK not in ('task','habit'), label, label_plural, icon, color,
    config jsonb default '{}', timestamps, RLS + updated_at trigger); DROP
    items_type_check; RELAX items_status_check to: task vocab for task, habit vocab for
    habit, task vocab (pending|completed|cancelled) for everything else.
  - *Custom-type capability template (v1):* task statuses/doneStatus, defaultFrequency
    'none', task frequency list, dateAnchored+dateAddressable true, orderable FALSE
    (order writes are per-type; custom sorts by created_at), containerKind null,
    counters none, schedule resizable + 60min, braindumpEligible true,
    carryForwardEligible FALSE (morning-check rollover uses updateTask which type-guards
    to no-op on non-tasks — flip only when the store gains generic updateItem),
    webhookEvent 'tasks.updated'/payloadKey 'task' (trigger-only; plugin ignores
    payloads and the context tasks[]/habits[] projections EXCLUDE custom types — locked
    decision #6; custom items travel in items[] only).
  - *Store:* item_types rows load with fetch; hydrated configs in a store slice; generic
    `addItem(type, partial)`/`updateItem(id, type, updates)`/`deleteItem(id, type)`
    actions for custom types (task/habit keep their named actions); db.ts itemFromRow/
    itemToRow/updatesToRow gain a generic (task-shaped) branch for unknown types.
  - *Beacon prompt:* becomes `buildBeaconSystemPrompt(types)` + the existing const for
    the built-in default (pinned test unchanged); chat-store passes hydrated types.
  - *Agent API:* custom types NOT exposed in v1 (routes stay task/habit; items[] serves
    reads).
  - *Slices:* 6a foundation SHIPPED (d88f242); 6b SHIPPED (106c2e8 task-pipeline ride +
    a2c015a manage-types UI); 6c search grammar (`type:<name>`) + `data-item-type` row
    attrs SHIPPED. Migration 021 file exists but is NOT yet applied (classifier blocked
    the prod write; needs Kirby's retry; the app is deploy-safe pre-migration because
    fetchItemTypes degrades to []). DEFERRED from 6c: dynamic `create.<type>` palette
    commands — the command registry is a static array by design and dynamic commands
    belong with command-palette round 2's registry work (custom types are fully
    creatable via the add-dialog tabs meanwhile). A Phase-6-wide adversarial review
    pass is the outstanding QA step (phases 4/5 got theirs pre-push; 6a/6b/6c shipped
    on typecheck+unit-suite green only).

  **Phase 6b settled scope (decided during 6a):** custom items ride the TASK pipeline
  instead of a parallel one. (1) planner-store generalizes the task action set to
  "task-like" items (`findTaskLike(id)` = non-habit): updateTask / deleteTask /
  toggleTaskStatus / scheduleTask / assignTaskToBucket / unscheduleTask resolve the DB
  slug via `itemDbType(found)` (updateItemAction's dbUpdateItem call must switch off the
  literal action-type too, or custom writes no-op against .eq('type','custom')); adds
  `addItem(customType, draft)`. (2) The store's `tasks` projection widens to non-habit
  items (runtime objects keep type/customType since projections are filters, not maps)
  so every view/DnD/EOD surface renders customs with zero churn — the app-internal
  projection is NOT the pinned API projection (db.ts fetchTasks stays type==='task').
  (3) Registry template flips carryForwardEligible to TRUE — its false value existed
  only because updateTask used to no-op on non-tasks; with generalized actions,
  morning/EOD carry-forward of dated customs is correct behavior. reorderTasks stays
  task-only (orderable false). moveTask*ProjectBlock stays task-only (no containers).
  (4) ItemDialog: tabs render from the hydrated type list (store `itemTypes`
  subscription; TabsList grid-cols via inline style for n>2), add-mode dispatches
  `addItem` for custom slugs, edit-mode already flows the generalized task path.
  Add-drafts rebuild when the type list changes. (5) Manage-types UI lives in
  ManageCategoriesDialog (natural home next to projects/groups): create (name slug +
  label + plural + IconPicker), rename label, delete (items fall back to default
  template — copy must say so). (6) 6c: `create.<type>` palette commands from hydrated
  types, `type:<name>` search grammar keeping task:/habit:, data-item-type attrs on
  TaskRow (e2e selector migration stays with the separate e2e-repair effort).

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

## Phase 4 deliberate behavior changes (reviewed + documented 2026-07-27)

One `ItemDialog` (add + edit) replaced AddTaskDialog/EditTaskDialog/
EditHabitDialog; registry gained a `form` section (titlePlaceholder,
editDescription, containerLabel, newContainerLabel, newContainerIcon,
deleteDescription). Behavior-preserving EXCEPT these conscious changes
(4-lens adversarial review, 15 findings verified, 2 should-fixes fixed):

1. **Sentinels unified on `'none'` + explicit None items** — add mode can now
   clear priority and unassign project (edit behavior won).
2. **Edit dialogs are ResponsiveModal** — bottom drawer on mobile (desktop
   unchanged). New `ResponsiveModalFooter` primitive.
3. **edit-habit's legacy 30-emoji grid replaced by IconPicker** — new groups
   store `icon:` tokens; legacy raw-emoji values still render via
   CategoryIcon. Group select rows also render through CategoryIcon now.
4. **Inline container creators in EDIT mode seed the default icon token**
   (Briefcase/Star) instead of `''`.
5. **Shell hovered-delete confirm copy comes from the registry** — habit
   delete now warns "and all its history" (was task copy for both).
6. Cosmetic: Calendar popover `align="start"` in add mode; a few class-level
   unifications (`truncate`, `w-full overflow-hidden` wrapper, gap-3);
   dateless edit-task Time select shows the `--` placeholder (was blank);
   a successful add resets the uncommitted creator icon pick (was kept).
7. **Latch hardening (regression fixes over the originals' semantics):**
   save/delete/reset handlers guard on the LIVE dialog state so the close
   animation can't re-fire a save (double-Enter), confirm flags disarm when
   the dialog payload changes (stranded "Reset Streak?" could otherwise fire
   on the wrong habit), and the edit draft seeds render-phase so switching
   edit targets across types never paints a stale frame.

Old add-dialog dead code (unreachable project/group delete AlertDialog,
`EMOJI_OPTIONS`) dropped. E2E text contracts preserved: 'Add New',
'What needs to be done?', 'Add Task'/'Add Habit', 'Edit Task'/'Edit Habit',
'Save Changes', input ids `task-title`/`habit-title`/`edit-task-title`/
`edit-habit-title`, `data-sub-input` Enter routing, `__new__` sentinels.

## Phase 5 deliberate behavior changes (reviewed + documented 2026-07-27)

Agent-route behavior is preserved for every payload the deployed OpenClaw
plugin's tools actually send (verified against openclaw-plugin/src/tools.ts),
EXCEPT these conscious changes (4-lens adversarial review; 13 findings
verified, 2 blockers fixed pre-commit):

1. **Invalid write bodies 400 instead of 500** — malformed JSON, junk
   status/repeatFrequency (used to 500 on DB CHECKs), null on NOT-NULL
   fields, non-uuid ids, fractional values on integer columns.
2. **Junk priority/timeBucket 400 instead of being silently STORED** (these
   two columns have no CHECK — the old routes stored e.g. 'urgent' verbatim).
3. **Legacy 'weekly' frequency normalizes to 'custom'** instead of 500ing;
   custom-frequency writes (create AND update) require non-empty repeatDays
   in the same body — a stored custom-without-days item fails the plugin's
   whole-context safeParse and bricks its cache. Consequence: a "switch back
   to custom" PATCH must resend repeatDays. (Pre-existing residual hazard: a
   PATCH nulling repeatDays while the stored frequency is already custom
   still reaches the bad state — existed identically before.)
4. **Create title is required non-empty**; notes + the schedule-internal
   fields (completedDates/inProjectBlock/previousStart*) are now accepted on
   task create (PATCH always accepted them; create silently dropped them).
5. **Habit create defaults (streak 0, empty arrays/counts) are seeded by the
   shared handler** (AGENT_API createDefaults) — items.streak has no column
   default and the completion RPC skips NULL streaks, so this is
   load-bearing, not cosmetic. 201 echo shape matches the legacy routes.
6. **Update webhooks broadcast the VALIDATED body** (unknown keys stripped)
   instead of the raw request body. The plugin ignores webhook payloads
   (full refetch on any event), so this is unobservable today.
7. schemaVersion 2 → 3; `items[]` served (optional in the schema).

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
