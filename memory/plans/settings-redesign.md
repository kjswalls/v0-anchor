# Settings redesign — a route, six panes, one manifest

**Status: built.** The dialog is deleted; `/settings/[[...pane]]` is live.

## Why

The old `components/planner/settings-dialog.tsx` was 712 lines and 32 rows, and
**twelve of those rows did nothing**: three `useState` fakes behind "Coming soon"
badges, four confirmed-dead DB columns, one describing a cron that does not exist,
one the app overwrote behind your back. The overwhelm was a content problem wearing
a layout problem's clothes. Deleting the dead half halves the surface before any
layout work happens.

The research that shaped the rest is in the design panel; the one finding that
changed the plan: **settings search is an architecture decision, not a UI one.**
VS Code can filter, count, tag, reset and deep-link every setting because each one
is a record; Slack and Notion cannot search theirs because theirs are markup. That
is why `lib/settings/manifest.ts` exists and why it landed before any pixels.

macOS Ventura is the counter-example held in mind throughout: Apple moved System
Preferences into exactly the sidebar shell proposed here **without re-architecting
the taxonomy**, and it got worse.

## Shape

```
/settings              → redirects to /settings/day
/settings/[pane]       → day · look · rituals · beacon · keyboard · dsul
/settings/look?focus=look.buckets   → deep-links one control
```

- `lib/settings/manifest.ts` — ~24 records + 6 destinations. Records read and write
  through the **existing** store setters; the file adds no export to
  `lib/settings-service.ts` (seven unit files stub that module with a shim
  exporting only `saveSettings`, and would fail at import time).
- `lib/settings/search.ts` — wraps `lib/commands/score.ts` unchanged, adding field
  multipliers, term-splitting with AND, match ranges for `<mark>` slicing, and a
  one-edit fallback that runs only when the strict pass is empty.
- `components/settings/` — shell (rail + search + filtered mode), row, preview.
- `app/settings/[[...pane]]/page.tsx` — the route and the four things AppShell was
  doing for free.

## Decisions that are load-bearing

**Six panes is a budget, and the escape valve is a mechanism, not a promise.**
The index carries a second record kind — `DESTINATIONS`, pointing at surfaces
deliberately *not* in settings (projects, groups, item types, routines, programs,
Connect OpenClaw). Typing `program` answers correctly without any of them earning a
row. **The next class of configuration earns a destination record and a manager
surface, not a seventh pane.**

**The three "hide completed" flags were NOT merged.** An early draft collapsed
`showCompletedTasks` and the two `hideCompleted` filter-popover flags into one
account setting. They are not one question — the braindump is exactly where you
want finished items visible while triaging — and rerouting them would have changed
what `settings.spec.ts` exercises on a shared serial-mode e2e user. Search returns
all three with their scope stated in the copy instead.

**`scheduleMarkStyle` was kept.** A draft retired it on the grounds that
week-schedule ignores it. It does not: week renders the same exported
`ScheduleBlock`, which reads the store itself. There was no inconsistency to fix.

**The palette is not yet generated from the manifest.** The `settings.*` command
group owns keyboard shortcuts and a globally-unique alias namespace guarded by an
exhaustive test (`commands.test.ts` asserts 17 shortcut ids and fails on any
addition). Unifying them is a separate change. `tests/unit/settings-manifest.test.ts`
asserts the two cannot drift into an alias collision meanwhile — and it caught one
immediately (`eod`), which is now a keyword rather than an alias.

## What a route costs, and what was done about it

| Lost with AppShell | Replicated in the route |
|---|---|
| `pagehide → flushSettings()` | listener **and** an unmount flush — soft navigation fires no `pagehide` at all, so leaving via the breadcrumb inside the 500ms debounce would silently drop the patch |
| `<html data-type-mode>` stamp | same effect; without it Typeface saves and changes nothing |
| ConfirmDialog / shortcuts / bug-report mounts | mounted locally; dispatching through `ui-store` would set state nothing renders |
| the hydration window | gated on `settingsHydratedUserId === userId`, not `!isLoading` |

**Fixed for free:** the pane scrolls the document — no `overflow-y-auto`, no
`<ScrollArea>` — which closes **#92** rather than re-fixing it.

**Fixed on the way:** the old `SettingRow` rendered a `<Label>` with no `htmlFor`
and a description with no `aria-describedby`, so every switch in the dialog was
nameless to assistive tech. `PropertyChip` gained optional `id` / `ariaLabel` for
the same reason — an enum row's visible text is its *value*, so the name has to be
supplied.

## Deliberately left alone

Compact mode, chill mode, morning-check time, default view, `right_sidebar_hover`,
`assistantName`. Their columns, setters and persisted values are untouched, per
CLAUDE.md — they are simply not in the manifest, which is what stops search
deep-linking to a control that does nothing. Two settings the registry comment
calls dead are **not**: `showCurrentTimeIndicator` (read by day- and week-schedule)
and `systemPrompt` (read by `chat-store.ts:183`). Both are surfaced.

