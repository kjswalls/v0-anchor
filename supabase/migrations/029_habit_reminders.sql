-- ─────────────────────────────────────────────────────────────────────────────
-- 029_habit_reminders.sql — per-item reminders and the streak-at-risk last call
--
-- Anchor could already reach a device (migration 009's push_subscriptions, the
-- eod-notify cron) but only ever for ONE moment a day: the end-of-day review.
-- This adds the other half — a cue at the time the habit is actually meant to
-- happen, and one last call before the day closes.
--
-- WHY A NEW COLUMN RATHER THAN items.reminder_at. That column exists (migration
-- 019 copied it in with the task-side superset) and nothing reads or writes it.
-- It is a timestamptz — ONE instant — which is the wrong shape for a daily
-- habit: "07:30, every weekday, in whatever zone I am standing in" is a local
-- wall-clock time, and storing it as an instant would drift by an hour twice a
-- year and by the whole offset the moment the user travels. reminder_at is left
-- alone (unused, still ballast); reminder_time is the recurring-cue column.
--
-- NULL MEANS OFF, deliberately, rather than an enabled/time column pair like
-- user_settings.eod_review_{enabled,time}. A pair has a fourth state nothing
-- can render — enabled with no time — and per-ITEM there are thousands of rows
-- to keep consistent instead of one. The cost is that clearing a reminder
-- forgets the hour, which is a keystroke, not a data loss.
--
-- Safe to re-run (add column if not exists throughout). No backfill: every
-- existing item gets reminder_time NULL, which is exactly "no reminder", so
-- applying this changes nobody's behavior until they set one.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Per-item reminder ───────────────────────────────────────────────────────

alter table items
  -- Local wall-clock 'HH:mm'. NULL = no reminder for this item.
  add column if not exists reminder_time text,
  -- The implementation-intention phrase — "after I pour my coffee", "when I get
  -- home". Rendered INTO the notification body ("After you pour your coffee:
  -- vitamins") rather than merely stored, because the evidence behind this
  -- field is about the cue the user rehearses, not about metadata: pairing a
  -- behavior with a stable context is what forms the habit, and a clock time is
  -- a weaker context than an event. Free text, never parsed.
  add column if not exists reminder_anchor text,
  -- Dedupe stamp: 'yyyy-MM-ddTHH:mm' — the user's local DAY and the TIME the
  -- cue was sent for. The scan runs every 5 minutes and the delivery window is
  -- wider than one tick, so without a stamp a single 07:30 cue fires six times.
  --
  -- The time is in the key, not just the day, and that is the whole difference
  -- between this working and not. Retiming a cue from 07:00 to 21:00 after the
  -- morning one has already fired has to re-arm it — otherwise the user changes
  -- the time, watches nothing happen, and concludes reminders are broken. A
  -- day-only stamp cannot express that, and the obvious workaround (clear the
  -- stamp whenever reminder_time is written) fires the cue a SECOND time on any
  -- unrelated edit, because the item dialog's whole-item save names every field.
  add column if not exists reminder_sent_key text,
  -- "Not now — ask me again at." Set by the Snooze action on the notification
  -- itself, and the ONE piece of reminder state that is an instant rather than
  -- a wall-clock time: "in 15 minutes" is a real duration from a real moment,
  -- so a timestamptz is the honest column. It overrides reminder_sent_date on
  -- the next scan (the day's cue has already been sent — that is precisely the
  -- state a snooze exists to re-open) and is cleared as it fires.
  add column if not exists reminder_snooze_until timestamptz,
  -- Which local day the snooze BELONGS to, yyyy-MM-dd.
  --
  -- Carried beside the instant because the instant alone cannot answer the two
  -- questions that matter, and getting either wrong is worse than having no
  -- snooze at all:
  --
  --   1. WHICH DAY does the re-asked cue credit? A snooze tapped at 23:55 and
  --      due at 00:10 would otherwise be delivered against tomorrow, and its
  --      Done button would tick tomorrow's box for yesterday's habit.
  --   2. WHEN DOES IT EXPIRE? A snooze is cleared as it fires, but it only
  --      fires while the item still wants doing — so completing the habit in
  --      the app instead leaves the row armed forever. Because a matured snooze
  --      deliberately bypasses both the day stamp and the delivery window, that
  --      stale row would then fire at the first tick after midnight on the next
  --      day the habit is due, and stamp that day, suppressing the real cue.
  --
  -- Both are answered by refusing to deliver a snooze whose day is not today.
  -- A snooze that crosses midnight is dropped rather than moved: "in 15
  -- minutes" at 23:55 is, in practice, "not tonight".
  add column if not exists reminder_snooze_date text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_reminder_time_check') then
    -- Shape only, not existence: the app writes NULL to clear. 24-hour, so the
    -- cron can compare it as minutes without re-parsing a locale.
    alter table items
      add constraint items_reminder_time_check
      check (reminder_time is null or reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end$$;

-- Partial index: the reminder scan asks for "every item anywhere that has a
-- reminder at all", which is a small fraction of the table and has no user_id
-- in the predicate — it fans out across all users in one query rather than
-- issuing one per user (the shape eod-notify's per-user loop should have had).
create index if not exists items_reminder_time_idx
  on items (reminder_time)
  where reminder_time is not null and deleted_at is null;

-- Snoozes are rare and short-lived, so their own partial index keeps the "is
-- anything owed right now" probe off the reminder_time index's tail.
create index if not exists items_reminder_snooze_idx
  on items (reminder_snooze_until)
  where reminder_snooze_until is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_reminder_snooze_date_check') then
    alter table items
      add constraint items_reminder_snooze_date_check
      check (reminder_snooze_date is null or reminder_snooze_date ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
end$$;

-- ─── Per-user reminder settings ──────────────────────────────────────────────

alter table user_settings
  -- Master switch. Every per-item reminder is gated behind it, so one toggle
  -- silences Anchor completely without anyone having to clear a hundred times.
  add column if not exists habit_reminders_enabled boolean default false,
  -- The streak-at-risk last call: ONE notification naming what is still open
  -- and what it costs, rather than a repeat of the same cue. Repetition is what
  -- reminders habituate to; a changed frame is what they don't.
  add column if not exists habit_last_call_enabled boolean default false,
  add column if not exists habit_last_call_time    text default '20:30',
  -- Per-user dedupe twin of items.reminder_sent_date, same 'yyyy-MM-dd' rule
  -- (compare last_eod_notified_date, migration 018).
  add column if not exists habit_last_call_date    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_last_call_time_check') then
    alter table user_settings
      add constraint user_settings_last_call_time_check
      check (habit_last_call_time is null or habit_last_call_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end$$;
