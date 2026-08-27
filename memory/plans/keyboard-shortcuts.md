# Keyboard shortcuts — one record set, two shells

Direction C, chosen by Kirby 2026-08-27, ticket D2 ("modal vs settings pane"). The
question was where the shortcuts table LIVES, and the answer is: in neither place
exclusively. The bindings are **settings records** in `lib/settings/manifest.ts`, and
**⌘/ renders those same records in a dialog over your work**. One derivation, two
chromes — the arrangement `components/sidebar/omnibar.tsx` already has with its
`variant: 'dock' | 'launcher'`.

## What was there before, and what was wrong with it

The table already existed twice over, in the sense that matters:

- `components/planner/keyboard-shortcuts-modal.tsx` was a hand-built dialog that read
  `DEFAULT_SHORTCUTS` and rendered its own rows, its own grouping, its own recorder and
  its own reset.
- `/settings/keyboard` was **a room whose only furniture was a door**: one `action`
  record, `keys.shortcuts`, whose `write()` opened that dialog. The rail advertised a
  pane; the pane advertised a button; the button opened a modal.

So the bindings were the only part of Anchor's configuration that search could not find,
that `?focus=` could not deep-link, that had no per-row reset and no modified marker, and
that you could only look at from inside something summoned. Every one of those is
machinery the settings surface already has and hands to any record that asks.

## Locked decisions

