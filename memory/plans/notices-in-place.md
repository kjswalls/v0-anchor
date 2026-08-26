# Notices in place — direction E, "back to the object"

**Status (2026-08-26):** built on `claude/notices-in-place`. Supersedes the dock
stack's two-row height ladder. Does **not** supersede the dock's membership rule,
which is unchanged and still load-bearing — see the doc comment on `DockNotice`
in [lib/dock-notices.ts](../../lib/dock-notices.ts).

---

## The complaint this answers

Every notice arriving or leaving changed the dock capsule's height, so the
omnibar — the one control in this app you aim at without looking — moved under
the cursor. Three heights (0 / 40 / 72) plus an undo toast measured *from* that
same capsule meant the resting position of the text field was a function of how
much the app happened to have to say.

Five directions were studied. **E, "back to the object", was chosen**, with three
amendments: a shimmering typewriter reveal on the surface a notice belongs to,
every notice easily dismissible, and the undo toast demoted from a floating card
to a thin strip row.

## What E is

Each notice returns to the thing it is about. A notice standing next to the thing
it changed needs no words to say what it is about — which is already how the
day's suppression line ([components/views/program-notice.tsx](../../components/views/program-notice.tsx))
and a scope's pause switch work. The dock keeps **at most one line**: the
highest-ranked question with nowhere else to live.

E is the only one of the five directions that REDUCES total surface rather than
relocating it.

### E's stated tradeoff, and the three things that carry it

> A notice you never scroll to is a notice you never see, so anything genuinely
> urgent still needs the dock line — and deciding which is which is a judgement
> per notice rather than a rule the code can enforce.

1. **The judgement is a field, and the field is this document.** A notice declares
   `anchor?: NoticeAnchor`. Declining to name an anchor IS the judgement that this
   notice must not wait to be scrolled to. The table below is where each choice is
   argued; the code only executes it.
2. **Two parts of it are NOT judgement, and `placeNotices` takes those back.**
   A `blocked` notice never renders in place, whatever anchor it grows later — a
   notice saying the app cannot proceed is the one thing that must never be
   off-screen. And a notice carrying a **tray** never renders in place, because an
   in-place row draws no tray and anchoring one would silently drop its body.
   Placement must not be able to lose a notice's contents.
3. **An anchor that is not on screen is not an anchor.** Slots register themselves
   as they mount ([lib/notice-anchors.ts](../../lib/notice-anchors.ts)), so a
   notice whose object is not currently rendered — the braindump on the phone's
   Today tab, the foot of today's column while you are looking at next Thursday —
   falls back to the dock line by itself. Nothing is ever placed somewhere nobody
   is looking.

## Where the omnibar stopped moving

The notice stack moved OUT of the dock capsule into a strip directly above it.
Both docks hang that strip and the capsule off one wrapper whose bottom edge is
pinned to the column floor:

- **Desktop** — the braindump is `flex-1`, so a strip row is paid for by the
  braindump and the capsule does not move.
- **Mobile** — the tab content area is `flex-1` above the dock, same result.

The capsule's own height is now a function of chat expansion alone, which is the
only thing it was ever supposed to be.

The `--toast-bottom` anchor ([hooks/use-toast-anchor.ts](../../hooks/use-toast-anchor.ts))
moved onto that same wrapper, so the sonner toasts that remain (item dialog, bug
report, store errors) float above the strip rather than through it.

---

## The placement table

Every notice kind that exists today. "Goes to" is where it renders under E;
"dock" means it keeps the dock's one line.

| Notice | Rank | Goes to | Why |
|---|---|---|---|
| `sync-error` — "Couldn't load your data" / Retry | `blocked` (90) | **dock**, pinned | There is no object: the failure is the store, not a row, a day or a list. It is also the only notice that says the app cannot proceed, so `placeNotices` pins every `blocked` notice here even if one later grows an anchor. This is the notice E's tradeoff is about. |
| `waiting` — "N items waiting" / Review | `decision` (50) | **dock**, pinned (tray) | The pile is items from days that are, by definition, not the day on screen. Its object is a set of past days no view renders, so putting it on today's canvas would be putting it next to something it is not about. It also carries the triage tray, which only the dock opens — so it is pinned twice over. It is the canonical "highest-ranked question with nowhere else to live", and it is what the dock line usually holds. |
| `eod-review` — "Today's review is waiting" / Start | `decision` (50) | **`day-foot`** — the foot of today's column, in all three day layouts | The review is about the day ending, and the foot of the day is where the day ends. Mounted in day-buckets (under the evening bucket), day-list and day-schedule, and registered only when the rendered date is today — arrow to Thursday and the anchor goes dark, so the line returns to the dock rather than sitting under a day it is not about. The week layouts never mount it. |
| `auto-age-receipt` — "N items put aside this morning" / Put back | `receipt` (30) | **`braindump`** — pinned under the braindump header, above the rows | The sweep's only effect is that N items are now in the braindump. That is the object: the receipt sits on the list it added to, directly above the rows it is a receipt for, with "Put back" next to what would move. **This is a deliberate divergence from E as drawn**, which put the receipt "on the day whose contents it changed" — the days it changed are past days, and no view renders them. The braindump is where the items ARE, which is the honest reading of "the thing it is about". Outside the scroller, so it cannot be scrolled past. |
| the undo row (22 action families, [hooks/use-undo-toast.ts](../../hooks/use-undo-toast.ts)) | — | **strip**, transient | Not a notice — it is a receipt with an expiry, so it takes no rank and never occupies the dock's one line. It is the one thing here with genuinely no object: "Delete task: Swim" is about a row that no longer exists. It reads as the same kind of row as a notice (amendment 3) and carries an expiry hairline, which is the only thing on the strip that says "this one will leave on its own". |

