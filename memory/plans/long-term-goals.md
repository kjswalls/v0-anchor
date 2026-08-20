# Long-term Goals — an aspiration container over unified items

**Status (2026-08-20): DRAFT for Kirby review. No code written.** Product direction
proposed here from Kirby's brief ("long term learning plans and goals with milestones,
habits, certain things that need to be scheduled, date check-ins — like learning
Chinese with fluency goals along the way, or building a $3m business in 3 years").
Open questions for Kirby are collected at the end, each with a recommendation. Read
[unified-items.md](unified-items.md) and [programs-routines.md](programs-routines.md)
first — this plan builds on their locked decisions and amends none of them.

**Goal:** A **Goal** is a long-horizon container — "Learn Chinese", "Build a $3m
business by 2029" — that holds the work serving it: **milestones** (the achievement
checkpoints along the way and at the end), **habits** (daily practice), **tasks and
scheduled items** (book the exam, register the LLC), and **check-ins** (recurring
review dates). A goal shows derived progress, a target date, and the reason it
exists. It never hides work and never rewrites it — it is the WHY layer over items
whose WHAT and WHEN stay exactly where they are today.

---

## The core modeling decision: a fifth container, third role

Three shapes were considered. The first two lose on the codebase's own arguments.

**Not an item type.** unified-items.md floats `goal` as the canonical example of a
future custom type, and a user can create one today — but item-type machinery gives
a goal exactly the wrong things. A type gets a scalar status, grid blocks,
occurrences, a row in day columns; a goal has none of those. What a goal needs is
*containment* — habits AND tasks together, which no item can hold (subtasks are
task-only, undated, invisible on every grid surface by design — item-surface-growth
Phase 2 excludes them from the `tasks` projection precisely so they never float
free). Milestones need dates, completion, past-due pressure, Beacon narration —
all machinery items already have and subtasks deliberately don't. A goal-as-item
would rebuild containment badly; a goal-as-container gets item machinery for its
members for free.

