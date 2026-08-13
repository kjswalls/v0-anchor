# Display Menu Plan — one filter/sort/group surface for the braindump and the canvas

**Goal:** Replace the two duplicated filter popovers with one **Display** menu per surface
(Grouping · Ordering · Filter · Show), built on a real Radix `DropdownMenu`; fix the three
copies of the habits-vanish bug underneath them; expose grouping (which exists in the store
but has no UI) and ordering (which does not exist at all) on every surface that can honour
them.

**Status (2026-08-12):** Phases 0–5b and Step 6's A + A′ shipped on
`feat/display-menu-impl`, each followed by an adversarial review. Phase B (`container_id`)
is what remains, and it is the one phase that needs the database.

Full spec, with the menu and the schedule lanes rendered at true size in Anchor's own
tokens: <https://claude.ai/code/artifact/2de4b068-d090-4f72-9ff4-2109c0e8a848>

---

## What is actually wrong today

Anchor answers "what am I looking at" in four unrelated places — a type dropdown, a filter
popover, a group-by reachable only from the command palette, and a sort that does not
exist. Verified against `a1c03c2`:

1. **Habits vanish.** `day-items.ts:102-104`, `braindump.tsx:404-406` and `search.ts:105`
   each set the habit list to `[]` the moment a priority or project filter is active.
   Habits carry neither field, so the filter silently means "and also hide all habits".
   The comment at `day-items.ts:99-101` states it as intended. **No test covers it**, so
   nothing breaks when it goes.
2. **Tasks vanish too.** `day-items.ts:82-85` rejects any item whose priority is *unset* —
   and priority is usually unset.
3. **Two popovers, one body.** `braindump.tsx:31-177` and `primitives/filter-popover.tsx`
   are the same markup. One concept has four type declarations, two of which disagree
   (`priorities: string[]` vs `Priority[]`).
4. **`persist` has no `merge`.** `view-store.ts:207-216` declares only `name` and
   `version`. Zustand's default merge is shallow, so a persisted payload replaces the
   nested filter objects **wholesale** — adding a field yields `undefined` in production.
   **The e2e suite cannot catch this**: `tests/e2e/helpers/session.ts:114-130` seeds a blob
   that omits both filter objects, so every spec rehydrates fresh defaults and stays green.
5. **`created_at` never reaches the client.** `ItemRow` (`db.ts:27-65`) declares neither it
   nor `updated_at`; `fetchItems` orders by it and the mapper drops it. So "recently added"
   is not sortable without data work — and `TASK_FIELDS` feeds undo's diff, so a new field
   must be kept out of the update allowlists (`ProgramSchema.updatedAt` is the precedent).
6. **There is no drag-to-reorder.** No `useSortable`/`SortableContext`/`arrayMove` anywhere;
   `reorderTasks` has a declaration (`planner-store.ts:167`), an implementation (`:1356`)
   and **zero call sites**. `items."order"` is written once at creation. So no sort
   conflicts with any gesture. What drag *does* depend on is time order — see decision 4.

---

## Locked design decisions

1. **The pass-through rule.** A predicate on field *F* may only exclude items of a type that
   *carries* F. Types where `getItemTypeConfig(name).fields.includes(F)` is false pass
   through untouched. `fields` is `Object.keys(taskShape)`/`Object.keys(habitShape)`, so it
   cannot drift from the schemas, and ItemDialog already interrogates it this way. Its
   companion: an item that carries the field with the value **unset** belongs in an explicit
   "None" value, not in oblivion — `buildListGroups` already mints those buckets for
   *grouping*; the filter path never learned about them.
2. **Container is one axis, not two.** Resolved per item through `containerKind`: task-like
   items answer with their project, habits with their group. Habits are not container-less;
   they were never asked. Values are stored **prefixed** (`project:Work`, `group:health`) so
   a project and a habit group sharing a name cannot collide. `itemFromRow` maps
   `group: row.group ?? ''` (`db.ts:108`), so **No group** is a real reachable value.