### What is deliberately NOT on this table

- The day's **suppression line** (`ProgramNotice`) was already in place, beside the
  date, and was already argued out of the dock. It is the precedent E generalises,
  not a thing E moves.
- A scope's **pause state** is a permanent fact, not a notice; it rides its own
  switch (the group header, the Display menu's Paused-scopes list). Unchanged.
- The **habit reminders** (cue, last call, nightly settlement) reach outward
  through push/voice/SMS and never render in the app at all. See
  [habit-reminders.md](habit-reminders.md). Nothing here touches them, and nothing
  here should ever be taken as a place to render one: a nudge is owed at a moment,
  and a surface you have to open is not a moment.

---

## The three amendments, as built

1. **Typewriter shimmer, in place only.**
   [components/primitives/typewriter-text.tsx](../../components/primitives/typewriter-text.tsx)
   reveals a line with a stepped `clip-path` wipe and one neutral sheen crossing
   it. **The dock line NEVER types** — the dock is where the urgent and the
   homeless live, and anything urgent must be legible immediately. Under either
   motion veto — the OS `prefers-reduced-motion` or Anchor's own
   `[data-reduce-motion]` — the text simply appears, with no class for CSS to
   undo. The full sentence is in the DOM from the first frame in every case, so
   the reveal is a paint effect and never an availability one.
   *Divergence from the salvaged draft:* the **undo row does type**. It is the
   least urgent thing the app ever says (a receipt for something the user did one
   moment ago), the reveal costs at most 640ms of a 5000ms life, and it is what
   distinguishes an arriving row from the resting dock line right beneath it.
2. **Every notice is dismissible.** `onDismiss` was optional and the ✕ was
   suppressed wholesale on touch. In place there is room for it and nothing for it
   to collide with, so an in-place notice always draws its dismissal, on both
   platforms. The dock line keeps the old touch rule (its trays carry their own
   dismissal) because the dock row is still a full-width tap target with no hover
   to disambiguate a 24px ✕ from it.
3. **The undo toast is a strip row.** Same 26px, same ink, same glyph-then-line-
   then-verb shape as a notice — plus a lime expiry hairline that drains over the
   row's life. The hairline animates its **width**, never its opacity: lime never
   takes alpha in this palette, and it is its own element so no parent can fade it.
   It deliberately carries **no `title` attribute**: `tests/e2e/undo-redo.spec.ts`
   addresses the history control as `getByTitle('Undo')` and Playwright matches a
   title by substring, so a tooltip here would put a transient second match in
   front of it.

---

## Rules a future change must not break

- **The dock's membership rule is unchanged.** A line is earned by a pending
  DECISION, not by importance. Standing facts belong on the thing they are facts
  about — which under E is now true of nearly everything, so the rule binds
  harder, not less.
- **The dock line is one row.** `MAX_ROWS = 1` on both platforms. Past one, the
  fold row speaks for the pile ("2 to answer") and expands on demand. Because the
  strip is absorbed by a `flex-1` neighbour, expanding it still does not move the
  omnibar.
- **`blocked` never renders in place.** Pinned by `placeNotices`, pinned by test.
- **A tray-bearing notice never renders in place.** Same function, same test.
- **An anchor is refcounted and registers on mount, in a LAYOUT effect.** A
  passive effect would let the dock paint one frame holding a notice that is about
  to move — the flicker this change exists to remove, reintroduced by the fix for
  it. The refcount is what stops a shell swap (incoming slot mounts before the
  outgoing one unmounts) from blinking the anchor dark in between.
- **The typewriter is never the reason text is missing.** Reveal by clipping text
  that is already there; never by withholding it.
- **The notice strip lives outside `[data-dock-surface]`.** That element is the
  capsule the omnibar sits at the foot of. Anything put back inside it re-couples
  the omnibar's resting position to how much the app has to say.

---

## Known gaps, honestly

- **The layout-effect rule is documented but not pinned by a test.** Swapping
  `useLayoutEffect` for `useEffect` in `useNoticeAnchor` leaves the whole suite
  green: React Testing Library flushes both inside `act()`, so jsdom cannot tell a
  pre-paint commit from a post-paint one. Only a real browser could see the one
  frame this costs. Every other rule above has a mutation behind it (see the PR).
- **The expiry hairline's *reduced-motion* fallback is CSS-only.** The component
  test pins that the hairline is a width animation on its own lime element; the
  `@media (prefers-reduced-motion)` and `[data-reduce-motion]` overrides in
  `app/globals.css` are not exercised by jsdom, which loads no stylesheets.
- **"The omnibar does not move" is asserted structurally, not in pixels.** jsdom
  lays nothing out. The test pins the cause (the strip is not inside the capsule),
  not the effect.