**Not a program, and not suppression.** Programs answer WHEN WORK COUNTS — membership
switches items off (container-registry.ts's `gate` role). A goal answers WHY WORK
MATTERS. Conflating them breaks both: pausing "Learn Chinese" must not erase today's
practice habit from the grid (the habit may also serve "Morning routine"), and a goal
you're behind on is the *last* thing that should quietly hide its work. An item can
sit in a goal AND a program simultaneously — the Chinese habit inside the school-year
program, serving the fluency goal. So goals join the container registry as a **third
role** — neither `classify` (one per item, the filter/group axis) nor `gate`
(activation) — call it **`aspire`**: many-to-many, no suppression, no unset state.
`CONTAINER_KINDS` is a closed record on purpose, so adding the kind is a type error
at every exhaustive switch — that is the designed way to find every touchpoint.

**Not a project.** Projects are `classify`: exactly one per item, and habits don't
carry the axis at all (they classify by group). A goal must hold habits and tasks
together, and an item may serve two goals ("morning run" serves both Health and
Marathon). That is the join-table shape routines/programs already built — composite
FKs, RLS, soft-delete-survives-membership, reconciliation, the dangling-id rule —
and goals reuse all of it.

## Locked design decisions (proposed)

1. **Goals are a new container table (`goals`) + one join table (`goal_items`),
   id-referenced.** The modern container pattern (programs-routines locked decision
   1): rename from day one, composite `(id, user_id)` FKs so cross-tenant membership
   is unrepresentable, membership survives member soft-delete (restore-intact),
   arrays pruned only by the purge CASCADE.

2. **Milestones and check-ins are ordinary items wearing a membership role, not new
   entities.** `goal_items.role ∈ ('member','milestone','checkin')`. A milestone is a
   one-shot task-like item whose `startDate` is its target date — it renders on the
   grid that day, goes past-due when missed (being behind on a milestone *should*
   show up in the past-due bar), completes through the normal paths, narrates through
   Beacon, and undoes through the normal history. A check-in is a *recurring* item
   ("Weekly Chinese review", every Sunday) — recurrence, reminders (`reminder_at`),
   per-date completion, skips: all existing machinery. A dedicated `milestones` table
   was rejected because it would re-implement dates, completion, overdue, Beacon,
   undo, and grid presence — the exact parallel-code-path smell the item registry
   exists to kill.
   - The PK `(goal_id, item_id)` means an item holds exactly ONE role per goal —
     it can't be both member and milestone of the same goal, by construction.
   - Role is a property of the MEMBERSHIP, not the item: "HSK 3 exam" can be a
     milestone of Learn Chinese and a plain member of Q3 Admin. No item column, no
     schema drift, nothing for the OpenClaw plugin to choke on.

3. **Eligibility is registry capability, per the house rule.** New `ItemTypeConfig`
   flag `milestoneEligible` (task: true; habit: false — a habit has no single "done"
   event to hang an achievement on; custom template: true). Milestone role
   additionally requires NOT `isRecurring(item)` — a recurring milestone is
   meaningless — asked via a predicate `isMilestoneEligible(item)` like
   `isSkippable`. Check-in role requires `isRecurring(item)` (a check-in is periodic
   by definition). Plain `member` role reuses `isCollectible(item)` unchanged —
   including its subtask exclusion, for the same reason it exists there.

4. **Goals never suppress and never write member fields.** No `lib/active.ts`
   changes, no `inactiveItemIdsOn` involvement, no ScopeRail row. Goal state changes
   are one container-row write (one undo entry), and no goal operation ever touches
   member `status`, `streak`, `completedDates`, `startDate`, `repeat*`, `timeBucket`
   — the programs-routines invariant, inherited verbatim. "Shelve a goal and hide
   its work" is deliberately NOT built: that job belongs to programs, and an item
   can be in both. (Recorded under Deferred with the revisit trigger.)

5. **Goal lifecycle is its own tri-state, not a status vocabulary.**
   `state ∈ ('active','achieved','abandoned')`, default `active`, plus `achieved_at`.
   Achieved/abandoned goals leave the active lists and chips but keep their history
   browsable (they are a record of a multi-year effort — closer to an archive than a
   trash). Completing the last milestone does NOT auto-achieve — it surfaces a
   celebratory prompt; achieving is the user's deliberate act (mirrors the "convert
   an item's type is a data decision, not a control" reasoning). Soft-delete +
   30-day purge apply as usual and are a separate axis from `abandoned`.

6. **Progress is derived, never stored.** `achieved milestones / total milestones`,
   counted against the live-item index (dangling-id rule — `countLive` precedent in
   lib/collections.ts). A milestone counts achieved when its scalar status is its
   type's `doneStatus` (milestones are one-shot by rule 3, so scalar status is
   truthful — the recurring-items-never-mutate-status trap doesn't apply). No stored
   percent to drift; no numeric key-result metrics in v1 (the milestone TITLE carries
   "$1m ARR" — see open question 5).

7. **External surface is additive-only, on the established schedule.**
   `goals[]` (optional) joins `/api/agent/context` with a schemaVersion bump;
   `tasks[]`/`habits[]`/`items[]` are untouched — goal membership travels ONLY in
   `goals[]` (member ids + roles), never as item fields, so the frozen legacy
   projections can't drift. No new webhook event names (notifyPlugins drops
   unregistered names). Agent write routes follow Kirby's Phase-4 posture ("agents
   should have all or most of the control the user has") but land in their own
   phase, after the UI proves the model.