3. **Ordering is applied post-derivation**, in `day-list` / `week-list` / `braindump` only —
   never inside `deriveDayItems`, which is shared by all six canvas surfaces and whose
   comparator two of them depend on.
4. **Grouping may label the timed zone; it may never partition or reorder it.**
   `inferDropTime` (`lib/dnd/infer-drop-time.ts:42-69`) resolves a drop as "30 minutes
   before/after *that item's* time", not as a slot index. "The gap above row X" only means
   "just before X" while the row above it is earlier in the day. So in a bucket's timed zone
   DOM order is `startTime` order, always.
5. **Schedule grouping is lanes in Day, focus/recede in Week.** Lanes **nest inside** overlap
   resolution rather than replacing it — `placeSiblings(sibs, area: Band, depth)`
   (`schedule-overlap.ts:461`) already derives its channel budget from `area`, with only two
   hardcoded roots. Week gets focus because at every derived default a week column is
   arithmetically *exactly one* 140px channel; there is nothing to divide. **Lanes ship
   read-only on x — drops stay time-only** (see the deferred list).
6. **"Hide finished" hangs off the Display toggle, not `showCompletedTasks`.** That global's
   manifest entry promises "Tasks only — habits always stay", and skips are overwhelmingly a
   habit gesture. It hides completed-on-date, `doneStatus`, and **skipped** occurrences. It
   deliberately does **not** hide `cancelled` — nothing else would bring those back.
7. **One canvas filter set shared by all six canvas surfaces; the braindump keeps its own.**
   Each surface renders only the axes it can honour and ignores the rest. Strictly better
   than today, where the palette offers five group-by values that do nothing in four of six
   views.
8. **`version` stays 1.** `view-store.ts:208-213` forbids a bump, and
   `tests/e2e/helpers/session.ts` seeds a literal `version: 1` blob. A custom `merge` is
   independent of `version`, so it needs no bump.
9. **Containers get a capability registry, but not yet and not all of them.**
   `role: 'classify' | 'gate'` over the *existing five tables*; projects + habit groups
   classify, routines + programs gate, `item_types` stays out. The seam is enforced by code:
   `ActivationContext` takes only routines and programs, `ScopeKind` is only those two.
   Custom container kinds are **not v1**. See `organize-console.md` — its Phase 0 and this
   plan's Phase B are the **same migration**; schedule it once.

---

## Deliberately not offered

| Option | Why |
|---|---|
| Routine / program filters | The scope rail already does the durable version, per-date, through the DB, with a resume date. Program membership resolves disjunctively through routines, so a checkbox would misrepresent it. |
| Overdue | On the canvas an overdue item is by definition not on the day you are looking at. The past-due bar owns it. |
| Duration, assignee, aiStatus, has-notes, has-subtasks | Near-always empty. A permanently blank control is worse than none. |
| Sort by recently-added | `created_at` does not reach the client (see problem 5). |
| Group by status | Done in 5a: the union member is gone, and a stale value is coerced at BOTH doors — `view-store`'s persist `merge` and `adoptLegacyViewPrefs`. `planner-storage` partializes `groupBy`, so the legacy mirror is a second live source, not a theoretical one. |
| Saved views / presets | Correct end state, premature — there is not yet one honest filter menu to save from. |
| An "Other" lane past the lane budget | A lane naming groups it cannot spatially distinguish is a channel that lies. Overflow groups stay in the cap row, reachable by focus. |

---

## Phase ledger

