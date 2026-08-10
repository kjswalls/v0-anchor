# Programs & Routines — layered activation over unified items

**Status (2026-08-08): DRAFT, round-1 adversarially reviewed, naming settled.**
Product direction settled in conversation with Kirby (decisions recorded below); the
design survived a 5-lens adversarial review (4 blockers, 22 should-fixes, 9 notes —
all confirmed findings folded in, see the review section at the end); the entity was
working-titled "schedule" and renamed **Program** the same day (locked decision 12).
Not yet approved for build; no code written. Read [unified-items.md](unified-items.md)
first — this plan builds on its locked decisions and amends none of them.

**Goal:** Items can belong to **routines** (small reusable collections — a morning
routine, an exercise routine whose habits fall on different days) and **programs**
(period-of-life collections — summer, school year, a vacation month; they hold items
and/or routines). Plus first-class **pausing** at item, routine, and program level.
Whole slices of the plan switch on and off without touching the items themselves,
without losing streaks, and without accruing past-due guilt.

Absorbs parked roadmap items #179 (pause habit/task) and #200 (schedule versions —
now "programs"). Adjacent but NOT decided here: #201 (recurring-task home base),
#182 (repeat alignment), #158 (recurrence end dates), #205 (bulk multi-select).

## Product decisions (Kirby, 2026-08-08)

1. **Inactive = hidden entirely.** Items suppressed by an inactive program (or a
   paused routine/item) vanish from the grid, EOD review, past-due, and braindump.
   Items linked to nothing are always live. Softened only by the history rule
   (locked decision 4) and the Paused section (locked decision 10).
2. **Membership only — no per-program timing.** An item carries ONE timing; a
   program turns sets of items on/off. A different-period variant is a separate item.
   (Per-program timing overrides recorded under Deferred — an additive override table
   could layer on later without unwinding this.)
3. **Many-to-many everywhere.** item↔routine, item↔program, routine↔program are all
   join tables. A routine is reusable across programs; an item can sit in routines
   and/or directly in programs.
4. **Activation is manual with optional dates.** Programs are tri-state
   `auto | active | paused`: `auto` follows an optional date range (no range = active);
   explicit `active`/`paused` always win. Routines and items get a paused flag with an
   optional resume date.

## Locked design decisions

1. **Routines and programs are containers (new tables), not item types.** They have
   no status, no occurrences, no grid block in v1 — nothing the registry's per-type
   machinery models. Members are referenced **by id** via join tables — deliberately
   breaking from the name-referenced project/group pattern (name refs are why rename
   is still parked for those, lib/commands/registry.ts:98-100). Consequence: routines
   and programs support rename from day one. `projects`/`habit_groups` stay untouched
   (unified-items locked decision 4: containers stay split). habit_groups is a
   proto-routine; convergence is Deferred, not attempted.

2. **Pause is never a status value.** Task `pending|completed|cancelled` and habit
   `pending|done|skipped` are frozen external contracts (unified-items locked decision
   1 — the OpenClaw plugin safeParses and throws on drift). Pause state lives in new
   nullable columns (`paused_at`, `paused_until`) and container state — the same shape
   skip took (`skippedDates`, never a status value).

