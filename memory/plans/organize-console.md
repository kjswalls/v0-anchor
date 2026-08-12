# Organize — one console for every container and label

**Status (2026-08-11): APPROVED FOR BUILD. All seven open questions answered by
Kirby (below). No code written yet.**

Design pass run 2026-08-11: three container directions designed to their strongest
form (modal command-center, non-modal docked panel, `/organize` route), each attacked
by three independent reviewers — codebase fit, user journey, visual craft. Nothing
scored above 5/10. The recommendation is the modal spine with the panel's IA and the
route's addressing semantics grafted on, and every fixable flaw raised against it
corrected.

Interactive study (live prototype at real size, both themes):
<https://claude.ai/code/artifact/1c32e594-4686-4e1a-892f-a11e53d47a8b>

Read [programs-routines.md](programs-routines.md) and [unified-items.md](unified-items.md)
first. This plan **amends** programs-routines locked decision 1: routines and programs
were deliberately id-referenced *because* projects and habit groups are name-referenced
and therefore unrenameable. Kirby's decision 5 below closes that asymmetry rather than
living with it.

**Goal:** replace `ManageCollectionsDialog` (Routines & Programs, 680px) and
`ManageCategoriesDialog` (Projects/Groups/Types, 400px) with a single fixed **938×640**
plate — six sections in two groups, plus Trash — reached from seven doors that all
resolve to one call.

---

## Product decisions (Kirby, 2026-08-11)

1. **The name is "Organize", not "Manage."** Every existing door says Manage;
   they all change. The two legacy palette commands keep their **ids and aliases**
   (`app.collections` / `/routines`, `app.categories` / `/projects` `/groups`) and get
   new labels — the ids are a test contract *and* a shortcut-rebinding persistence key.
2. **Seed defaults on first run.** A brand-new account gets a small, realistic,
   fully deletable starter set rather than six empty sections. Named after real
   behaviour, never `Example 1`.
3. **Restore participates in undo.** A Trash restore stamps a normal history entry;
   `⌘Z` after a restore re-deletes the row. (The two rejected alternatives were
   "clears the redo stack, not itself undoable" and "stamps no label at all".)
4. **Ship the corrected delete copy once, with the 30-day clause, in Phase 1.**
   No two-step edit. All phases land before anything ships, so the forward reference
   to a Trash that doesn't exist yet is never user-visible.
5. **Migrate to stable container ids first.** `items.project` / `items."group"` stop
   being name references. This is a new **Phase 0** and it delays everything — accepted
   knowingly. It is what lets projects and habit groups get real name fields in the
   console instead of the honest-sentence mitigation.
6. **Build the section filter.** Scoped to the current section, `/` and `⌘F`.
7. **Swap Item types and Habit groups in the rail order** — LABELS reads Projects,
   Item types, Habit groups. Folding habit groups into routines stays deferred, but
   the order that makes folding cheap is free now and awkward later.

---

## The four answers

**Does it need to be a modal? Yes — keep it, but stop treating it as a dialog.**
Not because the content wants a scrim, but because every alternative costs more than it
returns at this visit frequency. All three journey reviewers landed independently on the
same fact: this surface is *periodic*. Under thirty objects, one person, monthly.

- The **docked panel** buys a permanent column and a second Escape arbiter to deliver a
  live-preview gesture the ScopeRail already performs daily, and violates the written
  `SIDEBAR_MIN_CANVAS = 520` floor the moment the item panel is also open.
- The **route** dies on arithmetic, not principle: it inherits `<main>`, so its width is
  `viewport − sidebar − 442`. At the shipped 406px sidebar on a 1440px laptop that is a
  592px console, below the route direction's own 760px drill-in threshold — a *worse*
  editing surface than the 680px dialog it replaces, collapsing further any time the
  sidebar is dragged wider. Its headline win is also partly false: below 1180px
  `desktop-shell.tsx:63` marks `<main>` `inert` when the item panel overlays, and the
  console *is* main's body.

**The escape hatch stays open on purpose.** Build the console as
`components/planner/organize/` rather than a dialog body, and `/organize` later becomes a
page that renders the same component — an additive PR, not a rebuild. Buy the URL when
the URL is wanted, not before.

**Size: 938 × 640, fixed aspect.** Sized from the columns up —
**rail 180 | 1px | list 300 | 1px | detail 456**; vertically **48 header + 560 body +
32 footer**. Needs a 1002×720 viewport, so it fits 1280×800 with 278×80 to spare, fits
1366×768, and fits 1024×768 exactly. Fixed is the point: the frame never resizes on a
section change, which is the single loudest un-premium tell in both current dialogs.

**Access: seven doors, one call** — `openDialog({ type: 'console', tab, focusId?, focusNew?, returnTo? })`.

**Contents: six sections in two groups, and nothing else.** Settings stays out
(preferences change how the app behaves; containers are data whose state changes what
work exists). The daily on/off switchboard stays on the ScopeRail.

---

## Layout law

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Organize                                                             ✕  │  48
├─────────────────┬────────────────────────────┬───────────────────────────┤
│ CONTAINERS      │ ROUTINES              4    │  ⟳  Morning reset  ▪▪▪▪ ▫ │
│  Routines   ←   │  ⟳ Morning reset      6    │  Routine · 6 items ·      │
│  Programs       │  ⟳ Wind-down  ☾Paused 4    │  in 1 program             │
│                 │  ⟳ Sunday admin       3    │  ───────────────────────  │
│ LABELS          │  ⟳ Gym block          3    │  Status   [Active|Paused] │
│  Projects       │                            │  ☾ On here — your Deep    │  560
│  Item types     │                            │    work program is        │
│  Habit groups   │                            │    holding it off today.  │
│ ─────────────   │                            │  IN 1 PROGRAM             │
│  Trash          ├────────────────────────────│  6 ITEMS          + Add   │
│                 │ ⊞  New routine…         ↵  │  ▫ Stretch  7:00  ⌃ ⌄ ✕  │
├─────────────────┴────────────────────────────┴───────────────────────────┤
│  Morning reset · routine        Open item ↵   Filter /   Close Esc       │  32
└──────────────────────────────────────────────────────────────────────────┘
      180                    300                          456