| Phase | Content | Size | Status |
|---|---|---|---|
| **Step 1** | `containerKind: 'projects'` on the custom template + the two sweeps that tested `type === 'task'` | <1 h | **shipped** `a81018a` |
| **0** | One `ViewFilters`; custom `merge`; legacy read-time normalizer; `Priority[]` convergence | ~½ d | **shipped** `dba554f` + `cb82e05` |
| **1** | `lib/filters.ts` — the pass-through rule; delete all three habits-wipes; explicit None values; project-block rules | ~1.5 d | **shipped** `0d36efc` + `adf944d` |
| **2** | Fold `week-schedule.tsx:325-361` (a verbatim copy of `use-day-items.ts:34-63`) into the hook | ~½ d | **shipped** — `useDayItemsForDates` |
| **3** | `components/primitives/display-menu.tsx`; delete `filter-popover.tsx`; mount on canvas, sidebar **and mobile header** | ~3 d | **shipped** — Ordering deferred to 4 |
| **4** | `lib/sort-rows.ts`, applied post-derivation on the three list surfaces; repair the degenerate habit comparator (`day-items.ts:121` returns 0 whenever either `startTime` is missing) | ~1 d | **shipped** |
| **5a** | Extract `buildListGroups` into a pure `lib/grouping.ts`; grouping in Day×Buckets, Week×Buckets, Week×List and both Schedules' Anytime strips | ~6 d | **shipped** |
| **5b** | Schedule lanes + Week focus/recede | ~5 d | **shipped** |

**Carried into 5b from the 5a review and done:** the strip's own "Anytime" heading now
gives way to the group headings rather than sitting above them, so grouping by Time bucket
no longer renders "Anytime › Anytime".
| **A** | `lib/container-registry.ts` over the existing five tables | ~1 d | **shipped** `dbe2960` |
| **A′** | Case-sensitivity normalization, split out — it changes which colour resolves for an account holding both `Work` and `work` | ~½ d | **shipped** `2fe86a0` |
| **B** | `container_id` + backfill + dual-write + `containerId` into `packages/types` + undo wiring + rename | ~2 d | |

**A shipped four kinds, not five.** `role: 'classify' \| 'gate'` over projects +
habit groups (classify) and routines + programs (gate); `item_types` stays out per
decision 9. The seam is types, not convention: `ClassifyKind` is what a ref can name
and what `containerRefOf` returns, `GateKind` is what `ScopeKind` now *is* (aliased,
not re-declared).

**A′ turned out to be mostly a STORE phase, not a data phase.** Normalizing stored
data is a migration and belongs to B. What A′ fixed was the app-side inconsistency:
three lookups folded by hand while the two verbs that *repair* references compared
exactly, so `removeHabitGroup` left a habit stored as `personal` pointing at a
deleted `Personal`. It also took `GroupSection`'s glyph off the label — see the
gotcha below.

Phases 0–2 are pure correctness and are worth landing even if the redesign stops.

---

## Gotchas that cost time to find

- **`deriveDayItems` used to read the weekday in the BROWSER's zone and the date in the
  USER's** — fixed in 5a by DELETING the input. Tasks and habits go through
  `shouldShowOnDate(row, dateStr, timezone)`, which is tz-resolved; project blocks went
  through `date.getDay()` / `date.getDate()`, which are not, so when the two zones
  differed a Thursday block rendered on Wednesday. `DayItemsInput` no longer carries a
  `Date` at all — `calendarParts(dateStr)` builds the weekday, the month-day and the
  month's length through `Date.UTC`, so the disagreement is unrepresentable rather than
  merely corrected. Note what that costs: the fix is **structural, not pinned by a
  red-then-green mutation**, because there is no longer an API through which to reproduce
  the bug. `tests/unit/day-items.test.ts` pins the resolution itself instead, and those
  cases would have passed before the fix given a Date that agreed with its dateStr.
- **That also dissolved the `getTime()` memo key question.** `use-day-items` keyed on the
  exact instant because two instants could share a `dateStr` and disagree on `getDay()`.
  With the Date gone the mapping is total, so the key is the resolved `dateStr` list —
  provably the derivation's whole input. The gotcha that said this needed a
  zone-divergence test is retired: there is nothing left to diverge.
- **The mobile shell renders `MobileHeader` above every `activeTab` guard**
  (`mobile-shell.tsx:55`), so anything mounted there rides all three tabs. Gate on
  `useMobileNavStore(s => s.activeTab)`, not on the header's own existence.