The features behind the deleted fakes are tracked in
[deferred-settings-features.md](deferred-settings-features.md), which also records
a bug found while auditing them: **`vercel.json` is `{}`, so the EOD notification
cron has never fired.**

## What the adversarial review caught

Fifteen distinct defects survived verification. The ones worth remembering:

- **The `?focus=` effect destroyed its own highlight.** Stripping the query param
  re-rendered with `focusId` undefined, which changed the effect's deps and ran the
  cleanup that cancelled the ring it had just scheduled. Timers now live in refs and
  are cleared only on unmount, with a ref guarding re-arrival.
- **A deep link to an advanced row silently did nothing** — the row isn't in the DOM
  until its disclosure is open. The effect opens it first and returns on the next commit.
- **The Keyboard pane was empty on every phone.** Its only record was `desktopOnly`,
  and the rail advertised the pane anyway. Root cause removed; the "no empty rooms"
  test now runs through the real platform filter on both platforms, which is what
  should have caught it (it asserted against raw `SETTINGS`).
- **The advanced escape hatch was unreachable.** "Surfaces when the query hits its
  label exactly" compared the whole label against `terms[0]`, and `terms` is split on
  whitespace — so it could never fire for 7 of the 8 advanced labels.
- **`dependsOn` was resolved one level deep**, leaving `Clear after` live and writable
  when its grandparent morning check was off. It walks the chain now, with a cycle stop.
- **The reset confirmation was blanked before it was announced** — it shared a live
  region with the search count, whose effect re-fires on the very store write the
  reset performs. Row actions have their own region.
- **The reset button sat on top of the custom-instructions textarea**, so clicking to
  place a caret wiped the text. On a wide row it parks on the label line.
- **The preview inherited `collapsedBuckets`**, so anyone who had shut Morning on the
  grid opened Look to an empty specimen that no row appeared to change. `BucketCard`
  gained `collapsible`, which neutralises the shared flag rather than just hiding the
  chevron.
- **`usePushSubscription` returned a fresh object every render**, making the route's
  context `useMemo` a no-op — the whole surface re-rendered on every keystroke.
- **`aiTick` collapsed `apiKey` to a set/unset flag**, so replacing one non-empty key
  with another never re-rendered, and the next edit was silently dropped.

One finding was a bad fix on my part, caught by its own test: `matchedValue` should be
shown whenever a value label matched and differs from what's on screen — not only when
the value field outscored every other. The question it answers is "why is this row
here", not "which field won".

## Post-ship refinements

**The theme control never reloaded anything.** Measured, not assumed: zero navigation
events, the window object survives, `<html class>` flips in place. It *looked* like a
reload because next-themes' `disableTransitionOnChange` injected
`transition: none !important` across the document and forced a reflow — a whole-screen
instant repaint is exactly what a page load looks like. Simply dropping that flag would
have been worse (transitions here are property-scoped, so a few elements would animate
while most snapped). `lib/theme-transition.ts` opens a `data-theme-changing` window on
`<html>` for ~180ms and globals.css grants a colour-only transition inside it — never
`all`, which would drag opacity in and fade the lime accent through its parents.
`tests/e2e/settings-page.spec.ts` guards both halves: no navigation, and the class flips.

**The rail is sticky** (`md:sticky md:top-8 md:self-start`). `self-start` is required —
a flex child stretches to the row height by default, and a box as tall as its container
has nothing to stick within.

**Reset sits beside its control.** First attempt reserved a 24px slot in the control
column, which put ~100px of dead air between the button and a 32px switch. The right
answer is a right-packed flex: because items pack to the end, rendering reset *before*
the control doesn't move the control, so there's no hover jitter and no reserved space.

**Enum pickers size to their options.** `PropertyChip`'s default picker is a fixed
240px, which suits the item dialog's project and label lists — long, free text. A
settings enum is three or four known words, so settings pass a `contentClassName` of
`w-auto`, floored at the trigger width. Scoped to settings; the shared default is
untouched.

## Follow-ups

1. Generate the `settings.*` palette commands from the manifest (the guard test is
   already in place).
1. **Default view is settled — last-used wins**, so the row never comes back. What's
   left is deleting `planner-store`'s `defaultView` field, which duplicates `viewMode`
   and has no readers, plus its hydration line in `supabase-provider`. `default_view`
   the *column* stays: it is the cross-device mirror of the last-used view, not a
   preference. See [deferred-settings-features.md](deferred-settings-features.md).
2. Timezone is surfaced read-only — there is no `setUserTimezone` action, only the
   PATCH route plus a `setState` in supabase-provider. Making it editable needs both.
3. The Look preview mounts the real `BucketCard` (safe — no dnd, reads only
   view-store) but hand-builds its rows and schedule slice. `TaskRow` is fully
   live-wired and `BlockCorners`/`HandleGrip` are unexported and `opacity-0` until
   hover, so mounting them would preview the handles setting as a blank rectangle.
   Revisit if those are ever given a read-only mode.