```

**Ground.** Every pane sits on `bg-modal`. **There is no background step anywhere
inside the plate — depth is the hairline, full stop.** This is not taste: a rail on
`--surface-1` over `--modal` is a 0.6% step in light (invisible) and a clear 3.2-point
step in dark, giving a two-tone dark mode and a flat light one; the obvious fix inverts,
because `--surface-3` at 0.245 is *lighter* than `--modal` at 0.21 in dark. Removing the
step removes the per-theme problem entirely.

**Two elevation levels only.** Level 0 = the plate and everything in it, hairlines only.
Level 1 = popovers, menus, Calendar, IconPicker, AlertDialog — `bg-popover`,
`rounded-[10px]`, `shadow-soft-md`, declared once. The **only** raised element inside the
plate is the segmented control's thumb.

**Four radii, all existing app literals.** 20px plate · 10px controls and popovers (the
app's capsule signature) · 5px rows · 4px keycaps. **3px and 7px are banned** — grep
returns zero of either in `components/`.

**One new token.** `--shadow-elev-plate`, both themes, a plain custom property consumed
as `shadow-[var(--shadow-elev-plate)]` — *never* a named `@theme` shadow utility, or
Tailwind inlines light's value into `--tw-shadow` and dark never re-tunes.

```css
:root { --shadow-elev-plate: 0 24px 64px oklch(0 0 0 / 14%), 0 4px 12px oklch(0 0 0 / 10%); }
.dark { --shadow-elev-plate:
  inset 0 1px 0 oklch(1 0 0 / 10%), 0 24px 64px oklch(0 0 0 / 50%), 0 4px 12px oklch(0 0 0 / 40%); }
```

The dark `inset 0 1px 0` light-catch is mandatory — on the near-black ramp a drop shadow
alone does not read, and the whole dark elevation system is a lighter surface plus that
1px catch.

**Responsive.** 768–1023px: plate at `calc(100vw-48px)`, **the rail never collapses**
(the moment it does, discoverability falls back to the palette, which is what killed the
third-column direction), list and detail become one drill-in pane behind a *container*
query — not a viewport query, so dragging the sidebar can't lie to it. Below 768px:
`ResponsiveModal` hands over to the vaul sheet, three levels, free — which
`ManageCategoriesDialog` has never had (it is a 400px centered box on a phone today).

---

## Navigation

A grouped left rail built on `Radix Tabs orientation="vertical"`, **never a tab strip**.
Chosen because it costs nothing: vertical Tabs still emits `role="tab"`, so
`getByRole('tab', { name: 'Routines' })` in `programs.spec.ts:76` keeps resolving; it
gives roving tabindex and ↑/↓ free; and `key={tab}` remains the remount trick that makes
a second open with a different section actually land there.

Import `@radix-ui/react-tabs` **directly**, not `components/ui/tabs.tsx` — the wrapper's
`TabsList` is `bg-muted inline-flex h-9 w-fit rounded-lg p-[3px]` with `flex-1` triggers,
i.e. exactly the full-width segmented strip the reference set names as the loudest clone
tell, and every one of those classes has to be nulled anyway.

```
CONTAINERS                    ← role=presentation eyebrow
  Routines        routines
  Programs        programs
LABELS
  Projects        projects
  Item types      types       ← decision 7: types above groups
  Habit groups    groups
──────────────                ← role=presentation, mt-auto
  Trash           trash
```

Group eyebrows and the Trash rule are wrapped in `role="presentation"` so the tablist's
children are all tabs and Radix's RovingFocusGroup skips them. **Slugs are the five
existing `tab` string values plus one** — every `openDialog({..., tab})` call site keeps
its literal; this is a variant rename, not a value translation.

**Rail rows carry no icon and no count.** Five near-identical grey lucide glyphs is the
clone tell; counts reflow as data loads, put two numeric columns 300px apart in a fight,
overflow a 22px slot the moment a project's usage count goes three digits, and — load-
bearingly — **join the tab's accessible name**. `getByRole('tab', { name: 'Routines' })`
matches by substring so `"Routines 4"` would pass, but that is a silent dependency on
Playwright's default matching. Counts live on the list head and the detail meta line.

**Taxonomy: CONTAINERS / LABELS.** Grouped by what the thing does to your work, not by
feature area. Containers switch work on and off — stateful, with members, the only two
that get a state control and a member list. Labels name work. Trash is a lifecycle
surface, not a peer of either, so it is pinned to the foot behind a rule. Two levels
maximum; there is no third.

**Deep-linking.** `ActiveDialog` gains one variant, replacing two:

```ts
{ type: 'console'; tab?: ConsoleSection; focusId?: string;
  focusNew?: boolean; returnTo?: ActiveDialog }
