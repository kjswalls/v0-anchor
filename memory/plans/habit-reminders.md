# Habit Reminders — getting a habit actually done, not merely recorded

**Goal:** close the gap between "the habit exists in Anchor" and "the habit happened".
Anchor could already reach a device — migration 009's push subscriptions, the eod-notify
cron — but only ever for one moment a day: the end-of-day review, which fires *after* the
day is decided. This adds the moments that can still change it.

**Status (2026-08-21):** All three tiers shipped. Tiers 2 and 3 are **optional
extensions**, off by default, on the migration-026 `user_extensions` surface. An
adversarial review after Phase 1 produced fourteen fixes, folded in before Phase 3
landed — decisions 9–12 below are its output.

---

## The evidence this is built on, and what it rules out

Worth stating, because several obvious features are deliberately absent and the reasons
are not aesthetic.

1. **Forgetting is rarely the failure mode.** For a daily habit, the usual failure is
   seeing the prompt and dismissing it. Louder and more frequent prompts therefore have a
   low ceiling, and fixed-schedule prompts measurably habituate within weeks. This is why
   the last call is *one differently-framed message* rather than a second copy of the cue.
2. **Context cues beat clock cues.** Habits form by pairing a behavior with a stable
   context, not a time. This is the entire reason `reminder_anchor` exists and why it is
   rendered *into* the notification body rather than stored as metadata.
3. **Implementation intentions** ("when X, I will Y") are among the best-replicated
   effects in the literature. The anchor field is one, written in the user's own words.
4. **Friction dominates motivation.** Marking a habit done from the lock screen without
   opening the app is worth more than any wording change — hence the notification action
   buttons and `/api/reminders/act`.
5. **Self-monitoring and loss aversion work; shame does not.** Punishment reliably teaches
   avoidance *of the punisher*, so a scolding notification trains people to disable
   notifications. See the copy contract in `lib/reminders/copy.ts`, which is enforced by
   test, not by good intentions.

**Ruled out on the evidence, not on taste:** escalating nag sequences; guilt copy;
anything aversive (shock wearables and similar have thin evidence and high abandonment —
they teach people to take the device off).

---

## Locked design decisions

1. **`reminder_time` is a local wall-clock string, never a timestamp.** "07:30, every
   weekday, wherever I am standing" is not an instant. `items.reminder_at` (a timestamptz
   inherited by migration 019 and read by nothing) was deliberately left alone rather than
   reused. The one genuine instant in the feature — `reminder_snooze_until` — *is* a
   timestamptz, because "15 minutes from when I tapped it" really is a duration from a
   moment.
2. **NULL means off.** No `reminder_enabled` companion column. A boolean/time pair has a
   fourth state nothing can render (enabled, no time) and, per-item, thousands of rows to
   keep consistent instead of one.
3. **The reminder never re-derives "does this want doing".** `lib/reminders/due.ts`
   composes `isOpenLoopOn` + `isItemActiveOn` from `lib/active.ts`. A notification about a
   habit the grid has already hidden is not a cosmetic bug — it is the app nagging someone
   about a decision they made.
4. **Stamp before delivering.** The opposite of `/api/cron/eod-notify`, on purpose.
   Deliver-first survives a failed write by re-sending, which is nearly free for a push
   (the tag collapses it) and very much not free once a channel rings a phone or costs
   money. The failure is pointed at the cheaper side: one missed cue, not six calls.
5. **The window clamps at midnight, never wraps.** A wrapping window plus a same-day
   dedupe stamp is a double-send: 23:50 fires and stamps day N; at 00:05 the window is
   still open, the date has rolled, and the cue goes out again for yesterday.
6. **The last call names streak-bearing types only.** Its whole frame is what today's miss
   costs; a dated task has nothing to lose by that argument, and including one turns a
   sharp message back into the generic evening nag.
7. **Channels are declarative and isolated.** A channel is a manifest entry plus a
   `deliver()`. It may not throw to signal failure, and one misconfigured integration can
   never stop the push that has worked every day.
8. **A snooze belongs to a DAY, not just an instant.** `reminder_snooze_until` is
   paired with `reminder_snooze_date`, and a snooze whose day is not today is refused
   and swept. Without that gate a snooze goes stale the moment the user completes the
   habit in the app instead of on the notification — and because a matured snooze
   deliberately bypasses both the day stamp and the window, the stale row would fire at
   the first tick after midnight on the next day the habit is due AND stamp that day,
   suppressing the real cue. It also means a snooze tapped at 23:55 expires rather than
   arriving at 00:10 to credit the wrong day: "in 15 minutes" that late is, in practice,
   "not tonight".
9. **Delivery claims, it does not stamp.** Each cue is taken with a conditional update
   (`reminder_sent_date != today`, or a compare-and-swap on the exact snooze value read),
   and only rows the database actually changed are delivered. A blind write is not
   exclusive: two overlapping ticks — which a slow push endpoint and an at-least-once
   cron make possible — would both succeed and both deliver.
10. **`occursOn` mirrors `deriveDayItems` exactly**, including the rule that a
    date-anchored recurring item with no `startDate` occurs on NO day. Unscheduling a
    recurring task to the braindump produces precisely that row, and the looser reading
    nudged daily about something no view renders.
