-- Migration 022: past-due auto-age settings
--
-- Opt-in decay for the Past due bar. When morning_auto_age_enabled is true, the
-- once-per-day sweep unschedules items past due by more than
-- morning_auto_age_days (they fall back into the Braindump). Default is FALSE so
-- out-of-the-box behaviour is unchanged — nothing moves unless the user asks.
--
-- The sweep's per-device "last run" date is deliberately local-only (persisted
-- in the zustand store, not here): the sweep is idempotent, so a per-device
-- guard is sufficient and avoids a third column.
--
-- Safe to re-run.
alter table user_settings
  add column if not exists morning_auto_age_enabled boolean default false,
  add column if not exists morning_auto_age_days    integer default 30;