```

- `tab` alone → that section, list focused on row 1, detail shows the teaching line.
- `tab` + `focusId` → that object **selected**, row `scrollIntoView({block:'nearest'})`.
  Closes the recorded deferral where the manager focused a *tab* rather than a row.
- `focusNew` → the create row's input focused on arrival (what ScopeRail's `+` has
  always meant).
- `returnTo` typed as **`ActiveDialog`, not `Item`** — typing it as `Item` cannot restore
  an add draft, which is exactly the case that matters.
- No `tab` → `routines`. **Never a last-used-section memory:** at monthly frequency a
  remembered destination is a coin flip, and it makes the braindump door unlearnable.

---

## The object row — one primitive, all six sections

Full-bleed in the 300px column, hairline-separated, **no card, no per-row fill at rest**.
A stack of grey pills is the fastest way to look like a bootstrapped admin panel, and
this app already reserves rounded fills for *nav* rows (the rail, the ScopeRail).

`h-[34px]` at md and up (`min-h-[44px]` below md and under `(pointer:coarse)`), `gap-[9px]`,
`rounded-[5px] px-[7px]`. 34 is chosen against *this* type ramp, not Linear's — `text-sm`
here is 12px, not 13px, so 34 reads at the density Linear gets from 36–40.

| slot | spec |
|---|---|
| glyph | `w-[18px]` centering a 14px `CategoryIcon` in the container's accent (stored `color` first, else `accentColorForName`) |
| name | `min-w-0 flex-1 truncate text-sm font-medium`, `title` attr |
| pill | `StatePill`, reused verbatim, **only when not live** |
| count | `w-[22px]` fixed, `font-num text-2xs tabular-nums`, always rendered incl. `0` |

- **One mark per row, never two.** The glyph carries identity *and* colour. An identity
  square *plus* a grey glyph accumulates two marks for one meaning.
- **No halo on the glyph.** The `shadow-[0_0_0_1px_var(--modal)]` trick works elsewhere
  because the ground genuinely is the token; here it becomes `modal + 4%` on hover and
  `+9%` on selection, so the ring would become a visibly *brighter* outline exactly when
  the row is active.
- **Every count runs through `countLive`**, never a raw `.length` — join rows outlive an
  item's soft delete by design. A program's count is items **+** routines.
- **Paused dimming rides the NAME only.** Not the row (that fades the focus ring and the
  pill, the one thing that must stay readable) and **not the glyph** — the accent may
  resolve to `--accent-8`, which is lime, and lime never dims.
- **Selected suppresses hover.** `data-[selected]:hover:bg-[var(--row-selected)]`.
  Without it, hovering a selected row swaps 9% for 4% and the row gets *lighter* — the
  documented inversion all three source directions committed.
- **Focus ring is 1px inset, not 2px.** At 2px a lime rectangle around a 300px row is the
  largest chromatic mark in an app that quarantines colour to ≤14px glyphs.

**NO per-row actions anywhere.** No trash, no gear, no swatch, no overflow `…`. Every
verb lives in the detail pane one pixel away. This buys ~30px of name width, removes every
hover-only affordance (touch and keyboard parity solved by *deletion*, not duplication),
removes the mis-tap delete, and gives the list exactly one interaction: select. It is a
deliberate regression against today's categories rows, which carry three controls each;
the cost is one extra click per delete, which is correct for a destructive verb.

**One named exception:** Trash rows carry an always-visible inline `Restore`
(`h-[22px] px-2 rounded-[5px] text-xs`) — there is nothing to select into, and hiding the
only path to the only verb is the anti-pattern.

**The draft row** is `h-11`, pinned at the **foot of the list column, outside the
scroller**, `border-t`, and **unconditionally mounted**. That last part is law:
`programs.spec.ts:111-112` fills `${kind}-new-name` with no preceding click, so making the
create row conditional times out every container-creating test in both spec files.
Creation gates on `collectionsAvailable && userId && !isLoading` — the three-part signal,
not the flag alone, because a container created inside the load window is silently erased
by `initializeStore`'s `set()` and the user then owns two.

---

## The detail pane

`flex-1 min-w-0 overflow-y-auto px-6 py-5` → 408px content ≈ 58ch. Blocks 20px apart,
`h-px bg-border` only where the subject changes. **Content swaps at 0ms.**

1. **Identity row** — `h-8`, IconPicker trigger (`hover-wash`, *not* `hover:bg-accent`:
   it carries a resting fill and a background-*color* swap makes controls on a well get
   lighter on hover) + name + ColorSwatchPicker flush right.
   Name is a **borderless buffered input styled as a heading** — `text-lg font-semibold`,
   commits on blur and Enter, Escape resets, blank or unchanged reverts, draft resets on
   `[id, name]`. Live binding is forbidden: every update action stamps a history label and
   the subscriber deep-clones the whole snapshot, so one rename becomes ~15 undo entries
   and ~15 PATCHes against a 50-deep stack.
   **After Phase 0, projects and habit groups get this same field** — the honest-sentence
   mitigation is deleted, not shipped.
2. **Meta line** — `text-2xs`, `font-num` on numerals.
   `Routine · 6 items · in 1 program` · `Program · 4 items · 2 routines` ·
   `Project · 11 tasks` · `Habit group · 6 habits` · `Item type · goal · 7 items`.
   **This is where projects and habit groups finally get a usage count**, which makes
   their delete the informed action it has never been.
3. **State block** *(containers only)* — settings rows, label left + optional description,
   control flush right, `h-11`, hairline between. Segmented = the app's capsule-over-pill
   at console scale: `h-8` well `rounded-[10px] bg-surface-3 p-1`, `h-6` thumb
   `rounded-[8px] bg-surface-2 shadow-[var(--shadow-elev-sm)]`. **4px clearance** —
   `elev-sm` is a 4px offset and at 2px it clips on the radius.
   - Routine `Status` → `Active | Paused`, calling **`setRoutinePaused` directly** (it
     stamps its own history label; routing through `updateRoutine` stamps "Edit routine"
     and lands the intended label on the user's *next* action).
   - Routine `Comes back` *(new, paused only)* → DayField calling
     `setRoutinePaused(id, true, format(date,'yyyy-MM-dd'))` — **the third argument the
     store has always taken and no call site has ever passed**, while `pausedUntil` is
     *read* in three places. Write with `format`, never `toDateStr` on a react-day-picker
     Date; parse at local noon, never `new Date('yyyy-mm-dd')`.
     **A pause's upper bound is EXCLUSIVE; a program's range is inclusive at both ends.**
     Not an inconsistency — resolving them the same way makes one read wrong by a day.
   - Program `Status` → `On | Off | Dates`; `Runs` renders **only** under Dates, each
     field strictly bounding the other so a one-day program stays legal and an inverted
     range is impossible.
   - Swap verb renders only when this program is not live *and* at least one other is.
4. **Effective-state block** *(new, routines only — the highest-value correctness fix)*.
   Today `RoutineDetail` resolves only the local pause, so a routine held off by a live
   program shows `Active` with un-greyed members while the ScopeRail one column away
   reports `local=on / effective=off`. The segmented control keeps showing **local** truth
   (that is the value it writes), one muted line names the override, and **the member list
   greys on EFFECTIVE state** because effective is what the rest of the app obeys.
   Beneath it, `IN N PROGRAMS` — a reverse view that **does not exist anywhere today**.
5. **Member rows** — `h-[30px]`, type glyph (**new**: today a member row is a bare title,
   so two same-titled items are indistinguishable here *and* in the add-search results),
   title, `w-[64px]` meta (`font-num` **only when numeric** — mono on `anytime` is
   developer-tool cosplay), `w-[72px]` control rail **width reserved always**.
   `⌃⌄` are **routines only** — `routine_items` carries `sort_order`, `program_items` does
   not, and offering it on a program lets a user arrange an order that survives until the
   next fetch and then silently reshuffles. Swaps **by id**, never by index. End-of-list
   arrows take **`aria-disabled`, not `disabled`** — a real `disabled` drops focus to body,
   `focus-within` fades the pair out, and a keyboard user walking a member down loses
   their place.
6. **Danger zone** — label + outline `Delete`. Only the item-type confirm is
   `bg-destructive`; it is the one delete in the app that genuinely cannot be undone.

---

## Type, motion, keyboard

**Three registers, no fourth.** 16/600 detail title · 14/600 plate title · 12 (`text-sm`)
rail label + row name + body · 11 (`text-xs`) notes · 10.5 eyebrows and pills · 10
(`font-num text-2xs`) counts and meta.

- The **plate title is smaller than the object title** — chrome vs subject, 1.33:1.
- **One name size everywhere: 12px. 12.5px is banned from the console.**
- 10 and 10.5 never sit adjacent **as the same family** — the count keeps 10 only because
  `font-num` changes the family, and a mono numeral beside a sans word is legible at any
  size where two sans marks half a pixel apart are jitter.

**Motion: two durations, three existing curves.** 150ms in / 100ms out, popovers
120/80, segmented thumb 150ms on `--ease-roll` (the console's one true crossover).
Stock `DialogContent` ships `duration-200 zoom-95` — **95% on a 938px plate is a 47px
lurch**; both are overridden to `duration-150` / `zoom-[0.98]`. Tailwind v4 presses via
the standalone `translate` property, not `transform`. Exit is always faster than entrance.

**Deliberately not animated** — plate height on section change (the plate is fixed-aspect
precisely so this never happens), section switching, rail selection, detail arrival, row
hover (**no transition property on background-color at all** — anything over ~80ms trails
the pointer across a 12-row list, and TaskRow already omits one deliberately), the focus
ring, list reflow, member reorder, counts, skeletons, spring overshoot.

### The keyboard blocker, and its fix — ships in Phase 1, before the console exists

`hooks/use-command-shortcuts.ts:61-99` is the app's one `window` keydown dispatcher and
its only guard is `isFocusedOnInput()`. Console list rows are `<button>`s, so they are not
"typing": pressing `n` on a focused row opens the add dialog and **replaces the console in
the single `ActiveDialog` slot**; `v` switches the planner view behind the plate; `?`
opens the shortcuts modal; `⌫` matches the registered `delete_hovered` binding, which
`preventDefault`s before any local handler runs, and `lib/hovered-item.ts` is a module ref
cleared only by TaskRow's `onMouseLeave` — so it can still be pointing at a task on the
canvas. **Typing a routine's name would destroy the surface you are typing into.**

```ts
// after `const typing = isFocusedOnInput();`
const localKeys = !!document.querySelector('[data-keys-local="true"]');
// inside the loop, after `const command = ...`:
if (localKeys && !binding.keys.some(k => k === 'mod' || k === 'shift' || k === 'alt')) return;
```

The console root carries `data-keys-local="true"`. Scoped, unit-testable, changes nothing
for any surface that doesn't opt in.

**Model, calibrated down:** `↑ ↓` walk the list, `Home`/`End`, `↵` into the detail's first
control, `⌥↑`/`⌥↓` reorder a focused member (routines only), `/` or `⌘F` filter, `⌘⇧,`
opens the console. **Deliberately absent: type-ahead, `⌫`, `⌘↵`, and any bare-letter
global.** Spending a single-letter global on a monthly surface, in an app whose bare
letters are daily verbs, is a frequency claim the surface cannot back.

**Escape ladder — four rungs, one per press, rungs SKIPPED when inapplicable.** That last
clause is load-bearing: `closeManager` in `programs.spec.ts:93-103` and
`scope-rail.spec.ts:85-92` loop at most four presses waiting for the overlay to reach 0,
so a no-op rung that consumed a press would exhaust both helpers.
(1) popover/calendar/picker/menu → (2) member-add input or filter text clears →
(3) *drill-in and mobile only* detail pops back to list → (4) console closes, re-opening
`returnTo` if set. **No "clear selection" rung** — nobody presses Escape to deselect.

---

## The seven doors

All resolve to `openDialog({ type: 'console', tab, focusId?, focusNew? })`.

1. **Braindump header folder button** (`braindump.tsx:521-529`) — same `h-6 w-6` ghost,
   same one-slot budget in a width-critical row, now reaching all six sections instead of
   three. Opens on `projects`, **permanently** — a door whose destination changes cannot
   be learned at monthly frequency. `aria-label="Organize"`, tooltip + `⌘⇧,` KeyCap.
2. **ScopeRail `+` and every row name** (`scope-rail.tsx:121`, `:156-161`) —
   `+` → `{tab:'routines', focusNew:true}`; name → `{tab, focusId: row.id}`.
   **Closes the recorded `focusId` deferral.** Both testids unchanged.
3. **Command palette** — new `app.console` ("Organize", aliases `/organize /manage
   /programs /types /trash`). `app.collections` and `app.categories` keep their **exact
   ids and aliases**, re-pointed, relabelled.
4. **`mod+shift+,`** — free after normalization, reads as a sibling of `⌘,` for Settings,
   which is exactly the relationship. Auto-appears in the shortcuts modal, rebindable.
5. **Item dialog chips — restructured, not just retargeted.** Drop the
   `routines.length > 0` / `programs.length > 0` terms from the gates
   (`item-dialog.tsx:1188`, `:1242`); keep `collectionsAvailable && collectible`. Add
   inline **`New routine…` / `New program…` / `New type…`** in *both* modes, mirroring the
   `addProject`/`addHabitGroup` inline path that already ships at `:1006-1015`. Keep
   **`Organize routines…` in EDIT mode only**, where the panel autosaves so nothing is in
   flight, carrying `returnTo`. **This is where the single-slot draft-loss defect actually
   gets fixed** — not by buying a second store slot.
6. **User-card dropdown** (`user-card.tsx:141-163`) — an `Organize` row above `Settings`,
   KeyCap flush right. Adjacency, not nesting, preserves the "management stays out of
   Settings" line.
7. **ProgramNotice** (`program-notice.tsx:54`) → `{tab:'programs', focusId}`. A
   consequence→cause link must land on the specific program hiding your work.

**Trash's door is separate and deliberate:** a `Recently deleted` row at the foot of the
user-card history popover, where in-session undo already lives and where a panicking user
already goes. A recovery feature only reachable from a rail nobody has opened is not one.

**Mobile:** doors 1, 2, 6 and 7 all exist on touch already. **No fourth bottom tab** —
`MOBILE_TAB_ORDER` drives swipe nav and `OnboardingTour` drives tabs by name.

---

## What is NOT in the console

- **Everything in Settings, in both directions.** Settings contains *zero* management of
  user-created objects today. The console is a new **peer** of Settings, not a carve-out.
- **The daily switchboard.** No state toggle on any list row, in any section. State lives
  in the detail pane only. Building the rail's live-flip gesture as the console's
  centrepiece re-merges the two surfaces `scope-rail.tsx:13-31` exists to keep split, and
  would ship the same switch twice with *different* semantics — the console's could only
  ever publish local state; the rail publishes local **and** effective.
- **Item editing.** Member rows are addresses, not editors. `↵` opens the item and the
  console closes — an honest exit, named in the footer bar so it is never a surprise.
  (`item-panel.spec.ts:104` asserts a second `role="dialog"` cannot coexist with the panel.)
- **The common membership add-path.** Bulk `Collect` already exists in the selection bulk
  bar and is tri-state and correct. The console's member lists are for *curation*.
- **Container creation, exclusively.** Creation stays distributed — the item dialog mints
  projects, groups, routines, programs and types inline. The console owns the *destructive
  and structural* verbs.
- **An Archive state** — refused. Paused/off is already the app's way of setting something
  down, and a second inactive state would double every object's vocabulary.

---

## Build order

Each phase independently shippable and green on its own. Nothing ships until all land
(decision 4), but each must stand alone in CI.

### Phase 0 — Stable container ids *(new; decision 5)*

`items.project` / `items."group"` stop being name references. **The text columns are
KEPT, not dropped** — rollback ballast, and the permanent legacy agent projection still
has to emit a *name*. `/api/agent/context`'s `tasks[]`/`habits[]` and the
`tasks.updated`/`habits.updated` webhooks must stay **byte-identical**: the OpenClaw plugin
`safeParse`s the whole response and throws on drift — and a uuid would still *parse*,
because both fields are `z.string()`, so the failure would be silent and would feed ids to
a model with no id↔name map.

Unblocks: renaming projects and habit groups, which deletes the two honest-sentence
mitigations from the detail spec.

**Four findings from the blast-radius survey. Each one is a way this lands looking
correct and is not.**

1. **`ON DELETE SET NULL` on a composite FK nulls EVERY referencing column** unless given
   a column list — and `items.user_id` is `NOT NULL`. So the obvious
   `foreign key (project_id, user_id) references projects (id, user_id) on delete set null`
   makes the nightly `purge-deleted-items` cron abort with `23502` on the first purged
   project that outlived its children. Use `on delete set null (project_id)`, which is
   **PostgreSQL 15+**, and have the migration *assert* the version rather than silently do
   the wrong thing. The composite key itself is not optional: Postgres validates FKs with
   table-owner privileges and **ignores RLS**, so a bare `references projects(id)` plus
   own-row RLS is a cross-tenant existence oracle.
2. **No migration creates `projects` or `habit_groups`.** Thirteen tables are created
   across `supabase/migrations/`; neither of those is among them. They exist only in the
   stale `schema.sql` that CLAUDE.md forbids authoring against — so their live shape,
   including whether `(user_id, name)` is unique, is *inferred*. The backfill needs
   `to_regclass` guards (the SQL mirror of 024's `unavailable()`), and must not depend on
   a uniqueness constraint that may not be there.
3. **The id column must also enter `taskShape` AND `habitShape` in `packages/types`**,
   additive-optional, following the `parentItemId` precedent — or **undo silently
   reverts wrong**. `diffItem` (`planner-store.ts:576`) iterates
   `getItemTypeConfig(...).fields`, which is `Object.keys(taskShape)`, so a field outside
   the shape never enters an undo patch: undo would send the *old name* back and leave the
   id pointing at the new container. Then `pnpm --filter @anchor-app/types build` with
   `dist/` committed **in the same commit** — CI fails on drift.
4. **The deploy window is real.** Vercel builds on push; `db:push` is manual. The app must
   omit the id columns from every insert row until something actually sets them (the
   `pauseColumns` pattern 024 introduced for exactly this), because PostgREST rejects an
   INSERT naming a column absent from its schema cache with `PGRST204` — which would take
   out *every* item create, not only container-bearing ones.

**Scope discipline:** make the ids authoritative and have rename fan the new name out to
members' text column keyed on the id. Do **not** convert the ~15 name-keyed UI call sites
in this pass. The orphaning bug is fixed by the fan-out alone, and every name-keyed
surface keeps working unchanged because the text column stays correct. Converting the UI
is separate work and should not ride along.

### Phase 1 — Foundations and truth fixes. No new surface.

Ships against the two dialogs that exist today.

**Status 2026-08-11 — done: the risk spike (green, see below), `lib/collections.ts`, both
live bugs, the delete-copy debt, the keyboard guard, `--shadow-elev-plate`. Remaining:
`focusId` threading and the item-dialog chips.** Suite at 757/757, lint clean, build green.

> **Risk spike result: PASSED.** `tests/unit/organize-rail.test.tsx` proves
> `getByRole('tab', { name })` resolves against `TabsPrimitive.Root orientation="vertical"`
> whose list holds `role="presentation"` group headers, that roving focus steps over those
> headers, and that no eyebrow text leaks into a tab's accessible name. Two jsdom gaps had
> to be closed to get there and both are now shared: `Element.prototype.scrollIntoView`
> does not exist in jsdom and Radix calls it *before* `.focus()`, so arrow traversal died
> silently mid-handler (stub now in `tests/unit/setup.ts`, which the console needs anyway
> for `focusId`); and Radix defers roving focus into a `setTimeout`, so every arrow
> assertion needs a macrotask tick.

- **Risk spike first:** prove `getByRole('tab', { name: 'Programs' })` resolves against a
  `TabsPrimitive.Root orientation="vertical"` whose list contains `role="presentation"`
  group headers. Everything in Phase 2 rides on it.
- Extract `swapMembers`, `countLive`, `useLiveItemIds`, `useLiveRoutineIds`,
  `useNameDraft`, `parseLocalNoon`, `programPillLabel` → **`lib/collections.ts`**; update
  the single import at `tests/unit/group-by-routine.test.ts:3`. **No re-export left
  behind** — that is how dead paths survive for a year.
- **Two live bugs:** `useEffect(() => { setAdding(false); setQuery(''); }, [ownerId])` on
  both member lists (today an open search box and its typed query survive a two-pane
  selection switch, and Enter adds to the **wrong container**); and a **Cancel** on the
  routine-attach list (today `setAdding(false)` runs only inside `requestAttach`, so the
  only escapes are attaching something or leaving).
- **Pay the copy debt** (`manage-categories-dialog.tsx:329-333`) — with the 30-day clause,
  once (decision 4). Projects and groups **are** `⌘Z`-undoable and 30-day recoverable;
  `removeHabitGroup` **reassigns** habits to the first remaining group (falling back to
  the literal `'Personal'`) rather than unassigning them; item types genuinely cannot be
  undone and carry **no** warning today.
- Thread `focusId` through both existing variants; point `scope-rail.tsx:156-161` and
  `program-notice.tsx:54` at objects rather than tabs.
- Restructure the item-dialog chips (door 5).
- The two-line `use-command-shortcuts.ts` guard **+ a unit test**.
- Add `--shadow-elev-plate` to `globals.css`, both themes.

*Gate:* `pnpm test`, plus `programs.spec.ts` and `scope-rail.spec.ts` **unchanged** and
green.

### Phase 2 — The plate

**Status 2026-08-12 — DONE, wiring included. Build green, 844 unit tests, lint 0 errors.**
Work moved to its own worktree (`D:/Code/v0-anchor-organize`, branch `feat/organize-console`)
after a parallel session in the shared checkout committed one of these edits into its own
history by accident. Branches are per-worktree, so a branch alone could not have isolated it.

**Twelve doors, not seven.** The settings-route rewrite added five `DESTINATIONS` records
(`dest.projects`, `dest.groups`, `dest.types`, `dest.routines`, `dest.programs`) between
the survey and the build. Their `action` union collapsed from
`manage-categories | manage-collections` to a single `organize`, and `tab` became `section`.
Their `where` now reads `Organize` rather than `Planner` — the old value described a dialog
reachable from two unrelated places; these five now live in one console with a name.

`ActiveDialog` gained `organize` (NOT `console`, as originally specced — `console` reads as
the browser's, and the variant should carry the product's name) and lost both old variants
outright rather than keeping aliases: two variants pointing at one component is how a
caller ends up opening the right surface on the wrong section for a year. Palette command
**ids and aliases are frozen** per decision 1 (`app.categories`, `app.collections`,
`projects`, `groups`, `routines`); only labels followed the rename.

**`focusId` is threaded and now reveals its row.** The ScopeRail's rows and the program
notice deep-link to a specific object, so `ObjectRow` scrolls itself into view with
`block: 'nearest'` when selected — a no-op when it is already visible, so ordinary
clicking never jumps the list. Scroll only, never focus: the plate's focus trap runs on
open and a second claim on the same tick lands the ring somewhere nobody intended.

**One defect found while moving, invisible to every reviewer.** `lib/collections.ts`
contained a literal **NUL byte** — `` `${id}\0${name}` `` where a separator was meant. It
parsed, ran, and passed every test, but git classified the file as binary and stopped
producing diffs for it, which is why five review lenses reading it as text saw nothing.
The composite key is gone; the two values are compared as two values.

Original status line: **the whole tree is built and green; only the WIRING is left.**
`organize-console.tsx`, `console-rail.tsx`, `primitives.tsx`, `detail-parts.tsx`,
`member-list.tsx`, `escape-ladder.tsx`, `sections/{routines,programs,labels}.tsx`.
184 unit tests green across the console files and their neighbours, lint 0/0, tsc clean.

Three departures from the file list below, each for a reason worth keeping:

1. **`sections/labels.tsx`, not three files.** Projects, types and groups are the same
   section three times over; the differences (a project's time block, a type's frozen
   slug and un-undoable delete) are a dozen lines each. Three files would have been
   three copies of identical scaffolding — the drift that put `lib/collections.ts` in
   the tree in the first place.
2. **`object-row.tsx`/`state-pill.tsx`/`key-cap.tsx` collapsed into `primitives.tsx`.**
   Every geometry in them is picked against the others; separate files hide that.
3. **The section filter moved UP from Phase 3.** The footer bar teaches `/`, so leaving
   it unbuilt shipped a promise the plate did not keep. It brought the Escape ladder
   with it.

**The load-bearing discovery, and it invalidates a comment in the old dialog too:**
Radix's `DismissableLayer` binds Escape with
`ownerDocument.addEventListener('keydown', handler, { capture: true })`
(`@radix-ui/react-use-escape-keydown`). It runs on the **capture** path at the document,
*before* the event descends toward the focused input — so **every `e.stopPropagation()`
Escape "rung" is dead code**, including the four in `manage-collections-dialog.tsx` that
have been shipping since it landed. A capture listener of our own on `document` does not
help either: same target, same phase, Radix registered first. The ladder therefore goes
through Radix's own `onEscapeKeyDown` prop (`escape-ladder.tsx`), where `preventDefault()`
keeps the plate open. Each rung self-guards on focus, so no ordering rule is needed and
two rungs can never both claim one press.

Original file list, kept for the record:
`console-dialog.tsx`, `console-rail.tsx`,
`object-row.tsx`, `member-list.tsx`, `state-pill.tsx`, `key-cap.tsx`,
`sections/{routines,programs,projects,types,groups}.tsx`.

Routine and program detail bodies are **moved, not rewritten** — every testid travels with
them. Projects, types and groups ship at today's capability **plus** the usage count and
(post-Phase-0) a real name field. `EditProjectDialog` stays mounted one more phase, opened
from the project detail's `Time block` row.

`ActiveDialog` gains `console` and **loses both** `manage-categories` and
`manage-collections`; `app-shell.tsx`'s two unconditional mounts collapse to one. Retarget
all seven doors. **Delete both dialog files in the same commit** so no dead surface
lingers. Add testids to the projects/types/groups half — **it has zero today and nothing
in `tests/` reaches it.**

*Gate, and this is the acceptance criterion, not a visual review:* `programs.spec.ts` and
`scope-rail.spec.ts` run **unchanged** and green, including both `closeManager` helpers
and the `getByRole('tab')` clicks. **Not yet met — it cannot be until the wiring lands**,
since the specs still drive the old dialogs. One change was needed to keep it reachable:
`ConfirmRequest` gained an optional `testId`, because the console routes its confirms
through the shell's single `ConfirmDialog` and `program-routine-attach-confirm` is a
selector `programs.spec.ts:207` depends on.

**Adversarial review, 2026-08-12 — five lenses, twelve findings, nine confirmed after an
independent refutation pass. All five distinct defects fixed; each has a regression test.**

1. **`setRoutinePaused`'s third argument could never be written — the store rejected it.**
   Found by four of the five lenses independently, all of which verified by *running* the
   action rather than reading it. The action opened with
   `if (isPausedOn(routine, todayStr, tz) === paused) return;`, an idempotence guard that
   also swallowed the one request that is not a no-op: a resume date on a pause already
   running. A resume date can only be picked while something is paused, so the parameter
   was unreachable from any UI, and the console shipped a picker that wrote nothing. Fixed
   by routing the action through `active.ts`'s **`resolvePauseWrite`** — the module that
   already defines what the pause verb means in columns, and which already documented this
   exact case ("Already paused: honour a new resume date, but leave `pausedAt` where it
   is"). Every previously-supported call resolves identically. `until` is now
   `string | null | undefined`: undefined is "not specified" (keeps the toggles
   idempotent), null is "clear", a string is a day.

   *The test that missed it is the lesson.* It replaced `setRoutinePaused` with a
   `vi.fn()` and asserted the call — proving the button was wired to a **name** while the
   column never moved. Store-writing controls get tested against the real action.

2. **`Auto` on the colour picker was a silent no-op for all three label sections.**
   `ColorSwatchPicker` says "clear the stored colour" by calling `onSelect(undefined)`,
   and the defensive key-by-key patch rebuild filtered on `patch.color !== undefined` —
   dropping precisely that case, producing an empty patch that the store spreads to
   nothing and `dbUpdateProject` discards before building a query. A swatch you could set
   and never unset, and a regression against the dialog being replaced. The discriminator
   is **key presence** for the optional colour and **value** for the NOT NULL glyph; both
   now live in one `renameIconKey` helper that states why they differ.

3. **`focusNew` re-fired on every return to the opening section**, because it was a prop
   rather than a latched arrival and Radix remounts a section's subtree. Arrowing back to
   Routines ripped focus off the rail into the create field. Now spent on the first
   section change and re-armed by a fresh open.

4. **480px of fixed columns inside a 393px bottom sheet.** A 180px rail plus a `shrink-0`
   300px list, in a vaul wrapper that is `overflow-x-hidden` — so the add button, the
   count column, the state pill and the drill-in chevron sat in 119px of unpannable,
   untappable space. The list is now `flex-1` below `md` and exactly `w-[300px] shrink-0`
   above it, so the desktop 180 | 300 | 456 arithmetic is untouched. The fuller mobile
   answer (the rail becoming its own drill-in level) is still open.

5. **`created()` matched names exactly while `addHabitGroup` de-duplicates
   case-insensitively**, so "personal" against an existing "Personal" created nothing,
   returned null, and wiped the selection with no explanation anywhere. Exact-first then
   case-folded — projects compare exactly and really do create a second row, so a
   fold-only lookup would select the older one.

Three findings were refuted and the reasoning is worth keeping: gating
`RoutineMemberList`'s Escape rung on focus would **break** it (nothing in its candidate
list ever takes focus, so the rung would decline and the plate would close instead);
`focusFilterOnSlash`'s bare-`ctrlKey` test mirrors the already-shipped
`settings-shell.tsx` predicate and the `keys.ts` MOD rule governs the binding registry,
not ad-hoc handlers; and `focusId` not scrolling its row into view is unreachable until
the doors are retargeted, which is the wiring this phase still owes.

**A hazard that turned out not to exist, recorded so nobody re-derives the fear.**
Radix's `Tabs.Content` renders `{present && children}`: the panel element exists for
every section but only the ACTIVE one has a subtree. Probed, not assumed — a render of
the plate finds one `organize-list`, one filter field, and five panels with zero
children. So no `data-testid` is duplicated and Playwright strict mode has nothing to
trip on. Two consequences worth knowing: switching sections **unmounts** the outgoing one
(filter text and half-typed drafts clear, which is the behaviour we want), and adding
`forceMount` later to preserve scroll would flip all of this — which is why the Escape
rungs and the `/` handler are scoped to `[data-state="active"]` even though nothing
requires it today.

### Phase 3 — Labels get depth, and the filter

Absorb `EditProjectDialog` into the project detail and **delete it**, ending a
modal-inside-a-modal. Convert its buffered `Cancel`/`Save Changes` contract to the
console's single save rule — **discrete controls patch live, every text and number input
buffers on blur and Enter** — which specifically protects the custom-minutes field. Add
item-type `label`/`labelPlural` editing (`updateItemType` has always supported it; the UI
only ever offered create/recolour/delete, so nobody can fix an irregular plural), and make
slug validation **speak** instead of silently disabling a button.

**Section filter** (decision 6): one field at the top of the list column, filtering the
**current section only**, placeholder naming the scope (`Filter projects…`), `/` and `⌘F`
to focus, `↓` onto the first match, and rung 2 of the Escape ladder to clear.

*Gate:* a new `tests/e2e/organize.spec.ts` covering the projects/types/groups half — the
coverage that half has never had. Release note: the project time block loses its `Cancel`;
the net is `⌘Z` plus the undo toast, which the buffered form never offered.

### Phase 4 — Trash

`lib/db.ts` gains `listDeleted(userId)` — a union over `items`, `projects`, `habit_groups`,
`routines`, `programs` where `deleted_at is not null`, ordered desc, capped. The `restore*`
functions already exist and finally get a second consumer, but they only clear `deleted_at`
in the DB, so each needs a **restore-and-reinsert store action stamping its own history
label** (decision 3: restore is a normal history entry and `⌘Z` re-deletes it) — without
that a restored routine is invisible until reload. Trash rows live in a **local hook, not
`planner-store`**, so the bin never enters an undo snapshot.

`packages/types` gains `deletedAt?: string` as **OPTIONAL**, then
`pnpm --filter @anchor-app/types build` with the **`dist/` committed in the same commit** —
CI fails on drift and the plugin `safeParse`s and throws.

Add the door: `Recently deleted` at the foot of the user-card history popover.

*Gate:* delete → find in Trash → restore → the row is back on the canvas without a reload,
and `⌘Z` re-deletes it.

### Phase 5 — Routine correctness and reach

Each item independently revertable.
(a) **Pause-until** — wire `setRoutinePaused`'s third argument.
(b) **The effective-state note and `IN N PROGRAMS`** — the highest-value correctness fix.
(c) **Member rows gain the type glyph and the meta column.**
(d) **Member picker rewrite** — browse on an empty query, ↑/↓ + ↵ with a visible cursor,
stays open after an add, and a `Nothing matches` row *inside* the list so arrow keys keep
meaning something.

*Gate:* an E2E case asserting the console and the ScopeRail agree about the same routine,
plus the focus-return case (open a row's delete confirm, Escape, assert the row still holds
the cursor) — the most commonly broken thing in web consoles and the most felt.

### Phase 6 — Seed defaults on first run *(decision 2)*

`DEFAULT_PROJECTS` and `DEFAULT_HABIT_GROUPS` are declared at `lib/planner-types.ts:87-97`
and **imported nowhere**, so a brand-new user opens a six-section console containing
nothing. They are also **stale in format** — bare emoji (`💼`, `🧘`) from before the
`icon:PascalName` token system; they need `makeIconToken` values before use.

Seeds must be named after real behaviour, fully deletable, and created through the normal
store actions so they are undoable like anything else.

---

## Empty states

**Law: the empty and populated states are the same layout with rows missing.** The list
head, the create row and the plate never change shape, so creating the first object never
makes the pane jump. No centered spot illustration, no dashed drop zone, no vertically
centered card in a void.

**The empty detail is the permanent home for the entity definitions.** Today those two
sentences live only in an empty state and vanish the moment one container exists, taking
the only in-app explanation of what a routine or a program *is* with them.

- Routines — `A routine groups items you want to pause together.` *(verbatim)*
- Programs — `A program is a stretch of life — a summer, a term — that switches whole routines on and off.` *(verbatim)*
- Projects — `Projects file your tasks, and can carry a repeating block on the grid.`
- Item types — `Custom types work like tasks — they get their own tab in the add dialog and their own section in Beacon's context.` *(verbatim)*
- Habit groups — `Habit groups decide how your habits are stacked in the sidebar.`
- Trash — `Anything you delete waits here for 30 days, then goes for good.`

**Copy law, throughout:** always an article + name — `your Summer term program`, never a
bare `Program`. `Program` is entity-only vocabulary; grid-side names (`isScheduled`,
`scheduleTask`, `ScheduleBlock`, "Add to schedule") never adopt it.