- **Mobile never reads `view.scope`.** `MobileViewRouter` dispatches on `layout` alone and
  hardcodes `data-view-scope="day"` (`mobile-view-router.tsx:34`); `commands/registry.ts`
  hides both scope commands there for the same reason. But `scope` PERSISTS across the
  768px breakpoint, and `useIsMobile` is a live `matchMedia` listener — a narrowed window,
  a snapped half-screen or a rotated tablet all reach the phone shell carrying whatever
  scope was last set. Any mobile surface deriving behaviour from `scope` must state its
  own instead, or it answers for a view nobody is looking at, with nothing on that surface
  able to correct it.
- **Nothing clears `canvasGroupBy` on a scope or layout change** (`view-store.ts:154-167`).
  So a control that HIDES itself when the current view cannot honour grouping strands the
  clause: the trigger keeps counting it with no row to account for it. Unhonoured values
  stay visible and disabled with the reason on the rail — the same grammar Buckets already
  uses. Phase 4's Ordering is the second axis with this shape; use the same rule.
- **Don't derive an ARIA role from close-behaviour.** `ValueRow` mapped
  `keepOpen ? menuitemcheckbox : menuitemradio`, which made the "Switch to List" ACTION a
  sixth unselected radio among five real grouping values — in the default view, so it is
  what a first-run screen-reader user hears. Action rows take `role="menuitem"` explicitly.
- **A props-level test passes while the MOUNT is wrong.** Both mobile defects above lived
  in `mobile-header.tsx`, not in `DisplayMenu`, and every component test stayed green.
  `tests/unit/display-menu.test.tsx` now renders `MobileHeader` itself; it needs
  `next/navigation` and `@/lib/supabase` (with an `auth` object) mocked to do so.
- **Grouping and Ordering are independent axes, and grouping owns the outer order.**
  `day-list.tsx` sorts WITHIN each group, after `buildListGroups`. Because `sortRows(rows,
  'default')` returns the same array, routine grouping keeps `routine_items.sort_order` —
  the only place that sequence is visible outside the manager — until the user picks an
  ordering, which then wins.
- **`sortRows` returns its input array unchanged for `'default'`.** The derivation's own
  order IS the default, so there is nothing to do. Callers must not mutate the result.
- **Group FIRST, then sort within each group — on every surface.** The braindump shipped
  the other way round for one commit, and the failure is instructive: its grouping map is
  filled by walking the row list, so `[...groups.entries()]` returns whichever group owned
  the first row. Sorting the flat list first made the SECTION HEADINGS reorder while the
  rows inside each stayed correct. `lib/grouping.ts` takes unsorted rows and returns them
  in arrival order; every caller applies `sortRows` per group afterwards.
- **`'none'` is one unlabelled section, not a per-view default.** Day × List's
  HABITS / TASKS / PROJECTS and a bucket card's HABITS / TASKS are presentation choices
  for those views, so they stay local (`defaultListGroups`, `defaultBucketGroups`) — the
  shared core would otherwise have to know which surface was asking. Callers that render
  `g.label ? <GroupSection> : flat` get the flat default for free; the two that want
  something richer branch on `groupBy === 'none'` BEFORE calling, or they render a
  section with an empty heading.
- **Grouping resolves the container axis through the registry, so habits section by their
  own group.** `buildListGroups` hoisted every habit into one "Habits" section and grouped
  only the tasks, which made "group by Project" answer a question about tasks and then
  file the rest of the day under its own type name. Priority lost the same hoist: a type
  that does not carry the field lands in "No priority" beside everything else that has
  none, which is the call `sortRows` already made. Section keys are the PREFIXED refs, so
  a project and a habit group sharing a name stay two sections — the seeds collide, so
  that is the shipped state of a fresh account. Unset is kind-tagged (`none:project` /
  `none:group`) rather than reusing the filter's single `NO_CONTAINER`: the filter needs
  one checkbox catching both sides, a heading has room to say which side it is.
- **Habits carry no `order`.** `habitShape` omits it (`packages/types/src/schemas.ts:206`),
  `itemFromRow`'s habit branch never reads it, `reorderTasks` early-returns on
  `type !== 'task'`, and the registry says `orderable: false`
  (`item-registry.ts:319`). So `byTimeThenOrder`'s `order` tail is inert for habits —
  two untimed habits compare equal and hold their load order (`ORDER BY "order",
  created_at`). Do not write a test that supplies `order` on a habit fixture through a
  cast: it asserts behaviour production cannot reach, and it typechecks only because of
  the cast.
