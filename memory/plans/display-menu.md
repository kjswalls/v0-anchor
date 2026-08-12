# Display Menu Plan — one filter/sort/group surface for the braindump and the canvas

**Goal:** Replace the two duplicated filter popovers with one **Display** menu per surface
(Grouping · Ordering · Filter · Show), built on a real Radix `DropdownMenu`; fix the three
copies of the habits-vanish bug underneath them; expose grouping (which exists in the store
but has no UI) and ordering (which does not exist at all) on every surface that can honour
them.

**Status (2026-08-11):** Design pass complete and approved. Step 1 shipped (`a81018a` —
the custom-type `containerKind` unblock). Building on `feat/display-menu`.

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
| Group by status | `'status'` is a legal `GroupBy` with no branch, already excluded from the palette. The two vocabularies are frozen external contracts. **Delete the union member**, and coerce a stale persisted value at `adoptLegacyViewPrefs` (`view-store.ts:247`). |
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
| **3** | `components/primitives/display-menu.tsx`; delete `filter-popover.tsx`; mount on canvas, sidebar **and mobile header** | ~3 d | |
| **4** | `lib/sort-rows.ts`, applied post-derivation on the three list surfaces; repair the degenerate habit comparator (`day-items.ts:121` returns 0 whenever either `startTime` is missing) | ~1 d | |
| **5a** | Extract `buildListGroups` into a pure `lib/grouping.ts`; grouping in Day×Buckets, Week×Buckets, Week×List and the Schedule's Anytime strip | ~6 d | |
| **5b** | Schedule lanes + Week focus/recede | ~5 d | |
| **A** | `lib/container-registry.ts` over the existing five tables | ~1 d | |
| **A′** | Case-sensitivity normalization, split out — it changes which colour resolves for an account holding both `Work` and `work` | ~½ d | |
| **B** | `container_id` + backfill + dual-write + `containerId` into `packages/types` + undo wiring + rename | ~2 d | |

Phases 0–2 are pure correctness and are worth landing even if the redesign stops.

---

## Gotchas that cost time to find

- **`deriveDayItems` reads the weekday in the BROWSER's zone and the date in the USER's.**
  Tasks and habits go through `shouldShowOnDate(row, dateStr, timezone)`, which is
  tz-resolved. Project blocks go through `date.getDay()` / `date.getDate()`
  (`day-items.ts:161-162`), which are not. When the two zones differ the same column can
  be Thursday for a task and Wednesday for a block, so a Thursday block renders on
  Wednesday. Found while folding Phase 2; **not fixed** — it predates the fold, is
  identical on both sides of it, and changing it changes what renders for anyone whose
  browser zone differs from their setting. It matters for Phase 4 (sort by date) and 5a
  (group by day), so fix it there or before, with its own tests. The fix is to build the
  weekday from `dateStr` rather than from the `Date`.
- **Don't `git checkout --` a file you haven't staged.** The Phase 2 hook is a new
  function in an existing file; reverting a mutation-test edit that way restored HEAD's
  version and silently discarded the work. Copy to the scratchpad first, or stage before
  mutating.

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