11. **One user's failure costs only that user.** The per-user loop has an error boundary;
    the route returns 200 with notes rather than 500, which would silently drop everyone
    later in the list.
12. **Secrets never reach the browser.** Non-secret channel config lives in
   `user_extensions.config` (user-readable by RLS); credentials live in `user_secrets`,
   which is service-role only (migration 012's posture). The settings UI shows *set / not
   set*, never the value.

---

## Phase 1 — Tier 1, in-app (shipped)

- **Migration 029.** `items.reminder_time` / `reminder_anchor` / `reminder_sent_date` /
  `reminder_snooze_until`; `user_settings.habit_reminders_enabled` /
  `habit_last_call_enabled` / `habit_last_call_time` / `habit_last_call_date`.
- **Registry capability** `remindable` + `isRemindable()` (subtask rule, as `isPausable`).
- **`lib/reminders/due.ts`** — the one definition of "is a nudge owed". Pure.
- **`lib/reminders/copy.ts`** — the words, and the copy contract, under test.
- **`lib/reminders/scan.ts`** — the tick: local clock per user, dedupe, fan-out.
- **`/api/cron/reminders`** — every 5 minutes, registered in `vercel.json`.
- **`/api/reminders/act`** — Done / Snooze from the notification, cookie-authed so RLS
  scopes the write.
- **`app/sw.ts`** — action buttons, tag-collapse, a visible failure when an action does
  not land, and a fixed focus-existing-tab path (the old comparison never matched).
- **`lib/push-send.ts`** — extracted so the scan does not HTTP-POST to its own deployment;
  `eod-notify` was moved onto it in the same change.

## Phase 2 — Tier 2, delivery channels (extensions)

Every one is off by default and gated on a `user_extensions` slug.

- **`voice-announcements`** — Home Assistant `tts.speak` to chosen speakers. The nudge
  lands in the room where the habit happens, which is a better *cue* than a phone.
- **`phone-call`** — Twilio Voice. Materially harder to dismiss without processing than a
  notification.
- **`sms-nudge`** — Twilio SMS. Read rates far exceed push.

## Phase 3 — Tier 3, stakes (extensions)

Where the evidence says the power actually is, once attention is not the bottleneck.

- **`beeminder`** — datapoints per completion; a miss costs real money on their rail.
- **`pledge`** — an anti-charity commitment ledger. **Anchor does not move money**; it
  records what is owed and tells you (and optionally a witness). Stated plainly in the UI.
- **`accountability-partner`** — a digest to a person who is expecting it. The mechanism is
  "someone is waiting", not volume.

---

## Known limitations (accepted, not oversights)

- **iOS does not render notification actions.** WebKit reports `Notification.maxActions
  === 0` and drops the array, so Done / Snooze do not exist on an iPhone PWA — a tap just
  opens the app. Nothing in the platform fixes this; the SMS and call channels are the
  answer for an iPhone-first user.
- **DST spring-forward can drop one cue.** A reminder whose entire `[target, target+grace)`
  window falls inside the vanished hour (e.g. 02:30 in a zone jumping 02:00 → 03:00) is
  skipped that day. Catching it would mean firing the cue at a materially different time,
  which is the thing decision 5 refuses to do. Twice a year, for cues set in one hour.
- **A counted habit stops being nudged after its first tally.** `wantsDoingOn` composes
  `isOpenLoopOn`, whose `dailyCounts[day] > 0` rule closes the loop on tally one — so a
  `timesPerDay: 3` habit at 1/3 goes quiet while the grid still shows it unfinished. This
  is the shared app-wide definition and diverging locally would be worse than the symptom.
  **Open question for a human:** should `isOpenLoopOn` itself learn about `timesPerDay`?
  That is a change to every surface, not to reminders.

## Deferred / open

- Whether `remindable` should stay true for `task` (it is today — the cost is zero, since
  the scan gates on `reminder_time is not null`, and the dialog now says so when a task
  has no date for a cue to land on).
- Vercel cron plan limits: two crons at `*/5` needs a paid plan. Phase 3's settlement folds
  into the reminder tick rather than claiming a third slot.
- A per-item "snoozed until" indicator in the UI. The column exists; nothing renders it.
- The pledge ledger has no reader. `stake_events` is written and RLS-readable, but no
  surface shows it — "you owe £30" is currently only ever a notification.
- **Beeminder datapoints are posted at settle time, not at completion time.** With the
  defaults (settle 03:00, goal deadline midnight) a completion is reported three hours
  after the goal has already derailed. The `daystamp` makes the graph correct; it does not
  un-derail. Workaround today: keep the settle time before the goal's deadline. The real
  fix is posting on completion, which needs a client→server hook this feature does not
  have — **decide before relying on the money.**
- **`/api/reminders/secrets` PUT is a read-modify-write of one jsonb.** Two credential
  fields blurred within the same instant could drop one write. Single-user in practice;
  closing it properly needs a `jsonb_set` RPC.
- **The extension toggles do not depend on the master switch in the UI.** A channel can be
  switched on and fully configured while `rituals.reminders` (or `rituals.stakes`) is off,
  and the Extensions pane does not say so. `dependsOn` cannot express it — the settings
  manifest requires parent and child to share a pane.
