# Item surface growth — dialog → panel → page

Direction approved 2026-07-29. Design study (interactive scrim/position lab + specimens):
https://claude.ai/code/artifact/78950192-5a7b-4ce8-93ad-2f9f6add5703

The item surface grows in place rather than multiplying: the capture dialog stays a
two-second command, a right-docked panel becomes edit's home, and a full page carries the
item when it is the day's actual work (subtasks, activity, an agent's running progress).
All three sizes render the same `ItemDialogState` and write through the same save
adapters — growth is a presentation, not a fork.

## Locked decisions

1. **Frost scrim (on trial, 2026-07-29).** Dialog + drawer overlays:
   `bg-scrim backdrop-blur-[7px] backdrop-saturate-[1.1]`, where `--scrim` is only a
   faint ink-hued tint (light `oklch(0.22 0.012 272 / 12%)`, dark `oklch(0 0 0 / 30%)`).
   **AlertDialog keeps `bg-black/50`** — destructive confirms earn the heavier curtain.
   Watch-points: compositing cost over the fit-to-height grid, and the vaul drawer
   animating under live blur on mobile. If it janks, the previously-shipped self-veil
   values are the fallback: light `color-mix(in oklab, var(--paper-0) 55%, transparent)`,
   dark `oklch(0.13 0.008 264 / 55%)`, no backdrop-filter.