- **Re-run `tsc` AFTER adding test files, not just after touching source.** Four errors
  shipped in Phase 4 because the typecheck ran before the new test file existed and never
  again. `pnpm test` does not typecheck, and neither CI nor the Vercel build gates on it
  (`next.config.mjs` sets `ignoreBuildErrors`).
- **`view.clearFilters` in the palette and Reset display now differ.** Reset clears the
  filters, the grouping AND the type filter; the palette command clears `canvasFilters`
  only, which its own label ("Clear canvas filters") states honestly. Phase 6 owns parity —
  when it lands, both should route through one function.
- **`@testing-library/user-event` is not a dependency.** Component tests use `fireEvent`.
  Radix's `DropdownMenuTrigger` opens on **pointerdown**, not click, so `fireEvent.click` on
  a trigger leaves the menu shut and every query beneath it fails for the wrong reason. Sub
  triggers and items do respond to click. jsdom also needs `PointerEvent`,
  `hasPointerCapture`, `scrollIntoView` and `ResizeObserver` shimmed — see the top of
  `tests/unit/display-menu.test.tsx`, which carries them locally rather than editing the
  shared `tests/unit/setup.ts`.
- **A test named for a guard must assert a field that guard can write.** `removeProject`
  has one `set()` and writes exactly `projects` and `project: undefined`. A case titled
  "leaves a habit alone" that asserted `group` was true under every implementation,
  including one with the guard deleted — `group` belongs to `removeHabitGroup`. Before
  writing an assertion, name the write the verb actually performs.
- **"Blocked" was the wrong shape for grouping; support has THREE states.** 5a made
  "partly honoured" the common case — Buckets groups its untimed rows, Schedule its
  Anytime strip — so `groupByBlockedBy(): string | null` became
  `groupBySupport(): { honoured, note }`. A partly-honoured value stays ENABLED with the
  part it reaches on its rail; disabling it would say it does nothing. Exactly one
  combination is inert now (Time bucket on Buckets, where the view already IS that
  partition), and the "Switch to List" escape row renders only while the current value is
  inert — it used to ride every non-List layout, resolving nothing.
- **A test asserting the TAIL of a list survives a mutation that DUPLICATES rows.** The
  first version of "leaves the timed spine ungrouped" checked `slice(-3)` and stayed green
  when the timed rows were handed to the grouping pass, because that renders them inside
  the groups AND leaves the spine below intact. Assert the whole sequence: six rows, this
  order, once each.
- **Time bucket gets NO answer on Schedule — not lanes, not focus.** y already is the
  bucket, and `autoCorrectBucket` (`planner-store.ts:596-602`) forces a timed item's bucket
  to match its `startTime`, so bucket lanes are mutually exclusive on y *by construction*:
  a literal staircase with two thirds of the field dead at every height. 5b shipped
  dividing by it for one commit — the rule was written in `view-options.ts` and implemented
  nowhere, and `planLanes` never saw the value. A rule stated in a comment is not a rule.
- **A raw arbitrary shadow and a var-shaped one land in DIFFERENT tailwind-merge groups.**
  `cn('shadow-[var(--sched-shadow)]', 'shadow-[0_0_0_1px_var(--x)]')` emits BOTH — verified
  by calling `twMerge` directly — and Tailwind then orders same-utility candidates by string
  compare, so `'0'` sorts before `'v'` and the base wins. The receded hairline never
  painted, in either theme, while the token had exactly one consumer and looked wired. Wrap
  every composite shadow in its own `--sched-shadow-*` token so the two collide in one
  group. `--sched-shadow-done` worked only because it was already var-shaped.
