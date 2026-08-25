# Overlapping schedule blocks — "Pocket & Channel"

Direction chosen 2026-07-29. Design study (seven live specimens, both themes, one
shared geometry control): https://claude.ai/code/artifact/1174ffd2-d299-44d4-8c8f-58401a7859b8

Six directions were generated against distinct lenses, each hardened by an adversarial
critique, then judged twice on opposing rubrics (elegance-and-fidelity vs.
usefulness-at-worst-geometry). **Pocket & Channel won both independently** (84 / 82).
Far Rail was named the bold alternative by both; Lit Ledge contributed the reframing
that justifies the whole thing — *the pane is a label nudged off true time while the
rail keeps the minutes, so overlap is a label-collision problem.*

## The bug it fixes

`ScheduleBlock` was `absolute left-0 right-1` with no overlap pass, so DOM order was
paint order. A 7h block containing a 3h one lost its lower 3/7 **and** its title, which
was centred over the whole pane and therefore landed under the covering plate.

The worst instance was never visible in a screenshot: every task inside a recurring
project block takes the *project's* startTime and duration (third branch of
`deriveTimedEntries`), so a block holding four tasks emitted four byte-identical extents
and three of them were **completely invisible**.

## Locked decisions

1. **Three topologies, three silhouettes, each an existing mark transformed.** Nested →
   the rail moves *inward* (pocket + branch tick). Crossing → the rail *duplicates*
   (columns + 4px of visible grid). Double-booked → the rail *thickens* (one shared lane,
   tiled panes, compound bead). No badge, no warning colour, no dotted border — Anchor is
   guilt-free by design and an overlap is not an error.
2. **Two extents, and never mixed up.** Cluster, pack columns and subtract free bands on
   the **painted** extent (a pane floored at `PANE_MIN_H` covers more grid than it owns —
   57 minutes at `hourPx 40`); classify and draw every mark on the **true** extent. Get
   this backwards and two *consecutive* items read as a conflict.
3. **The containment gate is in MINUTES, never pixels.** `useFitHourPx` rescales on every
   window resize; a pixel gate would flip a nested pair into a double-booking as you drag
   the window edge. Rendering may degrade with `hourPx`; topology may not.
4. **Light mode needs a real value step, not alpha.** 94%-opaque over 80%-opaque is
   **0.00003 L** apart on white. Hence `--sched-pocket` (a sunk well, ~0.975 against a
   ~0.999 pane) and a nested child on **solid** `--surface-2`. Every alpha-based depth
   treatment in the study was a dark-mode-only design.
5. **Nothing folds to a titleless rail.** Past the column cap the overflow steps into an
   inset cascade. An item may be compressed; it may never be absent or unlabelled.
6. **Block z stays below 5.** `NowMarker` is `z-[5]` and its lime stub crosses a pane; it
   is only legible because it paints *on top* of the 80% glass, and lime never dims. Base
   z is therefore `2 + depth + cascade` (max 4). Conflict members deliberately share a z —
   their panes tile rather than overlap, and either bead punching a crescent out of the
   other reads the same.
7. **Coverers are "anything that paints above me."** `deriveTimedEntries` sorts on
   `startMin` only and emits habits before tasks, so DOM order disagrees with the pass's
   duration-DESC order. Paint rank is `z * 4096 + domIndex`; a depth test alone is blind
   to a cascade sibling sitting on top.
8. **The content band goes through `--clr-h`, never an inline `height`.** An inline height
   pins the indefinite-height chain week's `canExpand` rides and would kill hover-expand
   for every block in the grid.
9. **A flush shared edge moves the PARENT's handle into its own lane** (20px grabber at
   `left:0`). The rejected alternative trimmed the child 7px, which at `hourPx 40` is a lie
   about ten and a half minutes.
10. **The layout is dropped mid-resize.** It is computed from store extents, and `preview`
    is local state, so it would describe a stale shape for the whole gesture. Same
    reasoning that already suppresses `canExpand`.
11. **The column cap is a prop, not a constant.** `mobile-view-router.tsx` renders
    `DaySchedule` into a ~294px field where 2-up peers are ~141px panes; mobile passes 1.
12. **Absent layout = today's markup, byte for byte.** An entry with no overlap gets no
    layout object and every branch falls back to the literal values — `left-0 right-1`,
    `marginLeft: LANE_PX`, rail at x=5, bead at x=3, content centred in the whole pane.

## Phase ledger

- [x] **Phase 0 — Geometry relocation** (shipped 2026-07-29). `LANE_PX`, `PANE_OFFSET`,
      `PANE_TRIM`, `PANE_MIN_H`, `PANE_TALL_H` moved to `lib/schedule-constants.ts` (the
      pass is pure and must agree with the renderer to the pixel; importing a
      `'use client'` component into `lib/` would be a cycle). `day-schedule.tsx`
      re-exports `LANE_PX`, which `week-schedule` imports.
- [x] **Phase 1 — The pass** (shipped 2026-07-29). `lib/schedule-overlap.ts`:
      `layoutOverlaps()` + `pickContentBand()`. Clustering, containment forest, greedy
      first-fit columns, conflict units, cascade overflow, occlusion-truth pass. 30 unit
      tests in `tests/unit/schedule-overlap.test.ts`.
- [x] **Phase 2 — Tokens** (shipped 2026-07-29). `--sched-wash-field`, `--sched-pocket`,
      `--sched-pocket-lip`, light and dark.