3. **One resolver, pure, date-parameterized: `lib/active.ts`.** Following the
   lib/overdue.ts "ONE definition" pattern (that module exists because three copies of
   a predicate drifted). Exports `isItemActiveOn(item, dateStr, ctx)`,
   `isOpenLoopSuppressedOn(item, dateStr, ctx)` (decision 4's combined predicate —
   the one surfaces actually call), and `inactiveItemIdsOn(dateStr, ctx)`, with
   ctx = {routinesById, programsById, memberships}. Every surface asks this module;
   no surface re-derives.
   - `isPausedOn(x, D)` = `paused_at` set AND `dateOf(paused_at, tz) <= D` AND
     (`paused_until` null OR D < `paused_until`). The **lower bound matters**: without
     it, pausing on Aug 8 would retro-suppress unmarked July days — exactly the
     "retroactively erase a July that happened" failure decision 4 forbids. With it,
     an expired pause reads correctly as "was paused during [start, until)" using only
     data already on the row, zero cleanup writes.
   - **Manual resume normalizes to `paused_until = today`** (keeping `paused_at`)
     rather than clearing both fields. Same predicate result from today forward, and
     the pause interval stays recorded on the row — which decision 9's sweep grace
     requires. Pausing again later overwrites the pair (only the latest interval is
     kept; sufficient, since only the most recent resume matters anywhere).
   - `isProgramActiveOn(p, D)` = state `active` → true; `paused` → false; `auto` →
     no range, or D within [starts_on, ends_on] (inclusive, either end open). Manual
     states genuinely have no date history and apply uniformly to every rendered date
     — only `auto` ranges and pause intervals are date-resolved.
   - An item's **activation paths**: direct (item→P); via routine (item→R→P); and
     standalone routine (item→R where R belongs to no program). A path is live on D
     iff its program (if any) is active on D AND its routine (if any) is not paused
     on D. Soft-deleted containers are removed from resolution BEFORE the standalone
     test — so a routine whose live-program count drops to zero becomes standalone
     and its own pause state governs (restore-intact semantics; the trashed
     container's suppression and enablement both vanish while trashed).
   - `isItemActiveOn` = NOT isPausedOn(item, D) AND (item has no paths OR ≥1 path is
     live on D). No paths = today's behavior, unchanged.
   - **Known discontinuity, accepted:** attaching a live standalone routine to its
     FIRST program rescopes it — if that program is inactive (e.g. a future-dated
     "next school year" prepared in advance), the routine's items vanish from today
     as a side effect of the join write; detaching from the last program resurrects
     them. This is the algebra working as designed (scoping a routine IS the point),
     but the manager's attach flow must say so in its confirm copy ("Adding Morning
     to School Year hides its 5 items until Sep 1").
   - **Date rule for dateless surfaces:** grid columns resolve at their own date;
     every non-date-scoped surface (braindump, EOD, past-due, search annotation,
     manager pills, Beacon, agent projections, palette availableWhen) resolves at
     **today**, tz-resolved via toDateStr — never at the navigable selectedDate.
     Server-side, today comes from user_settings.timezone.
   - Date-parameterization is the point: a week view spanning a program's end date
     shows the handoff in the later columns; a paused-until item reappears in columns
     past its resume date. Multiple active programs = union, which falls straight
     out of the disjunctive path rule. "Swap programs" is just pause A + activate B.

4. **Suppression hides open loops, never history.** On date D a suppressed item is
   hidden iff it is an *open obligation* there: recurring with no mark on D (nothing
   in completedDates / skippedDates / dailyCounts), or a one-off with status
   `pending`. Marked occurrences and completed/cancelled one-offs keep rendering
   exactly where they render today. This combined predicate is
   `isOpenLoopSuppressedOn` and it is the ONE test every hiding surface uses —
   including Beacon's context filter and the agent projections (see decision 6), not
   just the grid. Rationale: habits are deliberately un-anchored so history stays
   visible (unified-items locked decision 3); pausing must not erase a July that
   happened. Worked example: did the habit at 8am, paused its routine at noon → the
   mark on today keeps it in EOD's Done section, in Beacon's narration, and in
   habits[].

5. **Streaks need zero work and get zero writes.** Nothing in the app breaks a streak
   on a missed day (verified: the only crons are trash purge and the EOD push; streak
   moves only inside set_item_completion). Pause/unpause therefore never touches
   `streak`, `completedDates`, `dailyCounts` — the RPC stays the only completion
   path. If miss-based streak breaking is ever added, it must consult lib/active.ts;
   recorded here as a trap.

6. **Suppressed open loops are filtered OUT of the legacy agent projections; plugin
   freshness is TTL-only.** tasks[]/habits[] may shrink freely — schema-safe for
   every deployed plugin build. The filter is `isOpenLoopSuppressedOn(item, today)`
   (NOT a blanket activity test): a paused habit completed today keeps its row, so
   the plugin's ✅ narration matches EOD. **Recorded waiver of decision 4:** the
   exclusion drops whole rows, history included — acceptable because suppressed items
   still travel complete in items[] (unfiltered, plus pause metadata) for future
   plugin builds. Note the toLegacy projections are spread-minus-discriminator
   (lib/db.ts:632-640), so surviving rows carry pausedAt/pausedUntil automatically —
   additive-safe, old builds strip unknown keys. schemaVersion 3 → 4 when
   programs[]/routines[] join the response (Phase 4).
   **No webhook work in v1.** No new event names (notifyPlugins drops unregistered
   names, lib/openclaw-registry.ts:46). And no synthetic nudge either: the plugin
   registry is an in-memory Map populated only server-side by /api/agent/register,
   while every v1 pause/membership/container write is browser-initiated
   (planner-store → client db.ts) — a client-side notifyPlugins call iterates an
   always-empty Map. This is a pre-existing property of ALL UI-initiated edits, not
   new to this feature; the plugin's ~5-minute TTL is the freshness mechanism.
   A server-relay nudge route is Deferred. Agent WRITE routes for routines/programs:
   none in v1 (same posture custom types took).

7. **The registry stays the capability authority.** New ItemTypeConfig capabilities:
   `pausable` (v1: true for task/habit/custom) and `collectible` (may join
   routines/programs; v1: true for all). Predicates (`isPausable(item)`) AND the
   capability with item state, like isSkippable. Both land in buildCustomTypeConfig's
   template too. **Subtasks (parentItemId set) are neither collectible nor
   independently pausable** — they surface only through their parent and follow its
   state; membership UI is hidden for them and membership writes reject them (same
   spirit as validateParentItemId's guards).

8. **Bulk state changes are one write and never touch member items.** Pausing a
   routine/program writes ONE container row — member item rows are untouched, so it
   is one undo entry and zero risk to recurrence anchors. No routine/program
   operation ever writes startDate/repeat*/status on members (handoff §3.6 hazard:
   bulk verbs rewriting recurrence anchors).

9. **The auto-age sweep gets a resume grace period — exclusion alone only defers the
   disaster.** daysOverdue measures from startDate (lib/overdue.ts:71-77), which
   pause never moves, so overdue-age accrues THROUGH a pause; excluding suppressed
   items from selectOverdue protects them only while suppressed. Without more, the
   morning after a 35-day vacation resume, use-overdue-sweep unschedules everything
   >30 days old in one batch — the exact harm the exclusion was meant to prevent.
   Fix, fail-closed and sweep-only (the bar/tray still show resurfaced items —
   visible and guilt-free is correct; only the unattended writer gets the grace):
   the sweep skips an item when any resume boundary falls within the trailing
   autoAgeDays window —
   (a) the item's own `paused_until` (manual resume records it, decision 3);
   (b) `starts_on` of any auto-program the item resolves through (suppression ended
       when the range began);
   (c) conservatively, `updated_at` of any container the item resolves through
       (proxy for manual state flips — over-broad in the safe direction: a renamed
       container merely delays sweeping its members).
   selectOverdue itself gains a REQUIRED `inactiveIds: ReadonlySet<string>` parameter
   (no default) so every present and future caller must answer the suppression
   question at compile time; the byte-pinned Beacon renderer path passes a
   pre-filtered list and an empty set.

10. **Paused items always have a browsable home, from Phase 1.** Hidden-entirely plus
    "recovery = remembering the name to search" would be silent data loss. The
    braindump gains a collapsed **Paused** section (bottom, GroupSection primitive)
    listing every suppressed *pending* item — regardless of scheduled state (it is a
    separate section, not part of braindump's membership predicate) — with quiet
    resume affordances. It ships IN PHASE 1 alongside the first pause verb, and it
    exists on mobile via the Braindump tab (which also makes rows — and therefore
    the ScheduleSheet's Resume — reachable for paused items on touch). The manager
    (Phase 2+) shows container members and their states but is NOT the home for
    container-less paused items; the Paused section is.

11. **Verbs that move an item into a suppressed window are allowed, with a receipt.**
    The boundary week renders active and inactive columns side by side (decision 3's
    showcase), so a drag can drop a pending item into an inactive column — where it
    vanishes on release. Same class: EOD "Move all to tomorrow" on a program's last
    day, EOD/tray date pickers, the dialog's date chip, ScheduleSheet bucket buttons.
    All allowed (blocking would fight the boundary-week feature), but every such
    write shows the standard undo-toast style receipt: "Moved into your paused Summer
    program — hidden until Sep 1." Add as a surface-checklist row and to
    programs.spec (boundary-week drag case).

12. **RESOLVED (Kirby, 2026-08-08): the entity is named `Program`.** The working
    title "schedule" collided with Anchor's most saturated noun — the grid IS "the
    schedule" (`isScheduled`, `scheduleTask`, ScheduleBlock, ScheduleSheet, "Add to
    schedule"). Program won over Phase/Era (both connote sequential, one-at-a-time,
    non-repeating periods — fighting the locked multi-active + recurring semantics)
    and over Mode (natural English but collides with "Dark mode" copy and `mode` is
    the most overloaded prop name in the UI code). **The rename is code-deep**:
    `programs` table, `Program` type, `programId`, `programs[]` context array —
    NOT a UI-copy alias over `schedules` — so the code namespace is collision-free
    too. Copy pattern: an article + name ("your Summer program"); the manager is
    "Routines & Programs". Grid-side names (ScheduleBlock, ScheduleSheet,
    isScheduled…) are untouched and now unambiguous.

## Target DB shape (migration 024)

All idempotent; house RLS pattern (FOR ALL, auth.uid() = user_id, USING + WITH
CHECK); next free number 024. Dates as text `yyyy-MM-dd` per house convention;
timezone resolution stays app-side. updated_at triggers on **routines and programs
only** — the join tables carry no timestamp columns, and attaching the house trigger
to a table without `updated_at` makes every UPDATE throw (`record "new" has no field`)
— a Phase-5 sort_order write would hit it months later.

- `routines`: id uuid PK gen_random_uuid(), user_id uuid NOT NULL FK auth.users
  CASCADE, name text NOT NULL, icon text, color text, paused_at timestamptz,
  paused_until text, sort_order int, created_at/updated_at now(), deleted_at.
- `programs`: same identity/infra columns, plus state text NOT NULL default 'auto'
  CHECK (state in ('auto','active','paused')), starts_on text, ends_on text.
- `routine_items`: routine_id FK routines ON DELETE CASCADE, item_id FK items ON
  DELETE CASCADE, user_id NOT NULL, sort_order int, PK (routine_id, item_id).
- `program_items`: program_id FK programs CASCADE, item_id FK items CASCADE,
  user_id NOT NULL, PK (program_id, item_id).
- `program_routines`: program_id FK programs CASCADE, routine_id FK routines
  CASCADE, user_id NOT NULL, PK (program_id, routine_id).
- **Composite FKs on the join tables**: (item_id, user_id) REFERENCES items(id,
  user_id) etc., backed by UNIQUE(id, user_id) on items/routines/programs
  (trivially satisfiable — id is already PK). Rationale: FK checks bypass RLS, so
  plain FKs + own-row RLS would let a user insert join rows referencing another
  user's uuids (a cross-tenant existence oracle + junk memberships). Cheap to close;
  close it.
- `items`: add column if not exists paused_at timestamptz; paused_until text.
- Purge cron: extend 'purge-deleted-items' to hard-delete routines/programs 30 days
  after soft-delete (join rows go by CASCADE). Item purge can never abort on the new
  FKs — both item-side FKs CASCADE (the 019:181-188 constraint that chose SET NULL
  for parent_item_id is satisfied here by CASCADE; join rows are not user data).
- Soft-delete semantics: soft-deleting a routine/program keeps its join rows (a
  30-day restore brings membership back intact); the resolver ignores soft-deleted
  containers per decision 3. Soft-deleting an ITEM also keeps its join rows (restore
  intact) — so member arrays can carry ids that are in the trash; see store plan for
  the dangling-id rule.
- Ledger: if applied out-of-band, record version 024 immediately
  (migration-ledger-drift).

## packages/types (same commit as the migration, dist rebuilt)

- `RoutineSchema`, `ProgramSchema` (id, name, icon?, color?, pause/state fields,
  memberIds app-side — see store plan), exported types.
- `pausedAt?: string` (ISO timestamp) + `pausedUntil?: string` (dateStr) are added to
  **BOTH taskShape AND habitShape** — two edit sites, not one. habitShape does NOT
  spread RecurrenceFieldsSchema (its recurrence fields are declared inline; the
  skippedDates precedent already shows this split — schemas.ts:33 vs :121). Custom
  inherits from taskShape. The fields thereby auto-enroll in TASK_FIELDS/HABIT_FIELDS
  (Object.keys of the shapes), which enrolls them in undo diffing — and **forces**
  the next bullet.
- **db.ts taskUpdatesToRow/habitUpdatesToRow MUST gain pausedAt/pausedUntil.** These
  "allowlists" filter EVERY write, the app's own included — updateItem early-returns
  on an empty mapped row (db.ts:409-410), so without the entries the store's own
  pause verb and every undo restore of pause state are silent no-ops that unpause on
  reload. tests/unit/db-allowlists.test.ts also mandates it (asserts every schema
  field persists through updatesToRow). What actually keeps agents from PATCHing
  pause state is a different layer: the hand-enumerated TaskUpdateSchema/
  HabitUpdateSchema strip unknown keys — deliberately NOT extended until Phase 4.
- **TaskCreateSchema/HabitCreateSchema spread the shapes, so pause fields would
  auto-enroll in agent CREATE.** v1 omits them explicitly (`.omit({pausedAt,
  pausedUntil})` after the spread) — otherwise an agent could POST a born-invisible
  item, and the 201 echo (agent-api.ts entity spread) would claim pause state it may
  not have stored. Create-with-pause is a Phase 4 decision.
- AnchorContextResponseSchema: optional `programs[]`, `routines[]`, schemaVersion 4
  (Phase 4).

## The resolver's consumers — surface checklist

Every visibility surface gets an explicit decision (task status `cancelled` is the
cautionary tale of a half-integrated state — excluded from overdue/EOD/Beacon but
still rendering on the grid). All hiding surfaces use `isOpenLoopSuppressedOn`; all
dateless surfaces resolve at today (decision 3).

| Surface | Decision |
|---|---|
| Grid — deriveDayItems task filter (day-items.ts:62-82) + habit filter (:87-94) | Hidden per resolver + history rule, each column at its own date. One insertion covers all six canvas views. Inputs threaded through DayItemsInput's only two constructors (use-day-items.ts, week-schedule.tsx:260-278) as a per-date `inactiveItemIds` Set — deriveDayItems stays pure and store-free. |
| Past-due — lib/overdue.ts selectOverdue | Suppressed excluded via the new REQUIRED `inactiveIds` param (decision 9 — no default, compiler-enforced on all five callers). Covers bar, tray, goto.overdue, Beacon overdue, and the sweep; the sweep additionally applies the resume grace (decision 9). |
| EOD review — eod-review.tsx task list (:118-135) + habit sections (:164-175) | Suppressed excluded from pending; items with a mark today still appear under Done/Skipped (history rule). Pending habits already never appear in EOD, so paused-untouched habits cost nothing there. |
| Braindump — braindump.tsx membership predicate (:187-214) | Suppressed pending items leave the main sections and appear in the collapsed **Paused** section (decision 10) — including dated/scheduled ones the membership predicate would never admit. |
| Item dialog / panel / /item/[id] page | NEW ROW: shows effective activation state — "Paused until Sep 1" / "Hidden with your Summer program (inactive)" — guilt-free styling. Without it, editing or scheduling a found-via-search suppressed item is a silent no-op on every surface (the chips show WHICH containers, not whether they're suppressing). |
| Move-verbs into a suppressed window (DnD, EOD move-all, date pickers, ScheduleSheet) | NEW ROW: allowed + receipt toast (decision 11). |
| Beacon context — buildAnchorContext | Per-type section inputs filtered with `isOpenLoopSuppressedOn(item, today)` — NOT the focusItemId lookup, which stays on the unfiltered array (a per-item thread on a paused item is explicit intent; filtering it would silently blind the thread to its own subject — the "focus id not found → section omitted" behavior is pinned in item-growth tests and would swallow it without error). Renderers stay pure; byte-pinned ai-context tests keep passing on unchanged inputs; the focus section may carry the paused annotation. |
| Agent context — /api/agent/context | tasks[]/habits[] filtered by `isOpenLoopSuppressedOn(item, today)` server-side (decision 6, with the history-rule waiver). items[] unfiltered + pause metadata. Requires the route to fetch routines/programs/join tables from Phase 2 on — assigned in phasing. |
| Search / palette — lib/search.ts, commands/entities.ts | Suppressed items REMAIN findable (explicit intent) with a quiet paused annotation; today-scoped commands (isDoneOn listings, goto.overdue) go through the resolver. |
| Manager UI | Shows containers, their states, and their members (including suppressed) with state pills. NOT the home for container-less paused items — that's the braindump Paused section (decision 10). |
| User-card streak pill (user-card.tsx:79) | NEW ROW: unchanged — bestStreak reads ALL habits including paused ones, now as a decision rather than an accident (streaks are preserved state, not an open obligation; filtering here would read as losing the streak). |
| Mobile — schedule-sheet.tsx | Gains Pause / Pause until… rows (touch has no hover — #195 contract). Resume reaches mobile via the braindump Paused section's rows + the omnibar (search hit → edit sheet → overflow); an unskip-style resume row (sheet-unskip-button precedent) renders when the sheet opens on a paused item's row. |
| EOD/morning crons (eod-notify) | Unchanged — user-level, never item-level; the review dialog itself just has fewer rows. |

## Store plan

- New slices: `routines: Routine[]`, `programs: Program[]`, each carrying member id
  arrays app-side (`routine.itemIds`, `program.itemIds`, `program.routineIds`) —
  db.ts maps join-table rows ↔ embedded arrays. The app thinks in collections;
  normalized rows stay a DB concern.
- **Membership writes are join-table reconciliation, not column writes.**
  dbUpdateRoutine/dbUpdateProgram treat memberId arrays as a reconciliation op
  (delta insert/delete for the container, sort_order from array position), executed
  per-row tolerant of 23505 (row survived a soft-delete restore) and 23503 (member
  purged) so one dead id can't wedge an undo batch. "syncContainers generalizes"
  covers its DIFF loop only — the update callbacks carry this new join logic; a
  column-mapper-style callback would silently drop `{itemIds}` patches and undo of
  membership would never reach the DB.
- **Dangling-id rule:** member arrays may reference trashed items (join rows survive
  item soft-delete by design). Every consumer (manager counts, entity picker,
  inactiveItemIdsOn) filters member ids against the live items index; arrays are
  pruned only by the purge CASCADE, never eagerly.
- **Create-with-membership is one gesture:** the add actions gain an optional
  `memberships: {routineIds?, programIds?}` payload so the item row and its join
  rows land in one set() / one history entry. (The current add actions return void
  and mint ids internally — "apply membership after create" has no id to apply to
  and would cost a second undo entry.)
- HistoryState gains routines + programs explicitly (the undo subscriber snapshots
  only what it's told — planner-store.ts:1472-1476).
- initializeStore's Promise.all gains fetchRoutines/fetchPrograms; the
  availability-flag pattern gates the whole feature pre-migration (fetch returns null
  ⇒ `collectionsAvailable=false`, UI hidden — the item_types precedent, since
  read-path-only deploy safety was proven insufficient). use-overdue-sweep gains
  `collectionsAvailable` hydration as a fail-closed gate alongside its existing
  seven.
- Derived per-date suppression: `inactiveItemIdsOn(dateStr)` memoized on (items,
  routines, programs, membership identity, dateStr). Cheap — hundreds of items, ≤7
  evaluations per week render.
- Item-field pause writes ride the normal item pipeline (allowlists extended — see
  packages/types section); container/membership writes do NOT ride the item panel's
  scoped-write draft machinery (panel-writes-must-be-scoped invariant untouched).

## UI plan

- **Manager:** new ActiveDialog variant `manage-collections` (single-slot union +
  AppShell mount + palette command), titled **"Routines & Programs"**. Built on
  ResponsiveModal (bottom sheet on mobile — improving on manage-categories, which
  isn't). Two tabs: Routines | Programs (keyed Tabs, deep-link tab param). Rows:
  CategoryIcon + name + quiet state pill + member count + ColorSwatchPicker (8
  accent tokens + Auto name-hash) + delete → AlertDialog. Row click → stacked detail
  editor (EditProjectDialog precedent): rename (ids make it safe from day one),
  icon, color, state control (programs: Active / Paused / Follow dates + range
  pickers; routines: pause toggle + optional resume date), member list with add via
  one-at-a-time entity picker (no multi-select exists — #205 stays parked) and
  per-row remove. Attach-routine-to-program confirm copy states the visibility
  consequence when the program is inactive (decision 3's discontinuity). Reached
  from braindump header, palette, and the item chips' "Manage…" rows.
- **Braindump Paused section** (decision 10): collapsed GroupSection at the bottom,
  every suppressed pending item, quiet moon glyph + "Paused until…" / container-name
  subtitle, row affordances resume. Ships Phase 1.
- **Item dialog:** "Routine" and "Program" PropertyChips cloned from the container
  chip (square identity swatch = identity per the visual vocabulary; unset chip shows
  the noun). Multi-membership renders "Morning +1"; popover is check-rows. Add mode:
  draft-held, handed to the add action's `memberships` payload (one gesture). Edit/
  panel/page: chips write membership LIVE (join reconciliation — see store plan).
  Chips gated on the `collectible` capability. The header/detail area carries the
  effective activation state line (surface checklist row).
- **Pause/resume an item:** edit dialog's `...` overflow menu (beside Delete /
  Reset Streak), a palette entity-argument command, and ScheduleSheet on mobile. No
  desktop row-rail glyph in v1 (the rail is full; overflow + palette + sheet + the
  Paused section cover it). "Pause until…" = small date picker in the same menu flow.
- **Guilt-free law** (overlap-blocks locked decision 1): paused is never a warning
  color, badge, or dotted border. Where a paused thing IS shown (manager, search,
  Paused section), a muted state pill / moon glyph; color quarantined to glyphs,
  never body text; the lime accent never dims through a parent.
- **Palette:** static `app.collections` (open manager); dynamic providers
  "Pause/Resume routine: X", "Activate/Pause program: X" (customTypeCommands
  pattern: memoized on list identity, alias-collision guarded, no shortcuts on
  dynamic commands, availableWhen keeps rows honest).
- **Copy rules:** always an article + name — "your Summer program", never bare
  "Program"; grid copy ("Add to schedule") is untouched and now unambiguous.

## Phasing (app must work at every step)

- [x] **Phase 0 — foundations (built 2026-08-08, `7bbf6df` + `bd0aa1f`; migration
  NOT yet applied — see below):** migration 024; types package additions + dist
  rebuild (both shapes + Create-schema omits + updatesToRow allowlist entries — the
  db-allowlists test pins the trio); db.ts CRUD/mappers/availability flags. Zero UI.
  App behavior unchanged.

  **Deploy order is a non-issue BY CONSTRUCTION, and that is load-bearing.** The
  4-lens review's one blocker was that `itemToRow` wrote `paused_at`/`paused_until`
  unconditionally: PostgREST rejects an INSERT naming a column missing from its
  schema cache (PGRST204), so between an app deploy and `pnpm db:push` EVERY item
  create would 400 — silently, since the store's add paths are
  `.catch(console.error)`, so items would render optimistically and vanish on
  reload. Fixed by `pauseColumns()` emitting the pair only when set (nothing sets
  it before Phase 1, so a pre-024 database receives a byte-identical insert row),
  pinned by tests/unit/db-pause-columns.test.ts, and stated in the migration
  header. `fetchRoutines`/`fetchPrograms` cover the other direction by returning
  null on a missing table. Do not "simplify" either guard away.

  **Migration 024 APPLIED to prod 2026-08-08** via Supabase MCP and verified live:
  all five tables present, RLS enabled on each with its policy, 6 composite FKs
  (2 per join table), `updated_at` triggers on `routines`/`programs` ONLY (the
  join tables correctly have none), `items.paused_at`/`paused_until` present, and
  the purge cron rewritten to cover both new tables. MCP stamped its own
  timestamp version (`20260808222831`), which was corrected to `024` in
  `supabase_migrations.schema_migrations` — leaving it would have made `db push`
  replay 024 later (migration-ledger-drift).
- [x] **Phase 1 — item pausing end-to-end (#179)** (built 2026-08-08, `79f8af1`
  `5b416c9` `310e762` `989541b` + this commit). lib/active.ts (isPausedOn with the
  lower bound, open-loop predicate, inactiveItemIdsOn, suppressionReason); the
  surface checklist wired — grid (deriveDayItems + both constructors, per column),
  overdue with the REQUIRED inactiveIds param + sweep resume-grace (a), EOD,
  braindump Paused section, item-panel activation line, Beacon per-type filter with
  the focus lookup left unfiltered, agent projection filter, search annotation;
  verbs on the store, the palette, the dialog overflow menu (incl. Pause until…) and
  the mobile ScheduleSheet. Tests: active.test.ts (31), pause.test.ts (18),
  overdue suppression cases, db-pause-columns.test.ts (4), pause.spec.ts (5 e2e).

  **Deferred out of Phase 1, deliberately:** the move-verb receipts of decision 11.
  For item-level pause the only reachable case is dragging a row OUT of the Paused
  section onto the grid, which lands in lib/dnd/ — a contract-governed file whose
  changes must ship with their own e2e spec. It becomes properly load-bearing in
  Phase 3, when a program's date range makes whole week columns suppressed, so it
  is scheduled there rather than half-built here.

  **Also found and fixed during Phase 1:** `setItemPaused` originally resolved
  "today" through `resolveDateStr()`, which returns the navigable `selectedDate` —
  so pausing while browsing another week wrote a resume date from the day you were
  looking at. Pausing is dateless (decision 3); the store was the one place that
  didn't know it. And the e2e helpers `cleanupByTitlePrefix` / `fetchTest*` read the
  legacy projections that Phase 1 now filters, so a paused fixture became invisible
  to cleanup and leaked silently on the shared test user — both moved to `items[]`,
  and a `fetchTestItem` helper was added.
- [x] **Phase 2 — routines** (built 2026-08-09, `ec441e1` + `177d743`). Resolver
  path algebra (disjunctive: one live path is enough); store slice with CRUD,
  `setRoutinePaused`, `collectionsAvailable`, and routines in HistoryState; every
  resolver call site threaded incl. the agent context route fetching routines
  server-side; sweep grace (c); manager UI; Routine chip both sides; per-routine
  palette commands. 460 unit tests.

  **Layout decision (studied, then chosen):** three directions were mocked as an
  artifact — stacked drill-in, two-pane, inline expand. Chosen: **stacked with
  the two-pane editor above `sm`**. The argument was not aesthetic. Because the
  list may stand alone, the ROW must carry colour + name + paused pill + count
  rather than leaning on an editor that might not be rendered — that pressure
  produces the better list, and the list is what gets looked at. The two-pane
  half then contributes the thing the stacked half cannot: members render greyed
  *inside the editor* while the routine is paused, which is the only place in the
  app where cause and consequence are visible in one frame. Inline expand was
  dropped — a fifteen-member routine pushes everything below it off-screen, and
  it is exactly the layout that trips on `<ScrollArea>` silently dropping `max-h`.

  **`persistNewItem` is not a refactor.** `routine_items` carries a composite FK
  to `items(id, user_id)`, so a join insert that lands before the item row fails
  with 23503 and the membership is lost SILENTLY — present in the store, gone on
  reload. The join writes must chain off the create, never fire beside it.

  **The manager is deliberately not in the braindump header.** That row is
  width-critical at the 280px minimum; the collapse control was moved off it to
  buy the title ~30px, and a fifth button spends exactly that back. Routes in are
  the palette and the chip's own "Manage routines…" row.

  **Also found:** six unit test files hand-enumerate `lib/db` in `vi.mock`
  factories, so adding `fetchRoutines` to initializeStore's `Promise.all` broke 63
  tests at once — the mock returned `undefined`, the `Promise.all` threw, and the
  store silently loaded empty rather than failing loudly. Phase 3 adds
  `fetchPrograms` to that same call and will hit it again; update all six first.

  **And the sweep needed no new gate.** `fetchRoutines` rides the same
  `Promise.all` and lands in the same `set()` that clears `isLoading`, so gate 1
  already guarantees membership is known. That is now documented in
  use-overdue-sweep.ts, because moving routines out of that Promise.all would
  break it silently — every member of a paused routine would read as unprotected
  and get unscheduled in one batch.
- [x] **Phase 3 — programs** (built 2026-08-09, `3a828c8` + `874ed02` + `4e2a5eb`).
  Path algebra complete (direct / via-routine / standalone, disjunctive);
  `isProgramActiveOn` tri-state with an INCLUSIVE auto range; store slice with
  CRUD, `setProgramState`, `swapToProgram`, programs in HistoryState and
  syncContainers, `memberships.programIds`; every resolver call site threaded
  incl. the context route; sweep grace (b) and (c); Programs tab with the
  attach-discontinuity confirm; Program chip; per-program palette commands;
  week boundary rail; decision 11's move receipts. 499 unit tests, 3 e2e.

  **The auto range is inclusive at both ends; a pause's upper bound is
  exclusive.** Not an inconsistency — the two are written differently in the
  UI. "Jun 1 to Aug 31" is a period you are inside; "paused until Sep 1" is a
  date you come back on. Resolving them the same way would make one of the two
  read wrong by a day, forever.

  **`suppressionReason` has to pick between two blocked containers on one
  path**, and it names the BINDING one — whichever clears last, with an unknown
  return counting as latest. Naming the one that clears first would promise a
  return date the item will not honour: the user resumes the routine on the
  strength of the note and nothing appears.

  **Grace (c) needed a column that did not exist.** A manual `paused → active`
  flip has no recorded date — the tri-state keeps no history — so there is
  nothing to grace against, and without it the morning after someone turns a
  program back on the sweep unschedules every member at once. `updatedAt` was
  added to ProgramSchema as a READ-ONLY field (deliberately absent from
  db.ts `updateProgram`'s column allowlist, because it appears in
  PROGRAM_FIELDS and therefore in undo's container diff). It is stamped
  optimistically by `setProgramState`/`swapToProgram`: the trigger's value only
  reaches the store on the next reload, and "turn a program on, leave the tab
  open overnight" is exactly the case the grace protects.

  **`swapToProgram` skips writing 'active' onto a target that is already on.**
  An `auto` program inside its own range is already carrying its members;
  stamping 'active' would silently convert a self-managing program into one the
  user must remember to turn off.

  **The boundary rail is all-or-nothing across the week.** It costs 18px, and
  paying it only on the columns that need it would slew their hour grids
  against their neighbours. `lib/program-boundaries.ts` is a separate module so
  week-buckets can adopt it — it was NOT wired there, because that file has
  uncommitted work in the tree.

  **Found by running the e2e rather than reading it** (the Phase 1 lesson,
  applied): the palette truncates before `app.collections` once a couple of
  programs exist, since Phase 3 adds up to two dynamic commands per program;
  opening the manager from the palette leaves the omnibar's dismissable layer
  underneath, so the FIRST Escape closes the palette and the second the dialog
  (pre-existing, affects every palette-opened dialog); and a spec without an
  "it is on the grid first" baseline hangs, because waitForAppReady returns on
  hydration and can beat the items fetch — it passed alone and failed only in
  sequence.

  **Also fixed here:** two carried-over Phase 2 findings — the mobile
  ScheduleSheet's missing explanatory note (its Pause button stays item-level,
  which is what it can act on) and `switchType` discarding the add draft's
  membership. And `tests/unit/item-panel-writes.test.ts`, which had been
  failing `tsc` since Phase 2 added `routineIds` to ItemDraft without updating
  its fixture.
  **Deferred out of Phase 3, deliberately:** the boundary rail is on the week
  SCHEDULE view only, not week-buckets (uncommitted work in that file); and
  decision 11's receipt covers the store's move verbs, which is every reachable
  path today — a future verb that writes `startDate` without going through
  them would need its own call.

- [x] **Phase 4 — external/AI** (built 2026-08-10). Context serves `routines[]` and
  `programs[]` at schemaVersion 4, Beacon narrates what it is hiding, and agents got
  a write surface. Verified by 39 live calls against a running server, not just types.

  **Kirby's call on the write surface (2026-08-10), reversing decision 6's v1
  posture:** agents get it. "Agents should ideally have all (or most) of the control
  the user has, on behalf of that user." So: `POST/PATCH/DELETE /api/agent/routines`
  and `/programs`, plus item pausing on the existing PATCH routes.

  **Pausing is exposed as the VERB, not the columns.** `paused: true|false` and
  `pausedUntil`; `pausedAt` is derived server-side and stripped from every write
  schema. An agent-chosen lower bound is wrong in both directions — backdated it
  retro-suppresses history that actually happened, postdated the item stays visible
  and the pause looks like it silently failed. The translation is
  `resolvePauseWrite` in lib/active.ts, deliberately beside `isPausedOn`: the write
  and read sides of one interval must not be derived twice. Programs need no
  equivalent because their tri-state `state` IS the verb and carries no derived
  timestamp.

  **Create-with-pause stays omitted** (the open question from the packages/types
  notes). It is not parity: the user has no affordance that creates an
  already-invisible item, so this would be control the agent has and the user does
  not, and the 201 echo would report pause state for an item nobody can find.

  **Refusals, each because the silent alternative is worse than a 400:**
  re-pausing something already paused returns an empty patch rather than restamping
  `pausedAt` (which would drag the lower bound forward and un-hide the days
  between); `paused: false` with a `pausedUntil` is rejected because its plausible
  reading — "resume ON this date" — is the one thing it does not do; a bare
  `pausedUntil` on a live item is rejected because it would change nothing and
  return 200; a resume date at or before today is rejected because a pause that ends
  before it begins is indistinguishable from one that failed to apply; an inverted
  program range is rejected because it is live on NO date while reading as "out of
  season"; and `paused: false` on something already live writes nothing, because the
  interval it would leave behind grants the auto-age sweep a resume grace nobody
  earned. Dates are `yyyy-MM-dd`-validated at the boundary — they are compared
  LEXICALLY against `toDateStr` output, so "Sep 1" does not error, it lands on the
  wrong side of every comparison forever.

  **Membership is validated in the route, not left to the database.** The composite
  `(id, user_id)` foreign keys already make a cross-user reference impossible, but
  `reconcileMembership` deliberately swallows 23503 per row (an undo replaying a
  snapshot whose member left the trash meanwhile must not fail wholesale) — so an
  agent's typo would have returned 200 having stored nothing. The subtask rule
  (decision 7) is not expressible as a constraint at all, and is asked of the
  registry via `isCollectible`/`isPausable` rather than re-derived from the row.

  **Both container arrays are OMITTED, not `[]`, when the tables are unreachable.**
  `[]` asserts "you have no programs" to a consumer that might offer to create one;
  absent says "this server did not tell you". The filter still coalesces to `[]` —
  same fetch, two different questions.

  **Beacon gained a `### Paused` section**, emitted only when something is actually
  suppressed, so every byte-pinned context test stays exact. Filtering suppressed
  work out was right, but silence has its own failure mode: asked about a paused
  item by name, a model answering from an absence says it was finished, dropped, or
  never existed — and the last two invite a recreate that duplicates the row. It
  names the work, groups by cause through the existing `suppressionLabel`, and says
  plainly that these are not a backlog.

  **Still needs an npm republish to reach users:** the OpenClaw plugin's own
  narration and tools (see Phase 4d).
- [ ] **Phase 5 — polish:** show-paused-in-place view toggle (showCompletedTasks
  precedent — the Paused section already covers discoverability), group-by routine
  (view-options + GroupSection id lookup), routine-internal ordering UI (sort_order
  column exists from day one), bulk membership add.

## Deferred for a decision (recorded, not designed)

- Per-program timing overrides (Kirby chose membership-only 2026-08-08; revisit if
  duplicate two-variant items chafe in practice).
- habit_groups → routines convergence (locked container-split stands).
- Routine as a renderable grid block (project time-block analog).
- `paused_until` on programs; a one-tap "pause everything".
- Server-relay webhook nudge route (POST /api/agent/nudge calling notifyPlugins
  server-side, best-effort — would tighten plugin freshness below the TTL).
- Agent write routes + plugin tools for collections and pause.
- Recurrence end dates (#158) — adjacent, separate feature.

## Behavioral invariants to preserve (regression traps)

- Pause/unpause and all membership writes touch ONLY paused_at / paused_until /
  container state / join rows — never status, streak, completedDates, skippedDates,
  dailyCounts, startDate, repeat*, timeBucket. (timeBucket especially: an item with
  no bucket is invisible in day views — resume must find the item exactly as it was.)
- A mark on a date always renders regardless of suppression (history rule); the only
  recorded waiver is the whole-row agent projection filter (decision 6).
- The sweep is pause-aware in BOTH directions: excluded while suppressed AND
  resume-graced after (decision 9 — exclusion alone is necessary but not
  sufficient). Fail-closed on `collectionsAvailable` hydration.
- selectOverdue's `inactiveIds` param stays REQUIRED — a defaulted param would let a
  future caller fail open.
- One gesture = one history entry (container pause = one row write;
  create-with-membership = one set()).
- tasks[]/habits[] element shapes never change except additive-optional; arrays may
  shrink. Never a new status enum value. Custom-frequency invariants (repeatDays
  non-empty) are never touched by this feature.
- Suppressed ≠ deleted: deleted_at semantics untouched.
- Search keeps finding paused items; per-item Beacon threads keep seeing their
  subject.
- Frozen e2e text contracts (Add Task/Add Habit, Save Changes, input ids, 'What needs
  to be done?', data-sub-input) survive all new UI.
- "Program" is entity-only vocabulary; grid-side names (isScheduled, scheduleTask,
  ScheduleBlock, ScheduleSheet, "Add to schedule") never adopt it and never change.

## Verification gates

Unit: NEW tests/unit/active.test.ts (table-driven resolver algebra: paths × pause
states × dates × marks × soft-deleted containers × the isPausedOn lower bound);
existing recurrence, day-items, overdue (extend for inactiveIds + grace), commands,
db-allowlists (auto-covers the new fields), ai-context + item-growth (add
paused-focused-item case; re-read deliberately if inputs change output),
item-panel-writes (must stay green — membership writes bypass drafts). E2E: NEW
pause.spec (pause habit → gone from grid/EOD/bar, present in braindump Paused
section; streak intact; resume restores; pause-until boundary), routines.spec,
programs.spec (swap, week-view boundary render + boundary-drag receipt).
**E2E hygiene contract extends to containers:** fixtures named with
TEST_TITLE_PREFIX; globalSetup's litter sweep extends to routines/programs by
prefix (join rows CASCADE); per-spec container cleanup via direct service-key REST
(resetUserSettings precedent); cleanupByTitlePrefix switches from tasks[]/habits[]
to items[] — the projections filter suppressed items out, so a spec that pauses a
fixture and fails would otherwise leak it invisibly. Plugin smoke: GET
/api/agent/context parses with the OLD published AnchorContextResponseSchema while
paused items and both new arrays are present.

## Adversarial review (round 1, 2026-08-08)

5 lenses (resolver semantics, contract safety, data/migration integrity, UX
coherence, completeness) attacked the pre-review draft: 4 blockers, 22 should-fixes,
9 notes; the confirmed ones are folded in above. The instructive ones:

- **"Allowlists deliberately not updated" was wrong-layer** (found by 4/5 lenses):
  db.ts updatesToRow filters EVERY write including the app's own, and updateItem
  early-returns on an empty row — the store's own pause verb would have been a
  silent no-op that unpauses on reload, while the db-allowlists drift test failed
  CI. The agent gate is the hand-listed Update schemas; the Create schemas spread
  the shapes and needed explicit omits.
- **The sweep exclusion only deferred the mass-unschedule** to the morning after
  resume (daysOverdue counts from startDate through the pause) — and the original
  model recorded no pause interval to grace against. Fixed by the isPausedOn lower
  bound + resume-normalizes-to-paused_until + decision 9's grace.
- **The synthetic webhook nudge was dead code**: v1 pause writes are browser-side;
  the plugin registry Map exists only in server memory. TTL-only freshness is the
  honest (and pre-existing) answer.
- **isPausedOn without a lower bound retro-suppressed all unmarked history** before
  the pause began — directly contradicting the plan's own history rationale.
- **"The manager is their always-visible home" was structurally false** for
  container-less paused items, and didn't exist in Phase 1 at all → decision 10.
- **Two locked decisions conflicted**: the history rule vs whole-row projection
  filtering → resolved with the open-loop predicate at every surface + an explicit
  recorded waiver for the projections.
- Smaller confirmed: habitShape doesn't spread RecurrenceFieldsSchema (two edit
  sites); syncContainers' callbacks need join reconciliation, not column mappers;
  join-table FKs bypass RLS (composite FKs); updated_at triggers would break
  trigger-less join tables; add actions return void (memberships payload); Beacon
  focus threads must not lose paused subjects; dateless surfaces needed a declared
  resolution date; e2e cleanup helpers read the projections that now filter paused
  fixtures out.
- Refuted / accepted as-is: the standalone-attach discontinuity is the algebra
  working as designed (mitigated with confirm copy, not a model change); user-card
  streak pill correctly keeps reading paused habits (now recorded as a decision).

## Phase 0 implementation review (2026-08-08)

4 lenses (SQL correctness, type/contract safety, db.ts runtime, scope audit) over
the committed diff; one lens dry-ran the whole migration against the live database
inside a rolled-back transaction. 1 blocker, 5 should-fixes, 5 notes — all fixed in
`bd0aa1f`. Worth keeping:

- **The blocker: unconditional pause columns on INSERT** (see the Phase 0 ledger
  entry above). Found by all four lenses independently, and confirmed against the
  live DB rather than argued from the code — the reviewer queried the migration
  ledger and `information_schema` to prove 024 was unapplied.
- **`reconcileMembership` swallowed every error class.** The per-row retry logged
  and continued regardless of cause, so an RLS denial, a missing table, or a
  transport failure resolved as success while the store kept optimistic membership
  that vanished on reload. Now exactly one code survives (23503 — a member
  hard-purged since the store last read, which an undo replaying a membership
  snapshot genuinely hits); everything else rethrows. Also noted: 23505 is
  unreachable under `upsert` (a PK conflict resolves to an UPDATE), so half the
  originally-planned tolerance set was dead code.
- **Removals ran before additions.** With no cross-request transaction, an
  interruption mid-reconcile committed the deletes and lost the adds. Swapped: the
  sets are disjoint by construction, so add-then-remove is free, and an
  interruption now leaves a visible superset instead of silently dropping members.
- **Duplicate ids in a desired list** abort the whole upsert with 21000 ("cannot
  affect row a second time") — trivially producible from a multi-add UI. Deduped.
- **Program membership had no ORDER BY**, so `itemIds`/`routineIds` came back in
  heap order and could reshuffle between identical fetches — which a Phase 2
  membership diff would read as a real change and write back. Both program join
  queries now sort by member id; `routine_items` gained the same tiebreak under
  its `sort_order`.
- **Create was non-atomic**: the container row committed even when its membership
  write failed. Compensating hard-delete added (join rows follow by CASCADE).
- **A stale comment claimed the db.ts allowlists are "the ONLY field filter for
  the agent PATCH endpoints".** That is the exact wrong-layer belief round 1 caught
  in the plan; left uncorrected it would have taught the next editor to reason
  about agent exposure from the wrong file. Rewritten to name the real gate (the
  hand-enumerated Update schemas).
- Smaller: `unique (id, user_id)` moved out of `create table if not exists` into
  guarded DO blocks (a skipped CREATE would make the join-table FKs abort with
  "no unique constraint matching given keys"); fetch errors now discriminate
  missing-table from transient, so a network blip can't latch the feature off.
- Verified clean by the review: the composite FKs genuinely close the cross-tenant
  hole (other-user item → 23503, foreign user_id → 42501, non-existent uuid → the
  same 23503, so no existence oracle); the migration is idempotent across two runs
  in one transaction; the FOREACH/format()/execute() policy block parses; the cron
  rewrite drops no table the 019 job purged; `update_updated_at()` touches only
  NEW.updated_at and is correctly absent from the trigger-less join tables.

## Phase 1 implementation review (2026-08-09)

Two rounds over the committed diff (`79f8af1..826a2c4`): 5 lenses (resolver dates/TZ,
suppression completeness, external contracts, state/data-loss, UI + e2e validity)
raising 27 raw findings, then adversarial refutation. **Round 1 refuted half of what
it verified** — invented victims, misread files, findings that were pre-existing
behaviour — which is the argument for the verify stage, not against it. It is also the
argument against a tight per-lens verification cap: four themes with 3–4 lens agreement
fell outside round 1's top-2-per-lens budget and all four survived round 2. Cross-lens
convergence is a better triage signal than any single lens's severity guess.

Fixed here (`this commit`), all confirmed by an independent trace:

- **"Pause until today" was selectable and silently did nothing.** Found by ALL FIVE
  lenses. react-day-picker v9's `{before: d}` disables only strictly-earlier days, so
  today survived `disabled={{ before: new Date() }}` — and today is exactly the date
  the exclusive upper bound turns into a no-op: the row took a `pausedAt`, the action
  log took a "Pause" entry, and nothing hid. The comment above that line claimed the
  guard existed so it could not "allow a resume date already in the past"; it blocked
  the past and missed the boundary. Bound is now `addDays(new Date(), 1)`.
- **The same picker stored the PREVIOUS day across a timezone gap.** It converted the
  picked day with `toDateStr(date, activationTz)`, but react-day-picker hands `onSelect`
  a browser-LOCAL-midnight `Date`; re-reading that instant in the stored zone shifts it
  whenever the browser is east of the stored zone. Not a narrow race: `use-timezone-sync`
  PATCHes the server only and never writes the store, so a travelling user runs a whole
  session on the stale zone. A picked day is a wall-calendar choice, not an instant —
  now `format(date, 'yyyy-MM-dd')`, the idiom this same file already uses for `startDate`.
- **`ai-context.ts` resolved the day and the interval in different zones.** `todayStr`
  came from date-fns `format` (runtime zone) while `isOpenLoopSuppressedOn` resolved
  `pausedAt` in the user's — so on the pause-start day Beacon answered differently from
  the grid beside it. Now `toDateStr(today, tz)`, with `tz` hoisted above it.
- **`/item/[id]` had no activation state** — the one surface-checklist row Phase 1
  missed. The page renders its own read-only header, so a paused item deep-linked from
  search asserted a startDate and a bucket while appearing on no grid column, with
  nothing explaining why. The dialog's note lives in ItemDialog's body, which the page
  mounts only behind its Edit button.
- **The palette's eligibility memo was keyed on (items, dateStr)** — correct for every
  predicate that existed before, because they were all pure functions of that pair.
  `isPausedNow` is the first that reads wall-clock `new Date()` (pausing is dateless),
  so an app left open overnight kept offering "Resume" for an expired pause. Key now
  carries today.
- **Three defects in `pause.spec.ts`, which had never been executed.** The past-due tray
  renders a THIRD row shape (`morning-row-<id>`, no `data-item-id`) that
  `itemCardIn` can never match; `runCommand`'s `arg` option addresses only FLATTENED
  ENUM rows, so it cannot reach an entity command at all (two interactions, and the
  picker rows carried no addressable attribute — added, plus a `runEntityCommand`
  helper); and pausing the only overdue fixture UNMOUNTS the whole bar, so the test's
  second click had no element — an anchor fixture now keeps the bar alive and doubles
  as proof the tray really opened.

Not fixed, deliberately:

- **The collapse button.** `310e762` dropped `hideCollapse` and the ChevronsLeft button
  from the braindump with a comment pointing at a resize sash that exists only in the
  uncommitted working tree — real scope leakage from a Phase 1 commit into concurrent
  sidebar work. Verified the working tree already restores the affordance on the sash
  and drops the dead prop, so it resolves when that work lands. Left alone rather than
  committing someone else's in-flight files.

Refuted, and worth recording so they are not re-raised: an unvalidated `X-Timezone`
header 500ing the context route (the OpenClaw plugin never sends it); the past-due tray
mutating paused rows (two lenses, both misreading which surface renders where); the
Paused section writing to the wrong date (two of three evidence items factually wrong);
pausing offering no undo (it calls `setNextActionLabel` and IS undoable — the missing
toast is a consistency question, and decision 10's Paused section is the discoverability
answer); and the entity picker lacking a paused annotation (the picker filters by the
command's own eligibility predicate, so the annotation would be redundant in one picker
and never render in the other).