1. **The seam is `DEFAULT_SHORTCUTS`, and it is the only one.** The chain is
   `lib/commands/registry.ts` (a command owns its binding; `SHELL_SHORTCUTS` owns the two
   the registry can't, because they act on the hovered item) → `DEFAULT_SHORTCUTS` in
   `lib/keyboard-shortcuts-store.ts` (the list the keydown dispatcher reads and the list a
   user's rebinding is keyed against) → `SHORTCUT_RECORDS` in the settings manifest, which
   maps 1:1 over it and adds no keys, no ids and no labels of its own.

   **Refuted: deriving the records straight from `STATIC_COMMANDS`.** It reads more
   directly, and it silently drops `SHELL_SHORTCUTS` — the two bindings with no command —
   and it makes the manifest a SECOND derivation of the binding list, which is the exact
   duplication the ticket forbids. `tests/unit/shortcut-records.test.tsx` asserts same ids,
   same order, so a hand-typed copy cannot creep back in.

   **Refuted: moving `DEFAULT_SHORTCUTS` into the manifest.** `hooks/use-command-shortcuts.ts`
   would then drag every store in the app into the keydown path, and the store's `migrate`
   needs the list at module init. The arrow stays manifest → store → registry, which is
   also what keeps the graph acyclic.

2. **A binding IS a setting, with a `keys` control.** New `ControlKind`, rendered by
   `components/settings/keys-control.tsx` through the ordinary `SettingRow`. That single
   decision is what buys, with no new code: search across label/description/keywords, the
   `?focus=keys.undo` deep link with its scroll-and-ring, the lime modified bar, per-row
   reset, and the `data-setting-row` handle every e2e selector already uses.

3. **The value travels as one encoded string, space-separated.** `read`/`write` are
   `string | boolean`, so a chord has to encode. **Not `'+'`**: `'+'` is itself a
   recordable key — ⌘+ arrives as `['+','mod']`, because `isShiftProducedSymbol` keeps
   `shift` off it — so joining on it makes that one binding un-splittable and silently
   unbindable. A space cannot collide, because the space bar normalizes to the token
   `'space'`. `encodeKeys` also NORMALIZES (ctrl/meta → `mod`) and orders, so
   `['meta','k']`, `['ctrl','k']` and the sorted `['k','mod']` a recorder produces all
   encode alike — which is what makes `isModified`'s plain `read() !== defaultValue` an
   honest answer rather than a platform artefact.

4. **The record id is `keys.<shortcutId>`, verbatim.** The shortcut id is already
   permanent (it is the key a rebinding is persisted under, and `commands.test.ts` freezes
   the list exhaustively), and a settings id is permanent too. Reusing it means the two
   cannot drift. **Refuted: camel-casing it into `keys.newTask`** — that is a second name
   for one thing, produced by a transform that can collide (`new_task` and `newTask` both
   map to it). The structural id test in `settings-manifest.test.ts` grew a third
   documented shape instead; underscores are admitted for `keys.*` and nowhere else.

5. **Reset REMOVES the override; it never stores a copy of the default.** New
   `resetShortcut(id)` on the store. Writing today's default back pins the user to it: the
   day a release moves ⌘/ somewhere better, everyone who ever pressed reset silently keeps
   the old key, with no override visible anywhere to explain why.

6. **A binding that only works somewhere says so.** `CommandShortcutSpec.context` — one
   sentence, declared beside the binding — appended to the record's description. Six
   bindings carry one: three week-column ones, two desktop-only sidebars, the item-panel
   focus, plus the two hovered-item shell bindings. `availableWhen`/`hidden` already encode
   the same facts, but they are PREDICATES over live state: they can grey a palette row
   and they cannot be rendered as prose. Absent means "works anywhere", and that has to
   stay the common case or the qualification stops meaning anything. It goes in the
   description rather than in a decoration because the description is INDEXED — which is
   how "hovered" now finds ⌫.

7. **Grouping is shared, not per-shell.** `SHORTCUT_SECTIONS` is computed once from the
   binding's `groupHeading` in first-appearance order — registry order, which is the order
   the palette lists the same commands in. Both shells render it. Two shells that grouped
   the same set differently would be the disagreement this ticket exists to remove.

8. **The overlay is the same component in a different shell.**
   `components/settings/shortcuts-panel.tsx` takes `variant: 'pane' | 'overlay'` and is
   rendered by the Keyboard settings pane and by the ⌘/ dialog. What reads off `variant`:
   who owns the height (the pane scrolls the DOCUMENT — settings-shell's standing rule —
   while the overlay's shell supplies a **plain `overflow-y-auto` box**, because
   `<ScrollArea>` silently drops `max-h`), where the reset-all button sits (end of the
   list vs. the dialog's pinned footer, one component either way), and the bare-key claim
   below. Everything else is shared. The panel exposes `data-shortcuts-variant`, for the
   same reason the omnibar exposes `data-omnibar-variant`: both shells share every other
   handle, and on /settings a search-result row and a panel row are the same component.

9. **The overlay claims the bare-key space; the pane does not.** `data-keys-local="true"`
   (see `hooks/use-command-shortcuts.ts` and `memory/plans/organize-console.md`). A surface
   built out of `<button>`s is not "typing" by the dispatcher's `isFocusedOnInput` test, so
   from a focused row `n` would open the add dialog and REPLACE the overlay in the single
   `ActiveDialog` slot, and `⌫` would delete whatever the canvas still thinks is hovered.
   The pane must NOT claim it: /settings mounts no global dispatcher, and its own `/`
   search binding is something you still want.

10. **NOT gated by the extension registry.** Read `lib/extension-gates.ts` and the answer
    falls out of its own contract, which is "off means inert, but still findable" and
    "every gate removes a LAYER OVER items, never an item". A shortcuts table is not a
    layer over anything — the dispatcher runs the bindings whatever the surface does. So a
    gate could only take one of two shapes, and both are wrong: gate the SURFACE and you
    get a keyboard you can neither see nor change while it keeps firing; gate the
    DISPATCHER too and a settings switch can turn off ⌘K, ⌘Z and ⌘,, which is the app's
    chrome — and the switch that turns it back on is reached through that chrome. There is
    also a structural reason: extension panes are GENERATED from the catalog and live one
    level below `extensions`, while `keyboard` is one of the seven fixed rail entries, so
    making it an extension would move the map entry as a side effect.

11. **⌘/ was already ours, and stays.** Verified against the real table rather than
    assumed: `system_shortcuts` is the only binding whose normalized chord is `mod+/`, and
    the bare `?` that `report_bug` owns is a different chord despite looking adjacent on a
    US layout (one carries a real modifier, one does not). `commands.test.ts` already
    forbids two bindings sharing a normalized combination; the new suite pins the ownership
    by name as well.

## Defects found and fixed along the way

- **Every rebound shortcut rendered backwards.** `pressedKeys` sorts alphabetically —
  that is what makes `matchesBinding` a cheap element-wise compare — so ⌘K comes back as
  `['k','mod']` and `formatKeys` printed "K + ⌘". It affected the shortcuts table AND the
  omnibar's palette hints, and ONLY for shortcuts someone had actually changed, which is
  why the authored defaults made it look fine. Ordering now lives inside `formatKeys`
  (`orderKeys`), so both renderers get it and a third cannot drift.
- **Escape was a bindable key.** Recording had no cancel: pressing Escape stored
  `['escape']`, binding a key nothing should be bound to and leaving the recorder with no
  way out that was not clicking elsewhere.
- **The resting shortcuts button printed a literal `⌘ + /`.** Rebind `system_shortcuts`
  and the one control whose entire job is to say what the key is starts lying. It reads
  `useShortcutKeys('system_shortcuts')` now.
- **`aria-labelledby` pointed at ids with spaces in them.** It takes a space-separated
  LIST, so "Rituals & Beacon" would have been read as three ids, none of which exists, and
  the section would have had no accessible name at all. Headings are slugged.
- **The conflict message was a live region created in the same commit as its text**,
  which is the classic way a polite announcement is dropped. It is present and empty from
  first paint.
- **The conflict check depended on its caller's key order.** `matchesBinding` requires its
  left side sorted (a contract inherited from `pressedKeys`); the extracted `rejectionFor`
  normalizes its own input, after the macOS-Control test rather than before it —
  `normalizeBinding` folds `ctrl` into `mod`, which would erase the very thing that test
  looks for.

## What this removed

`/settings` no longer mounts the shortcuts modal at all, so the route's two-modal
`next/dynamic` split is down to one (the bug report). That is a better outcome than
deferring it: the pane renders the records itself, and the same table is still summonable
over the planner from the shell that mounts it there. The overlay carries an "Open in
settings" link, because the two shells are not interchangeable — one is summoned over your
work, the other is a page you can link, search and bookmark.

## Ledger

- [x] **Shipped 2026-08-27.** `SHORTCUT_RECORDS` / `SHORTCUT_SECTIONS` /
      `SHORTCUT_ONLY_CTX` in the manifest; `keys` control kind + `keys-control.tsx`;
      `shortcuts-panel.tsx` with `variant`; the ⌘/ dialog rewritten as a shell over it;
      `encodeKeys`/`decodeKeys`/`orderKeys` in `lib/commands/keys.ts`;
      `resetShortcut`/`shortcutKeysFor`/`useShortcutKeys` on the store;
      `CommandShortcutSpec.context` on six bindings and both shell shortcuts.
      51 new unit tests (`tests/unit/shortcut-records.test.tsx`); every load-bearing claim
      above was mutation-checked red before the PR.

## If you touch this next

- Adding a shortcut is still adding `shortcut: { id, keys }` to a command in
  `lib/commands/registry.ts`. Nothing here needs editing, and a record appears in the
  Keyboard pane and in ⌘/ the same commit. Add a `context` sentence if it does not work
  everywhere.
- Never rename a shortcut id. It is now BOTH the persistence key for a rebinding and the
  second half of a permanent settings id, so a rename discards the user's binding and
  breaks every deep link to it at once.
- A dynamically derived command must never own a shortcut (`commands.test.ts` enforces
  it). It would now strand a settings record as well as an override.