- [x] **Phase 3 — The renderer** (shipped 2026-07-29). Optional `layout` prop on
      `ScheduleBlock`: pockets, branch ticks, pitched rail/bead, solid nested plate, field
      wash, content band, pane-anchored crop marks and handles, lane handles on flush
      edges. 12 component tests in `tests/unit/schedule-block-overlap.test.tsx`.
- [x] **Phase 4 — Wiring** (shipped 2026-07-29). `DaySchedule` (memoised on
      `hourPx`/`gridStartHour`), `WeekScheduleColumn` (memoised per column, not per week —
      seven days are seven grids), `toOverlapEntries()` carrying the project-block key,
      and `maxOverlapCols={1}` from the mobile router.
- [x] **Phase 5 — The channel-width policy** (shipped 2026-07-30). Replaces both column
      caps with one rule: **a channel is never narrower than `MIN_CHANNEL_PX` (140)**.
      - `useFieldWidth()` in `lib/use-fit-hour-px.ts` measures the events layer in a
        layout effect; day passes it as `fieldWidth` and the pass fits as many channels as
        the *area* allows (measured per sibling set, so a nested sub-cluster spends its
        parent's band, not the grid's). Week omits it and never caps.
      - `BlockLayout.widthFraction` is the one number both callers need: day multiplies it
        by the field to get the pane's real width; week divides `MIN_CHANNEL_PX` by it to
        get the column's minimum.
      - **The content treatment is now width-derived, not variant-derived.** `narrow`
        (pane < `PANE_WRAP_PX`, 200) drives the wrapping title, the dropped metadata rail,
        the dropped wash and `canExpand` — so a 140px day channel and a 140px week column
        render identically. The wash's own comment already argued width, not view.
      - **Week's double-booking gap is closed.** Identical extents TILE (the one topology
        with no free band to give) and the column widens; crossing and nesting keep
        shingling.
      - `maxOverlapCols` on `DaySchedule` and the mobile router's `1` are both gone — the
        ~294px mobile field derives two channels on its own.
- [x] **Phase 6 — Looked at, in both themes** (2026-07-30). Day and week, light and dark,
      via a throwaway Playwright harness against the real app and the `anchor-e2e` user
      (seeded all three topologies, screenshotted, swept — no litter left). All three read
      correctly; the week column visibly widens and the grid scrolls. Screenshots are not
      committed. Findings below.
- [x] **Phase 7 — Fixes from browser review + E2E** (shipped 2026-07-30).
      - **The nested child is inset on BOTH edges now** (`NEST_RIGHT_PX = 8`). Flush-right
        was chosen so the two borders would coincide as one hairline; on screen it read as
        the child bursting out of the plate it sits inside, and it left the pocket visible
        only as a strip under the child's lane. With a real gap the pocket frames the
        child, which is most of what makes containment read in light mode.
      - **Hover no longer strands a child.** Every block used to lift to a flat `z-7`, so a
        hovered container sat above its own contents — and since the pointer must cross the
        parent to reach the child, the parent latched `:hover` and the child could never be
        hovered or clicked. This is the exact failure the study docked *Lit Ledge* for, and
        it shipped here anyway. Fixed by spacing resting z two per level
        (`2 + (depth + cascade) * 2`) and giving a block WITH DESCENDANTS a hover lift of
        `z + 1` only; leaves still jump to `HOVER_Z`. `NowMarker` moves to
        `NOW_MARKER_Z = 20` so the lime-above-glass invariant survives the wider range.
      - `data-slot="pane"` on the pane: the wrapper is the block's *band*, and a
        double-booking's members share one, so the pane is the only honest handle on an
        item's pixels.
      - **`tests/e2e/overlap.spec.ts`** — five specs: nested (both titles at rest, child
        inset both edges, child owns its pixels), the hover regression, double-booking
        tiling, crossing channels, and an uncrowded day rendering unchanged. Verified to
        fail without the z fix before being kept.

## Deferred for a decision

1. **Week's widening costs visible days.** Confirmed on screen: one double-booked
   Thursday takes the column to 280px, the week's minimum total goes to
   `6 × 140 + 280 = 1120px`, and on a 1440px window **Friday and Saturday fall off the
   right edge** behind the horizontal scrollbar. That is the design working as specified —
   week answers crowding by growing — but losing two of seven days to one conflict may not
   be the trade you want. Alternatives if not: widen only while it still fits and shingle
   otherwise; or let week's tiled panes go under the floor rather than scroll.
2. **Should the pocket be visible when the child is DONE?** Still untested — the seeded
   items were all pending. The pocket is drawn from the parent's layout regardless of the
   child's status, so a completed child sits in a well whose plate has itself sunk to
   `--sched-pane-done`. Two sunk surfaces adjacent may read muddy.
3. **Desktop cap 2 vs 3 is now moot** — width decides.

Containment reading weak in light mode is **resolved** by `NEST_RIGHT_PX`: the pocket now
frames the child on both sides instead of showing only under its lane.

## Known-thin spots

- The cascade overflow path is now near-dead code: with the width policy it only fires
  when the field cannot hold even one channel. Kept deliberately as the last-resort
  "nothing may vanish" guarantee, but it is the least exercised branch and has never been
  seen on screen.
- `NOMINAL_FIELD` (800 day / 140 week) is used only for horizontal-intersection tests in
  the occlusion pass. Column boundaries are percentages of it so the comparison is exact,
  but a field far narrower than 800 with large px offsets could in principle mis-classify
  an intersection.
- `canExpand` now applies to narrow DAY channels, not just week. A day block that grows
  past its slot on hover is new behaviour; it only arises at 4+ overlapping items on a
  desktop field and was not exercised on screen.
