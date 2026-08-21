# Habit Reminders — getting a habit actually done, not merely recorded

**Goal:** close the gap between "the habit exists in Anchor" and "the habit happened".
Anchor could already reach a device — migration 009's push subscriptions, the eod-notify
cron — but only ever for one moment a day: the end-of-day review, which fires *after* the
day is decided. This adds the moments that can still change it.

**Status (2026-08-21):** Phase 1 (Tier 1, in-app) shipped. Tiers 2 and 3 are designed
below and land as **optional extensions**, off by default, on the migration-026
`user_extensions` surface.

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
8. **Secrets never reach the browser.** Non-secret channel config lives in
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

## Deferred / open

- Whether `remindable` should stay true for `task` (it is today — the cost is zero, since
  the scan gates on `reminder_time is not null`).
- Vercel cron plan limits: two crons at `*/5` needs a paid plan. Phase 3's settlement folds
  into the reminder tick rather than claiming a third slot.
- A per-item "snoozed until" indicator in the UI. The column exists; nothing renders it.