8. **The Organize console is the goal's management home; the goal's *reading* home
   is its own surface.** Goals become a console section (the console's rail order
   already anticipates growth), which also solves the no-unconditional-entry-point
   failure programs shipped with — the console has permanent doors. But a goal is
   the one container whose DETAIL is a destination in itself (progress, milestone
   timeline, check-in history), so it also gets a deep-linkable page,
   `/goal/[id]`, following the `/item/[id]` precedent (Beacon can answer with a
   URL). The console detail pane and the page render the same sections — growth is
   a presentation, not a fork (item-surface-growth's rule).

## Target DB shape (migration 029)

All idempotent, house RLS pattern, dates as `yyyy-MM-dd` text, tz app-side.
`updated_at` trigger on `goals` ONLY — never the join table (the house trigger
throws on tables without the column; programs-routines learned this).

- `goals`: id uuid PK gen_random_uuid(), user_id uuid NOT NULL FK auth.users
  CASCADE, name text NOT NULL, `why` text (the motivation line — rendered on the
  goal surface and fed to Beacon), icon text, color text,
  state text NOT NULL default 'active' CHECK (state in
  ('active','achieved','abandoned')), starts_on text, target_on text,
  achieved_at timestamptz, sort_order int, created_at/updated_at now(), deleted_at.
  Guarded `UNIQUE (id, user_id)` (composite-FK target, in a DO block — the 024
  lesson about `create table if not exists` skipping inline constraints).
- `goal_items`: goal_id uuid NOT NULL, item_id uuid NOT NULL, user_id uuid NOT NULL
  FK auth.users CASCADE, role text NOT NULL default 'member' CHECK (role in
  ('member','milestone','checkin')), sort_order int (milestone ordering),
  PK (goal_id, item_id), composite FKs `(goal_id, user_id) → goals(id, user_id)`
  and `(item_id, user_id) → items(id, user_id)`, both ON DELETE CASCADE (join rows
  are derived data; RESTRICT would abort the nightly purge). Index
  `(user_id, item_id)` for the reverse lookup + hydration fetch. No timestamps, no
  trigger.
- Purge cron: extend `purge-deleted-items` with the `goals` line (join rows go by
  CASCADE).
- No `items` columns. Nothing item-side changes — that is the point of role-on-join.
- Ledger: if applied out-of-band, record version `029` immediately.

**Deploy-order tolerance, by construction (the 024 rule):** `fetchGoals` returns
null on a missing table ⇒ `goalsAvailable = false` gates every goal surface off; no
item-write path changes at all this time (no new item columns), so there is no
PGRST204 hazard to guard. Do not "simplify" the availability gate away.

## packages/types (same commit as the migration, dist rebuilt)

- `GoalSchema`: id, name, why?, icon?, color?, state, startsOn?, targetOn?,
  achievedAt?, plus app-side member arrays split BY ROLE — `memberIds: string[]`,
  `milestoneIds: string[]` (ordered by sort_order), `checkinIds: string[]`. Three
  arrays rather than one array of `{id, role}` objects: every consumer
  (`countLive`, pickers, progress) wants one role's ids, and disjointness is
  guaranteed by the PK. db.ts maps join rows ↔ the three arrays; `updatedAt`
  read-only (the sweep-grace precedent does not apply — goals grant no grace —
  but the pattern of keeping it out of the update allowlist does, because it sits
  in GOAL_FIELDS and therefore in undo's container diff).
- `AnchorContextResponseSchema`: optional `goals[]`, schemaVersion +1 (Phase 4;
  optional-only so old plugin builds strip it — the locked additive rule).
- **No item-shape changes.** TASK_FIELDS/HABIT_FIELDS untouched; db.ts item
  allowlists untouched; the OpenClaw plugin parses today's payloads unchanged
  until Phase 4.

## Store plan

- New slice: `goals: Goal[]`, CRUD + `setGoalState`, hydrated in
  `initializeStore`'s Promise.all (**update the six unit-test files that
  hand-enumerate `lib/db` in vi.mock factories FIRST** — programs-routines Phase 2
  broke 63 tests at once on exactly this, and Phase 3 hit it again).
- `goalsAvailable` availability flag, item_types/collections precedent.
- Membership writes ride the existing join reconciliation (`reconcileMembership`
  generalized to carry `role` + `sort_order`): add-then-remove ordering, dedupe,
  only 23503 survives, everything else rethrows. Role changes (promote a member to
  milestone) are an upsert on the same PK — one write, no delete+insert window.
- `HistoryState` gains `goals`; `syncContainers` gains the goal callback pair
  (join reconciliation, NOT a column mapper — the drift programs-routines warned
  about).
- Create-with-membership: the add actions' `memberships` payload gains
  `goalIds?` (and the goal-side "new milestone" flow passes
  `{goalIds: [id], role: 'milestone'}`) so item + join rows land in one set(), one
  undo entry.
- Dangling-id rule extends verbatim: all three arrays may name trashed items;
  consumers filter against the live index (`useLiveItemIds`); progress counts live
  milestones only.
- Derived helpers in a new pure module **`lib/goals.ts`** (the lib/overdue.ts "ONE
  definition" pattern): `goalProgress(goal, liveItems)`,
  `nextMilestone(goal, itemsById, todayStr)` (earliest un-achieved by target date,
  undated ones after dated, then sort_order), `checkinStanding(goal, itemsById,
  todayStr)` (next due date from recurrence + last completed date), `timeElapsed
  (goal, todayStr)` (startsOn→targetOn fraction, for the behind/ahead read). Every
  surface asks this module; no surface re-derives.

## UI plan

- **Organize console — "Goals" section** in the CONTAINERS group. List rows:
  CategoryIcon + name + quiet progress fraction ("3/7") + state pill (`Achieved` /
  `Abandoned` — active goals wear nothing, the guilt-free law). Detail pane: name
  (buffered rename via `useNameDraft`), why, icon/color, starts/target date
  pickers, state control, **progress bar** (derived), **Milestones** (ordered list
  with the by-id swap-reorder precedent, add via the entity picker filtered by
  `isMilestoneEligible` OR inline-create a new dated task pre-linked as milestone),
  **Members** (picker filtered by `isCollectible`), **Check-ins** (see Phase 3).
  Delete → AlertDialog naming what actually happens: members and milestones are
  ordinary items and SURVIVE — only the goal and its links go to the trash (the
  "say what deleting actually does" lesson, commit `2c2caa5`).
- **`/goal/[id]` page**: the reading surface. Header (name, why, state, progress,
  target countdown), milestone timeline (achieved ✓ / next highlighted / overdue
  quietly annotated — never a warning color; guilt-free law applies to being
  behind on a goal MORE than anywhere else in this app), member list grouped by
  type, check-in history (from `completedDates` + `item_events`). Console detail
  and page share section components.
- **Item dialog/panel — "Goal" PropertyChip**, cloned from the Routine chip
  (multi-membership check-rows, "Chinese +1" collapse, draft-held in add mode via
  the memberships payload, live join-reconciliation in edit/panel). Gated on
  `isCollectible` and `goalsAvailable`. The chip's popover carries a "Manage
  goals…" row into the console section (`openDialog({type:'console', tab:'goals'})`).
- **Milestone marking on rows:** a small flag glyph in the row's identity area for
  items that are a milestone of any live goal — resolved via a memoized
  item→milestone-goals index, quiet (muted ink, honey only on hover tooltip naming
  the goal via RailTooltip). Deliberately NOT a rail column — the rail is full and
  its columns are budgeted (the Phase-6 row-rail note).
- **Palette:** static `app.goals` (open console section); dynamic "Open goal: X"
  per goal (customTypeCommands pattern — memoized on list identity, alias-guarded,
  no shortcuts on dynamic commands). Omnibar: goals join `groupResults` as a
  section; a `goal:<name>` search-grammar filter is deferred (it filters by a
  many-to-many, which the grammar has no precedent for — routines don't have one
  either).
- **Copy rules:** article + name ("your Learn Chinese goal"). "Milestone" and
  "Check-in" are membership words, never type names — the item stays "a task" in
  every type-facing surface.

## Beacon + agent (Phase 4)

- Beacon context gains a `### Goals` section (active goals only): name, why,
  progress fraction, next milestone with its date, days to target, check-in
  standing ("check-in due Sunday" / "last check-in Aug 17"). Emitted only when
  goals exist, so every byte-pinned context test stays exact (the `### Paused`
  precedent). Achieved/abandoned goals stay out of the prompt.
- `/api/agent/context` serves `goals[]` (id, name, why, state, dates, three
  role-arrays), schemaVersion +1. Additive-optional; old plugin builds strip it.
- Agent writes (same phase or a fast follow, per the Phase-4 posture):
  `POST/PATCH/DELETE /api/agent/goals`, membership with roles, with the
  refusal-over-silent-no-op doctrine: role writes validate eligibility through the
  registry predicates (a recurring item as milestone → 400 naming the rule, never
  a stored-but-meaningless row); `withTrashedMembersKept` applies to goal
  membership replacement identically (the projection-blind-caller bug is the same
  bug here); achieved_at is derived server-side from a state write, never
  client-supplied (the pausedAt precedent — an agent-chosen timestamp is wrong in
  both directions).
- OpenClaw plugin: goals in context + a `kind: 'goal'` arm on the collections
  tools; ships on the next deliberate republish (0.2.0 is already sitting
  unpublished — do not force a release for this).

## Phasing (app must work at every step)

- **Phase 0 — foundations.** Migration 029; GoalSchema + dist rebuild; db.ts
  CRUD/mappers (role-aware reconciliation) + `goalsAvailable`; container-registry
  `aspire` role + `goal` kind (every exhaustive-switch error fixed = every
  touchpoint found); registry `milestoneEligible` + predicates. Zero UI; app
  behavior unchanged. Fix the six vi.mock db enumerations before wiring
  initializeStore.
- **Phase 1 — goals end-to-end, console section.** Store slice + history + undo;
  console Goals section (list + detail: identity, dates, state, members,
  milestones with ordering); item dialog/panel Goal chip; create-with-membership;
  delete/restore + trash participation. Progress derivation (lib/goals.ts) lands
  here because the detail pane shows it.
- **Phase 2 — the goal surface.** `/goal/[id]` page + shared section components;
  milestone flag on rows + tooltip; palette + omnibar; the celebrate-on-last-
  milestone prompt (offers "Mark achieved", never auto-writes).
- **Phase 3 — check-ins.** Role `'checkin'` UI: console "Check-in schedule" block
  (creates a recurring task pre-linked, frequency picker seeded weekly) or link an
  existing recurring item; goal surface check-in history; completing a check-in
  from the goal surface offers a note, stored as an `item_events` row with
  `action: 'checkin'`, payload `{goalId, note}` (the action column is open text
  precisely so this is additive — 023's design paying off). A fuller guided
  check-in flow (EOD-style dialog) is deferred until the plain one proves itself.
- **Phase 4 — external/AI.** Beacon section; context `goals[]` + schemaVersion
  bump; agent routes; plugin arm (unpublished until the next release).
- Each phase gets the house adversarial review before its commit lands; Phases
  1–3 each ship with their e2e spec (goals.spec: create → add milestone → complete
  it on the grid → progress updates → achieve; TEST_TITLE_PREFIX fixtures, own
  cleanup prefix — the two-files-sharing-a-DELETE lesson from scope-rail.spec).

## Behavioral invariants to preserve (regression traps)

- **Goals never suppress.** No goal state or membership ever feeds
  `inactiveItemIdsOn` / `isOpenLoopSuppressedOn`. If a future "shelve goal hides
  work" ships, it must go through lib/active.ts as a first-class path — never a
  side channel.
- **No goal operation writes member item fields.** State changes are one container
  row; role changes are one join row. Never status/streak/completedDates/
  startDate/repeat*/timeBucket.
- **Milestones are one-shot; check-ins are recurring** — enforced at every write
  path (UI, store, agent), via the registry predicates, not scattered conditions.
- **Progress is derived and live-filtered** — never stored, never counts trashed
  milestones, never reads `completedDates` for one-shot status (and never scalar
  status for anything recurring).
- tasks[]/habits[]/items[] element shapes unchanged; goal membership travels only
  in `goals[]`. schemaVersion bumps are additive-optional.
- `goal_items` has no updated_at column and must never get the house trigger.
- Frozen e2e text contracts survive all new UI; `data-item-type` and row testids
  untouched by the milestone flag.
- Dist-matches-src CI gate: every types change rebuilds the committed dist in the
  same commit.

## Deferred for a decision (recorded, not designed)

- **Shelving a goal to hide its work** — use a program for now (an item can be in
  both). Revisit if users keep creating shadow programs mirroring goals.
- **Goals holding routines/projects** (`goal_routines`, project-level membership) —
  items-only in v1; a routine's items can be added individually. The join-table
  precedent makes this cheap later if the chafe is real.
- **Numeric key results** ("$1.2m of $3m", "HSK 3 of 5") — v1 milestones carry it
  in the title. A `target_value`/`current_value` pair on the join row would be
  additive. This is OKR territory; wait for the pull.
- **Guided check-in flow** (EOD-style dialog: note + confidence + "still on
  track?") — after Phase 3's plain version proves the cadence.
- **Sub-goals / goal hierarchy** — not designed; milestones cover the tree's first
  level and most real goals are one level deep.
- **`goal:<name>` search grammar; Display-menu group-by-goal** — grouping by a
  many-to-many needs the first-claim-wins rule routines already carry; adopt
  together or not at all.

## Open questions for Kirby (each with a recommendation)

1. **The noun.** "Goal" is the natural word and the recommendation. One wrinkle:
   unified-items.md uses `goal` as the canonical example of a custom ITEM TYPE, and
   a user (or the organize-console seed copy at line ~288) may hold a custom type
   with that slug. The namespaces are disjoint (types vs containers) and the
   console shows them in different sections, but the words would collide in
   conversation and in Beacon's vocabulary. Alternatives: "Ambition", "Pursuit",
   "Quest". **Recommend: Goal**, and if the collision worries you, drop `goal`
   from the seeded custom-type examples rather than bending the container's name.
2. **Many-to-many vs one-goal-per-item.** Recommend many-to-many (the morning run
   serving Health and Marathon is real; the join infra exists; the chip UI
   handles it like routines).
3. **Milestone = item-with-role vs dedicated table.** Recommend item-with-role
   (locked decision 2's reasoning). The cost is that a milestone row on the grid
   looks like a task with a small flag — if you want milestones to be visually
   louder on the grid, that's a design pass, not a schema change.
4. **Should being behind on a milestone shout?** Recommendation: no — milestones
   join the existing past-due machinery (bar, tray, sweep) with zero special
   casing, and the goal surface annotates quietly. The guilt-free law holds.
5. **Numeric targets in v1?** Recommend no (titles carry them); deferred entry
   records the additive path.
6. **Auto-achieve on last milestone?** Recommend no — celebrate + offer.
7. **Check-in default cadence** when creating from the goal surface: weekly?
   Recommend weekly, seeded editable, no cadence stored on the goal itself (the
   check-in ITEM owns its recurrence — one timing per item, the membership-only
   principle from programs-routines decision 2).
8. **Does the ScopeRail or Display menu ever mention goals?** Recommend no for
   both in v1: goals don't gate (rail) and don't partition (filter axis). The
   goal's presence in daily views is the milestone flag and the chips.