- **A sticky box is constrained to its CONTAINING BLOCK — including the cap row.** The
  week's cap row spent a commit in an 18px wrapper of its own: zero travel, on the one
  variant that is *always* focus and where the caps are the only way to clear one. It is
  the same rule `week-schedule.tsx` spells out for the pinned hour gutter. It also needs
  `LANE_CAP_Z` (22) — above `WEEK_GUTTER_Z`, or the gutter's opaque background slides over
  the captions on the first scroll.
- **A wrapper that pads unconditionally around a component that renders `null`** moves the
  whole view. `LaneCapRow` returns null when nothing is grouped; its `pt-6` did not.
- **`preview` invalidates a block's EXTENTS, not its lane.** `const L = preview ? undefined
  : layout` predates lanes and was right then. Once every block carries a band, dropping
  the layout on pointer-down threw the block to the field's left edge across every lane
  until pointer-up. `bandOnly()` keeps the x half and clears what the new extents stale.
- **Lanes are one `layoutOverlaps` call PER LANE, not one call with lanes in it.** That is
  semantics, not tuning: two blocks in different lanes may share a time but never a column,
  so they must not cluster, column-pack or occlude each other. `LayoutOptions.root` supplies
  the lane's band and every existing rule then runs against the lane's width. Passing a root
  changes one other thing deliberately — **every** entry gets a layout, including
  un-overlapped ones, because the ABSENCE of a layout means "the whole field" to the
  renderer, which is exactly the wrong default once a block belongs to a lane.
- **`isReceded` must return false for a row the plan never saw.** The obvious
  `laneKeyOf(...) !== active` gives the opposite, and did — caught on the first test run,
  against a docstring three lines above asserting the safe behaviour. The failure modes are
  not symmetric: a stray at full strength stands out; a receded stray is work greyed out
  for a reason nothing on screen can explain.
- **Focus is resolved against the current plan, never cleared on a group-by change.** A
  key held in a store that knows nothing about grouping outlives the lanes that named it.
  Resolving makes it stop applying; clearing it would need a cross-store hook on every
  writer of `canvasGroupBy` and would still miss a rehydrate.
- **A ref written during render is a lint error** (`Cannot access refs during render`), so
  `useFieldWidth`'s freeze holds the EXPOSED value in state instead. Gating the observer on
  a `freeze` dep is not the alternative: it tears down and re-attaches, which fires an
  immediate measurement — the one thing the freeze exists to prevent.
- **A render test can pass because of a missing input rather than the rule it names.**
  `WeekSchedule` passes no `fieldWidth` at all, so its "never divides" case stayed green
  with the `variant === 'day'` rule deleted. The rule is pinned in the pure test, which
  hands week an explicit width; the render test now says plainly what it does and does not
  cover.
- **Deleting a RULE can hollow out a test that used to guard it.** The two cases pinning
  the phone's `scope` prop were real red-green guards while `groupByBlockedBy` answered
  'Day only' for every value on week. 5a deleted that rule, and since both cases seeded
  `layout: 'list'` — the one layout whose answer does not vary by scope — they went on
  passing with the prop ignored entirely. Every previous tautology in this project was one
  I wrote badly; this one I wrote well and then broke from the other end. When a phase
  changes a predicate, re-run the tests that name it **with the predicate stubbed**, not
  just green.
- **`BucketCard`'s own collapse toggle carries `aria-expanded` too.** A
  `button[aria-expanded]` sweep for section headings inside a bucket picks it up first —
  filter on `group/heading`, which is `GroupSection`'s own class, rather than slicing the
  first result off.
- **`toDateStr` builds an uncached `Intl.DateTimeFormat` per call** (`recurrence.ts:47-49`,
  ~50µs against ~0.05µs for `getTime()`). Week × Buckets mounts 28 cells that each call
  `useDayItems`, and dnd-kit re-renders every droppable on each collision-target change
  with the planner deps untouched — so resolving dates in a render body costs ~1.3ms on
  every one of those. `use-day-items` memoizes the resolution on the INSTANT key, which is
  strictly finer than the dateStr key it feeds and so cannot serve a stale string.
- **Habit-group refs case-fold; project refs do not — and grouping has to agree.**
  `sameContainer` (`filters.ts:149`), `getHabitGroupColor` and `GroupSection`'s glyph
  lookup all fold `group:` refs, because `makeAddDraft` writes a lowercase 'personal'
  against DEFAULT_HABIT_GROUPS' 'Personal' whenever the groups list has not loaded yet.
  `lib/grouping.ts` keyed on the raw ref for one commit, which split one habit group into
  two sections that the menu's single checkbox selects together. Phase A′ still owns the
  general normalization; this is only the grouping key.
- **Day × Buckets groups its untimed rows; Week × Buckets groups the whole cell.** Not an
  oversight — the day card has `scheduled:{bucket}:before|after:{type}:{id}` drop zones
  between its timed rows and `inferDropTime` reads the neighbours' times, so that spine
  cannot be partitioned. A week cell has ONE droppable (`week:{date}:{bucket}`) and
  renders every habit before every task, so it was never in one time order for a
  partition to disturb. `groupBySupport` encodes the asymmetry: 'Untimed rows only' on
  day, no note on week.
- **`lib/item-container.ts` was planned and not written.** The artifact's 5a sketch had a
  ~30-line module for container resolution, but `lib/filters.ts` already owns
  `containerRefOf` / `containerName` / `containerKindOf` — the same question, answered
  through the same registry field, for the filter path. A second module would have been a
  second answer to drift from. `lib/grouping.ts` calls the existing one; only the
  unset-label split (which SIDE of the axis is empty) is new, and it lives with the
  grouping that needs it.
- **Don't `git checkout --` a file you haven't staged.** The Phase 2 hook is a new
  function in an existing file; reverting a mutation-test edit that way restored HEAD's
  version and silently discarded the work. Copy to the scratchpad first, or stage before
  mutating.

- **A label is not an identity, and `GroupSection` treated it as one.** It matched the
  heading TEXT against projects first and habit groups second, so a project named
  "Morning" put its icon on the Time bucket › Morning heading, and (once the braindump
  carries habits) a habit group would borrow a same-named project's icon — the seeds
  disagree on two of three: 🧘/💚 Wellness, 🏠/⭐ Personal. It takes `groupKey`
  (`RowGroup.key`, which carries the namespace) now. **Why it went unnoticed:** a stored
  EMOJI is not an icon token, so `resolveCategoryIcon` falls through to the name-derived
  icon either way — only a *picked* `icon:Anchor` ever reached the wrong heading. Any
  test of this has to pick an icon explicitly or it asserts nothing.
- **A fold applied on BOTH sides needs a fixture that differs on both.**
  `cleanupOrphanedReferences` folds building its set of live names and folds again
  asking about the item. A habit stored `personal` against a group stored `Personal`
  catches an unfolded SET and leaves an unfolded LOOKUP green — `'personal'` already
  equals its own folded form. Both spellings, always. Caught by its own mutation run,
  not by review; this is the sixth distinct shape of tautological test in this project.
- **`sameContainerName(kind, …)` is the store's API; `foldRef` is the ref path's.** They
  are the same policy (`foldRef` is built from `foldContainerName`) because the store
  holds BARE NAMES — `items.group` is `'personal'`, `habitGroups[i].name` is
  `'Personal'` — and nine identity lookups in `planner-store.ts` compare those directly.
  A ref-only API would have left every one of them spelling its own comparison.
- **View-layer project filters were deliberately left exact.** `week-buckets.tsx:120`,
  `project-block.tsx:143`, `day-schedule.tsx:232`, `day-buckets.tsx:221` and
  `app-shell.tsx:321` all compare `t.project === project.name`. Projects do not fold, so
  routing them through the registry is churn with no behaviour delta — but if
  `project.caseFold` ever flips, these five are the sites that will NOT follow.
- **`containerId` must enter `taskShape` AND `habitShape`** in `packages/types` before Phase
  B, or undo silently reverts a container change. `diffItem` (`planner-store.ts:576-584`)
  iterates `getItemTypeConfig(...).fields` = `Object.keys(taskShape)`, so a field outside
  the shape never enters an undo patch: undo sends the *label* back and leaves
  `container_id` on the new container. UI shows success; next reload shows the revert.
  Additive-optional is safe — the `parentItemId`/`assignee`/`aiStatus` precedent — but
  CLAUDE.md makes the committed `dist/` a CI gate, so it must be planned.
- **No migration creates `projects` or `habit_groups`.** Thirteen tables are created across
  `supabase/migrations/`; neither of those is among them. They exist only in the stale
  `supabase/schema.sql`. Any SQL touching them needs `to_regclass` guards — the SQL mirror
  of the `unavailable()` pattern migration 024 uses app-side. Worth checking separately how
  `.env.test` and any fresh Supabase project get provisioned.
- **Undoing a rename is O(N) unbatched PATCHes.** `planner-store.ts:2274-2299` runs one
  `dbUpdateItem` per restored item with no batching.
- **`ScrollArea` silently drops `max-h`** — every scroll box in the menu is plain
  `overflow-y-auto`.
- **Do not use `DropdownMenuCheckboxItem`/`RadioItem`.** Both render their indicator on the
  left (`pl-8`, `absolute left-2`) against a trailing-check house grammar. Use plain items
  with `role="menuitemcheckbox"` and explicit `aria-checked`, as `CollectRow` does.
- **`shadow-[var(--shadow-elev-md)]`, never `shadow-md`.** Tailwind inlines theme shadows
  into `--tw-shadow` and never sees the `.dark` re-tune; `components/ui/tooltip.tsx` already
  fixed this for itself and documents why.
- **`header-capsule.tsx:75`** renders the selected check as `text-primary-foreground` — that
  is `--lime-ink`, dark-green ink meant to sit *on* a lime fill. Nearly invisible on the dark
  popover. Becomes `text-foreground`.
- **Lime budget: exactly one mark per surface**, the trigger dot, and it has **no
  transition** — `transition-opacity` on the wrapper would fade lime, which is forbidden.
- **Recession must be subtractive, never a wrapper `opacity`.** `day-schedule.tsx:922-926`
  already refused that once: three lime things live inside a block's wrapper. And
  `--grp-off-pane` needs its own value — aliasing it to the done token makes every receded
  *incomplete* block read as finished.

---

## Deferred, with the reasoning recorded so v2 does not re-derive it

- **Cross-lane drop assignment.** `closestCenter` compares the dragged element's rect centre,
  not the cursor (`CONTRACT.md:117-120`), against a 192px ghost aimed at a ~161px lane — a
  systematic one-lane error. Pointer-x is the right v2 mechanism, but `TouchSensor` is
  registered alongside `PointerSensor` and a `TouchEvent` has no `clientX`, so a naive
  implementation lands **every touch drop in lane 0**. And a gesture writing two fields at
  once is a data-loss class this app does not have. **If a reorder gesture ever ships, it
  arms only under `Ordering: Default`** — never auto-switch the sort on drop.
- **Routine lanes are never assignable, in any version.** Membership is many-to-many and the
  grouping branch is first-claim-wins (`day-list.tsx:105-131`), so x cannot express
  insert-into-B vs move-to-B. Routine is focus-only on the schedule.
- **A Type filter in the braindump.** Its corpus is single-type today; grouping by Type
  answers "what is in here" at that size. Revisit when habit drafts land.
- **Habit drafts in the braindump.** The branch at `braindump.tsx:405-419` is **kept**, not
  deleted, because drafts are intended to live there — but a draft habit cannot satisfy its
  own type's invariants (`group` is non-optional on the wire, `containerRequired: true`), so
  it needs its own pass: is a draft a real row in an unpromoted state or a distinct shape,
  what is the promotion gesture, and should the frozen `habits[]` projection see drafts at
  all (today it would — the projection is `delete type` over every non-custom item).

---

## Related

`unified-items.md` (the registry this extends), `organize-console.md` (shares Phase B),
`overlap-blocks.md` (the pass lanes nest into), `programs-routines.md` (the scope rail that
owns durable hiding).
