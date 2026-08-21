-- ─────────────────────────────────────────────────────────────────────────────
-- 031_stakes.sql — the day, settled
--
-- Tiers 1 and 2 are about ATTENTION: get the cue in front of the person at the
-- moment it can still change the day. That has a ceiling, and the ceiling is
-- well documented — for a daily habit the usual failure is not forgetting, it
-- is seeing the prompt and dismissing it. Past that point the intervention with
-- the best evidence behind it is a stake: a commitment device where missing
-- costs something the person actually minds.
--
-- So this adds a NIGHTLY SETTLEMENT, not another notification. Once a day, after
-- the day is genuinely over, Anchor works out what happened and reports it to
-- wherever the user has attached consequences: a Beeminder goal, a pledge
-- ledger, a person who is expecting to hear.
--
-- WHY SETTLE THE PREVIOUS DAY, AND LATE. Settling at midnight would race the
-- user: the end-of-day review can credit yesterday's habit after midnight, and a
-- settlement that ran first would report a miss the app itself does not believe
-- in. The default is 03:00 local, settling the day before — late enough that
-- nothing is still in flight, early enough to be waiting in the morning.
--
-- WHAT ANCHOR DOES NOT DO: move money. The pledge ledger below RECORDS what is
-- owed and tells you (and optionally your witness). It has no payment rail and
-- makes no attempt to look like one — a commitment device that quietly failed to
-- collect would be worse than none, because you would keep trusting it. Users
-- who want money to actually move are pointed at Beeminder, which has that rail.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── When the day closes ─────────────────────────────────────────────────────

alter table user_settings
  -- Master switch, separate from habit_reminders_enabled: someone may well want
  -- stakes without notifications, or notifications without stakes, and folding
  -- them together makes turning off the nagging also turn off the accounting.
  add column if not exists stakes_enabled     boolean default false,
  add column if not exists stakes_settle_time text default '03:00',
  -- The last local day actually settled — the dedupe stamp, and also the
  -- catch-up bound: a deployment that was down for a day settles it on return
  -- rather than skipping it, because a skipped day is a miss silently forgiven.
  add column if not exists stakes_settled_date text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_settle_time_check') then
    alter table user_settings
      add constraint user_settings_settle_time_check
      check (stakes_settle_time is null or stakes_settle_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end$$;

-- ─── The ledger ──────────────────────────────────────────────────────────────
-- Append-only record of what each settled day concluded. It exists so the
-- pledge tier can be honest: "you owe £30" has to be backed by rows a person can
-- read, or it is a number an app made up.

create table if not exists stake_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The LOCAL day this concerns, yyyy-MM-dd. Not a timestamp: the whole feature
  -- is denominated in the user's days.
  date text not null,
  /*
   * What the row is about: an item id, or the literal 'day' for a whole-day
   * summary. Text and NOT NULL rather than a nullable uuid FK, for one
   * load-bearing reason — the unique index below is the idempotency guarantee,
   * and in Postgres NULLs are never equal, so a nullable column silently stops
   * deduplicating exactly the rows it was added to deduplicate.
   */
  subject text not null,
  /* A snapshot, because the ledger must still read correctly after the item is
   * renamed or deleted. "You owe £10 for <deleted>" is not a record. */
  subject_title text not null,
  /* 'hit' | 'miss' — a SKIP is neither and is never recorded. A skip is an
   * explicit "not this occurrence", and charging for one would make the honest
   * gesture the expensive one. */
  kind text not null,
  /* Which extension concluded it: 'beeminder' | 'pledge' | 'partner'. */
  channel text not null,
  /* Pledge only. Integer minor units — never a float, for the usual reason. */
  amount_cents int,
  currency text,
  /* Free text for the record: a Beeminder datapoint id, a delivery error. */
  detail text,
  created_at timestamptz not null default now(),
  /*
   * When this row's OUTSIDE-WORLD side effect actually happened — the datapoint
   * posted, the digest delivered, the notification sent — or NULL if it has not.
   *
   * The second half of claim-then-act, and without it the first half is a trap.
   * Claiming makes a retry find the row already present and do nothing; so an
   * adapter whose commit failed once — a network blip, an expired token — would
   * never be retried, the next tick would report no problem, and the day would
   * be stamped settled with the datapoint never posted and the partner never
   * told. The ledger would say it happened.
   *
   * So: claimed rows are recorded immediately, and the day is only finished
   * when every row a live adapter owns has a committed_at.
   */
  committed_at timestamptz
);

-- The retry probe: "what did this user's day claim that never went out?"
create index if not exists stake_events_pending_idx
  on stake_events (user_id, date)
  where committed_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stake_events_kind_check') then
    alter table stake_events add constraint stake_events_kind_check check (kind in ('hit', 'miss'));
  end if;
end$$;

-- THE idempotency guarantee. Settlement is driven by a cron that may run twice,
-- retry, or catch up after an outage; without this, a day settled twice charges
-- twice. Every writer uses ON CONFLICT DO NOTHING against it.
create unique index if not exists stake_events_unique_idx
  on stake_events (user_id, date, subject, channel);

create index if not exists stake_events_user_date_idx on stake_events (user_id, date desc);

alter table stake_events enable row level security;

-- Read-only to the owner: these rows are a record of what happened, and a
-- ledger the subject can edit is not a ledger. Only service_role (the
-- settlement) writes.
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'stake_events' and policyname = 'Users read their own stake events'
  ) then
    create policy "Users read their own stake events"
      on public.stake_events for select
      using (auth.uid() = user_id);
  end if;
end$$;