2. **Capture at the top.** The item dialog sits at `top-[14vh]` (className override on
   ResponsiveModalContent; tailwind-merge drops the primitive's centered pair). Mobile
   drawer unaffected.
3. **Edit's eventual home is the panel** — right-docked over the canvas, no scrim; the
   page (`/item/[id]`) is for deliberate sessions and is deep-linkable so Beacon can
   answer with a URL. Until the panel ships, edit stays in the dialog.
4. **Identity is a square, a value is a dot.** Type/container color squares come from
   `ItemTypeConfig.accent` / `getProjectColor` / `getHabitGroupColor`; user-chosen colors
   are `var(--accent-N)` tokens picked via `ColorSwatchPicker` ("Auto" = clear → name-hash).
5. **Registry gates the new sections as config, not code paths** — capability flags
   (`subtasks`, `agentAssignable`) join the existing capability list.
6. **Contracts carried from unified-items.md:** any new item field lands in
   `packages/types` first, *optional*, then its committed dist is rebuilt (the OpenClaw
   plugin safeParses and throws on drift; CI gates dist-matches-src). New webhook event
   names silently never deliver — agent progress rides `tasks.updated` or extends the
   plugin registration *and* `AnchorChangeEventSchema` in lockstep.

## Phase ledger

- [x] **Phase 0 — Scrim, placement, category color** (shipped 2026-07-29).
      `--scrim` token + `bg-scrim` on dialog/drawer overlays; item dialog `top-[14vh]`,
      `max-h-[80vh]`; `Project.color` plumbed end-to-end (schema → db.ts → store, stored
      color wins over name-hash in `getProjectColor`); `ColorSwatchPicker` rows in all
      three manage-categories tabs (projects / groups / types — the latter two were
      already plumbed, only the UI was missing).
- [x] **Phase 1 — The panel** (shipped 2026-07-29). Edit mode of the item dialog is the
      right-docked panel: a className override on ResponsiveModalContent
      (`inset-y-3 right-3 …` — tailwind-merge drops the centered base) plus a new
      `overlayClassName` passthrough (dialog.tsx → responsive-modal) that makes the
      panel's scrim transparent. Add mode stays the top-[14vh] dialog. Overlays the
      canvas — no reflow, fit-to-height untouched. Mobile keeps the bottom drawer.
      New ⤢ "open as page" button in the edit header.
- [x] **Phase 2 — Subtasks** (shipped 2026-07-29). Four fields woken end-to-end:
      `taskShape` (optional → auto-enrolls TASK_FIELDS → undo diffing) → dist → db.ts
      (ItemRow, three mappers, task update allowlist) → registry `subtasks` flag →
      SubtasksSection in `item-detail-sections.tsx`. Subtasks are excluded from the
      `tasks` projection (invisible in braindump/buckets/schedule/EOD); `items[]` still
      carries them. Parent delete cascades (explicit soft-delete of children).
- [x] **Phase 3 — Activity** (shipped 2026-07-29). Migration **023_item_events** applied
      remotely and ledger-aligned to version `023`. Write-through in db.ts
      create/update/delete (fire-and-forget; availability flag goes quiet if the table
      is missing). ActivitySection renders the last events, hidden when empty.
      Known gap: `set_item_completion` RPC bypasses updateItem — completion toggles
      produce no events yet.
- [x] **Phase 4 — Agent assignment** (shipped 2026-07-29, transport-lite).
      `assignee`/`aiStatus`/`aiResult` live end-to-end; AgentSection assigns/unassigns
      (honey styling); agents can PATCH them via the task update API (aiStatus strictly
      `queued|working|done|failed` on writes, loose on reads so future vocabulary can't
      brick old plugin parses). No push transport: progress lands when the agent PATCHes
      and the app refetches.
- [x] **Phase 5 — Per-item threads** (shipped 2026-07-29, client-persisted).
      chat-store is now a factory: `itemChatStore(id)` gives each item its own transcript
      (`anchor-item-chat-<id>`, 24h TTL) and OpenClaw sessionKey (`anchor-item-<id>` —
      the plugin passes client sessionKeys through verbatim, zero plugin changes).
      `buildAnchorContext` gained `focusItemId` (a "### Focused item" section; base
      output byte-identical). Server-side thread persistence deliberately deferred.
- [x] **Phase 6 — The page** (shipped 2026-07-29). `/item/[id]`: client route, static
      chips + ItemDetailSections | ItemThread columns, Edit opens a locally-mounted
      ItemDialog (the shell's instance lives in AppShell, which this route doesn't
      render). Client-side auth model, sign-in link on the not-found state.
- [x] **Phase 7 — Notes** (shipped 2026-07-30). `notes` had existed in
      `packages/types`, the db mappers, the update API and the Beacon context since
      unification, with **no UI anywhere** — the same dormant-column shape as Phase 2's
      four. Added to `ItemDraft` (seed, carry-across-type-switch, all four save adapters)
      as a borderless auto-growing textarea under the chips, plus a read-only rendering
      on `/item/[id]`. `TASK_FIELDS`/`HABIT_FIELDS` are schema-derived, so
      `config.fields.includes('notes')` gated it with zero registry work. The focused-item
      context line moved out of the non-habit branch: habits carry notes too.
- [x] **Phase 8 — The non-modal panel** (shipped 2026-07-30). Desktop edit is a bare
      `<aside>` laid out as a THIRD FLEX SIBLING after `<main>` in `desktop-shell.tsx`, in
      a wrapper whose width animates 0↔420px — so opening it **compresses** the canvas
      instead of covering it (the braindump collapse is the same mechanic). Under 1180px
      the wrapper goes `absolute` and overlays instead: there is no day left worth
      compressing once panes cross the ~200px wrap threshold. Mobile keeps the drawer;
      add stays the top-[14vh] modal. `ItemDialog` gained `presentation: 'modal' | 'panel'`
      and three wrapper components (`SurfaceRoot`/`SurfaceContent`/`SurfaceHeader`) that
      swap Radix for the `<aside>` while the body JSX stays shared — the split is at the
      wrapper, so growth stayed a presentation and not a fork. Deliberately **not**
      `role="dialog"`. `/item/[id]`'s Edit uses the panel too (a modal there made the
      page's own subtasks and thread inert behind an invisible overlay).

      **Selection is the ui-store's dialog slot.** No new selection store: `openEditFor`
      already replaces the single `activeDialog`, so clicking another row retargets the
      one panel for free. The slot's payload is now only an ADDRESS — the surface
      re-resolves the item from the store every render and re-seeds the draft only when
      the **id** changes (identity would re-seed on the panel's own autosave and eat
      keystrokes). When the item moves under an open panel and nothing is queued, the
      draft follows it.

      **Autosave, and why it is scoped.** No Save button (the footer button is "Done").
      Picked values commit after 500ms; typed ones (title/notes) commit on blur with a
      4s backstop, because *every* commit that changes anything pushes a deep clone of
      the whole `items` array onto a 50-entry undo stack — a save per typing pause would
      spend a session's history recording one sentence. Writes carry **only the fields
      touched in this panel session** (`taskUpdatesFromDraft`/`habitUpdatesFromDraft`,
      pinned in tests/unit/item-panel-writes.test.ts). That is the load-bearing rule: the
      canvas behind the panel is live, so a whole-item write would silently revert a drag,
      a resize, an undo or an agent write on the next keystroke. The modal passes
      `DRAFT_KEYS` and keeps its original whole-item save.

## Deferred decisions (made provisionally 2026-07-29 — revisit)

1. **`aiStatus` vocabulary** — `queued | working | done | failed`, enforced only on agent
   writes. Becomes a frozen external contract the moment a real agent writes it.
2. **Subtasks are invisible outside their parent** — excluded from the `tasks`
   projection wholesale. "Schedule a subtask on the grid" is explicitly out; revisit if
   wanted. They DO still appear as plain tasks in the agent context `tasks[]` (items[]
   carries `parentItemId` for smarter clients).
3. **Subtask ordering** — creation order (`created_at`), no manual reorder.
4. **Parent delete cascades to subtasks** (explicit soft-delete; undo restores both).
5. ~~**The edit panel is modal**~~ — **resolved 2026-07-30, Phase 8**: it is non-modal and
   compresses the canvas. What that cost: autosave (no moment of commitment), scoped
   writes (the canvas can change the open item), a live-following draft, and Escape that
   only claims the key from inside the panel.
6. **Assign-to-agent writes fields only** — it does not notify OpenClaw; the thread is
   how you brief it. Real dispatch needs a transport decision (locked decision 6).
7. **Threads are localStorage-only** (24h TTL, per item). `item_messages` server
   persistence deferred — first stored chat data deserves its own review.
8. **Legacy projections now carry the four fields when set** (rest-spread projections).
   Additive-optional, old plugins strip unknown keys; if byte-exactness must return, the
   projections become pick-lists. Note: the agent-context `tasks[]` includes subtasks as
   ordinary tasks (the plugin can't distinguish them without adopting `items[]`).
9. **Subtask display order can shuffle across reloads** — subtasks inherit
   `order = tasks.length` (a projection that excludes them), so their order values can
   collide and `fetchItems`' order-then-created_at sort may differ from append order.
   Harmless to visible tasks (reorderTasks skips them); fix together with #3 if manual
   subtask reordering ever lands.
10. **Completion toggles produce no activity events** — `set_item_completion` (RPC)
    bypasses updateItem. Additive fix later: record the event beside the RPC call.

- [x] **Phase 9 — Cheap wins** (shipped 2026-07-30).
      `aiStatus` gains **`blocked`** — a state that wants something *from* you, added
      while the vocabulary is still free (an independently-deployed agent writing it makes
      renaming a coordinated release; growing the set stays cheap forever). It gets the
      only loud chip in the agent block. Thread transcripts are capped at 100 messages and
      swept at boot — the 24h TTL only ran when a thread was *opened*, so threads for
      items you never revisit accumulated forever against an origin quota eight other
      stores share. `inert` on `<main>` while the panel overlays it (under 1180px), via a
      new `useMediaQuery` on `useSyncExternalStore` — a class can't drive an attribute.
      **⌘\\** focuses the panel (`workspace.focusItemPanel`, a ui-store focus token like
      the omnibar's), which is the keyboard's only way in given the panel deliberately
      never steals focus.

## Open after Phase 8 (2026-07-30)

- ~~Keyboard reach~~ / ~~inert~~ — closed the same day, see Phase 9.
- **No focus restoration when the panel unmounts.** Radix's FocusScope used to return
  focus on close; the `<aside>` drops it to `<body>`, so Tab restarts at the top of the
  document.
- **Escape during a pointer drag** can close the panel (dnd-kit cancels the drag without
  `preventDefault`, and focus is often `<body>`). Cosmetic; noted so it isn't rediscovered.
- **No drop shadow on the panel card** — the animating column has to clip, which would eat
  an outer cast. The border carries the edge. Revisit if it reads flat beside `<main>`.
- **Undo of an autosave is per-commit, not per-session.** Undo after a chip pick restores
  the pre-pick snapshot; there is no "undo everything I did in this panel".

## Review (2026-07-29)

Adversarially reviewed (3-agent pass + build gate) after the initial build; all
confirmed findings fixed in the same session: DB-layer subtask delete cascade (agent
deletes no longer orphan children), `validateParentItemId` referential guard on the
agent API (self-parent / cross-tenant / habit-parent / nesting → 400), strict
`parentItemId`/`aiStatus` on TaskCreateSchema, subtask guards in `selectOverdue` and
Beacon's task section, deep-link loading state on /item/[id], Enter-key containment and
scroll containment in the detail sections, provider-switch localStorage sweep for
unopened threads, undefined-safe event payloads. `pnpm build` passes; 241/241 unit
tests including new pins in tests/unit/item-growth.test.ts.

## Review (2026-07-30, Phases 7–8)

Four review lenses (data loss / layout / a11y / contracts), each finding adversarially
refuted by an independent agent. What survived and was fixed:

- **Whole-item writes reverted the live canvas** — the defect the non-modal design
  creates and the reason `commitEdit` is now key-scoped. Reachable by dragging or
  resizing the open item, or by pressing ⌘Z, and then touching anything in the panel.
- **`d.startTime !== live.startTime` compared `''` to `undefined`**, so the scheduling
  second pass fired on every save for every bucket-only task — one phantom
  `Updated startTime` activity row per chip click, in the feed the panel itself renders.
- **The habit branch had no equality guard at all**: `scheduleHabit` ran on every commit
  on top of `updateHabit`, doubling every habit write.
- **"Done" committed unconditionally** after the timer had already committed.
- **A deleted item left the panel open**, reporting saves that `updateItemAction` was
  silently dropping.
- **`/item/[id]`'s Edit opened a modal**, making the page's own subtasks and thread inert
  behind an overlay whose tint edit mode removes — dead controls, nothing to explain why.
- **Enter cancelled every button's activation** inside the surface (`preventDefault` on
  the bubbled keydown), so keyboard users got a save instead of the chip they pressed.
  Pre-existing in the modal; the panel made it reachable.
- **Escape closed the panel from anywhere**, including out of the braindump or the chat
  composer.
- **Two `ml-auto` siblings** split the free space and parked the header buttons mid-row.
- **Habit notes reached no AI context** — the focused-item line sat inside the non-habit
  branch while the panel renders the field for habits.

Refuted and left alone: a claimed lost-note race on dialog-slot swap (blur flushes first),
and a claimed Escape collision with the delete confirm (Radix `DismissableLayer`
`preventDefault`s on document capture, before the panel's window listener).

Verified: 304/304 unit (6 new in tests/unit/item-panel-writes.test.ts), lint 0 errors,
`pnpm build` clean, and the e2e specs that touch the surface — smoke, task-dates, omnibar,
habits, undo-redo — plus three new ones in tests/e2e/item-panel.spec.ts covering the notes
round-trip through autosave, the canvas staying operable behind the panel, and retargeting.
