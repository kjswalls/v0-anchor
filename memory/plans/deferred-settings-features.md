# Deferred settings features — issue drafts

The settings redesign (see [settings-redesign.md](settings-redesign.md)) removes twelve rows
from the settings UI. Most are removed because nothing reads them. **Six of them are removed
because the feature behind them was never built, and we still want it.**

This file holds the issue text for those six, so the intent survives the deletion. Each states
the *real* blocker, verified against the repo — not the row that was standing in for it.

**Filing:** `gh` is not installed on this machine, so these have not been filed yet. Once
`gh auth login` is done against `kjswalls/v0-anchor`, each `##` section below is one issue
(heading = title, body = everything under it).

---

## Item reminders — wire `reminder_at`, which has been unread since migration 007

**Removed row(s):** "Habit reminders", "Task reminders" (both were `useState` behind a disabled
switch, resetting on every dialog open).

### What exists already

- `items.reminder_at timestamptz` — added in `007_future_proofing.sql`, carried through
  `019_unified_items.sql` (lines 64, 132, 143). **Never read by any code.**
- Push delivery works end-to-end: `hooks/use-push-subscription.ts`, the `push_subscriptions`
  table (migration 009), and `app/api/push/`.
- `pg_cron` is enabled and proven in production — `purge-deleted-items` has run daily since
  migration 013, repointed at `items` in 019.

### What's missing

1. Nothing ever *sets* `reminder_at`. There is no UI on the item dialog or the docked panel.
2. Nothing ever *reads* it. No scheduled job scans for due reminders.
3. No per-item reminder policy for recurring items — a habit's reminder has to resolve
   per-date against `completedDates`, not against a scalar.

### Design questions to settle first

- Absolute (`reminder_at`) or relative ("15 min before start")? Scheduled items have a start
  time; braindump items don't, which means a relative-only model can't express a reminder for
  an unscheduled item.
- Does a reminder fire for an item already marked complete? (Almost certainly no.)
- One reminder per item, or many? The column shape says one.

### Settings surface once built

A **Rituals** row: "Item reminders" (master), plus a default lead time. Per-item override lives
on the item, not in settings — configure-from-the-object, per the redesign's own rule.

---

## Sound effects

**Removed row:** "Sound effects" — `useState(false)` behind a disabled switch.

### Reality check

There is **no audio code anywhere in the repo**. This is a from-scratch feature, not a wiring
job. Scope it honestly before committing.

### What it would need

1. An asset set. Completion is the obvious candidate; probably also the EOD review closing and
   a drag-drop settle. Three sounds maximum — a planning app that chirps constantly is worse
   than a silent one.
2. A playback layer that respects the autoplay policy: browsers require a user gesture before
   audio can play, and a PWA restored from a background tab has no gesture. Preload on first
   interaction, not on mount.
3. Coupling to `prefers-reduced-motion`? No — that's the wrong signal. There's no
   `prefers-reduced-sound`, so this needs its own setting and should default **off**.

### Settings surface once built

A **Look** row: "Sound effects", off by default, with a volume chip if there's more than one
sound. Should sit next to Reduce motion — both are sensory-load settings.

---

## Notification preferences — decide what may interrupt, and how

**Removed rows:** the "Notifications" master toggle and its per-kind children.

### Reality check

Push *delivery* works. What doesn't exist is any notion of **what is allowed to notify you**.
Today push has exactly one consumer (the EOD review), so a master switch and three children
were describing a policy layer that has no policies to govern.

This issue is blocked on there being more than one thing that can notify. It unblocks the
moment [Item reminders](#item-reminders) or the morning check lands.

### What it would need

1. A `notification_prefs` shape — per-channel (push / in-app) × per-kind (reminder, morning
   check, EOD review).
2. Quiet hours. This is the one people actually want, and it's the reason the master switch
   felt insufficient in the first place.
3. Honest handling of browser permission state. `use-push-subscription.ts` already models
   unsupported / denied / granted correctly — the prefs UI must not offer a toggle that the
   browser will veto.

### Settings surface once built

A **Rituals** group, not a pane: one row per kind, each with an at-a-glance state dot
(Linear's pattern), plus quiet hours. If it grows past ~6 rows it earns a destination record,
not a seventh pane.

---

## Morning check time — build the morning cron it claims to control

**Removed row:** "Check time" under Daily Reviews.

### Why it was removed

The row's description read "When to send your morning reminder." **There is no morning cron.**
`app/api/cron/` contains only `eod-notify`, and `vercel.json` is `{}`. The value was persisted
to `user_settings.morning_check_time` and read by nothing that schedules anything.

The column and its store field are untouched — restoring the row is one manifest entry once
this issue is done.

### What it would need

1. `app/api/cron/morning-notify/route.ts`, mirroring the existing `eod-notify` route.
2. A schedule that actually invokes it — see the sibling issue below, which is a prerequisite.
3. Per-user timezone resolution. `user_settings.timezone` is synced from the client; the cron
   must bucket users by local time, not fire once at a server hour.
4. A dismissal interlock. `morning_check_dismissed_date` already exists and stops the in-app
   bar reshowing; the notification needs the equivalent so it can't nag after you've dealt
   with it.

---

## Nothing invokes the EOD cron — `vercel.json` is empty

**Not a removed row** — this is the bug found while auditing the ones that were.

### The finding

`app/api/cron/eod-notify/route.ts` exists and is written. `vercel.json` is `{}`. **There is no
`crons` array**, so Vercel has never invoked it. The end-of-day notification has never fired in
production.

The in-app EOD review modal is unaffected — that's client-side and works. Only the *push
notification* half is dead.

### Fix

Either:
- **(a)** add a `crons` entry to `vercel.json` pointing at `/api/cron/eod-notify`; note the
  Hobby-plan limit of one cron per day, which may not be granular enough to serve per-user
  review times, or
- **(b)** schedule it through `pg_cron` + `pg_net` instead, which is already proven in this
  project (`purge-deleted-items`, migration 019 line 260) and has no plan-tier limit.

**(b) is probably right** — it's the same mechanism, it can run every 15 minutes without
burning a Hobby cron slot, and it keeps scheduling next to the data. Whichever is chosen, the
same mechanism should carry the morning check.

Verify the route's auth: a cron endpoint reachable without a shared secret is a public trigger.

---

## Default view — make it authoritative, or delete the column

**Removed row:** "Default view" under Calendar.

### Why it was removed

It doesn't just go unread — **the app overwrites it behind your back.**

- `lib/planner-store.ts:1902-1905` — `setViewMode()` sets `defaultView: viewMode` *and* calls
  `saveSettings(userId, { default_view: viewMode })`.
- `lib/view-store.ts:161` — `setScope()` calls `usePlannerStore.getState().setViewMode(scope)`.

So every flip of the day/week capsule rewrites the stored default. Whatever you picked in
settings survives until the next time you look at a week.

Separately, `adoptedLegacy` is true for every existing user, so `view-store`'s `scope` is the
real startup view regardless of what the column says.

### The decision

Two coherent options, and the current state is neither:

- **(a) Last-used wins.** Delete the setting for good, keep the mirroring, and document that
  Anchor opens where you left off. This is what the app does *today* and it's defensible —
  it's what Things and Notion Calendar do.
- **(b) A real default.** Stop `setScope` from writing `default_view`; have the shell read
  `default_view` on cold start only. Then the settings row means something.

If (b): note WCAG 3.2.2 — changing the setting must **not** switch the view you're currently
looking at. It applies to the next cold start, and the row copy should say so.

---

## Also worth knowing (no issue needed)

These were removed and are **not** coming back — they're recorded here so nobody re-derives
the question:

- **Compact mode**, **Chill mode** — persisted, hydrated, read by nothing. `TaskRow`'s
  `density="compact"` is a literal prop passed by `week-buckets`/`week-schedule`, never
  derived from the flag. Columns and setters stay per the standing rule on deliberately-unread
  settings; the rows do not.
- **`right_sidebar_hover`** — a column with no store field, no setter, no hydration, no reader.
  Leaving it in `settings-service.ts` is free; touching `STABLE_SETTINGS_COLUMNS` is not.
- **`assistantName`** — defaults to `'Beacon'`, read by nothing; chat computes its own display
  name. Wiring it means auditing every hardcoded "Beacon" string.
- **`profile_md`** — onboarding writes it, nothing reads it. The redesign seeds
  `systemPrompt` from it instead, so the text finally reaches `/api/chat`.
