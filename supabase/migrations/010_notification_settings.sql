-- Migration 010: notification schedule settings
alter table user_settings
  add column if not exists morning_check_time           text    default '08:00',
  add column if not exists morning_check_dismissed_date text    default null,
  add column if not exists eod_review_time              text    default '21:00',
  add column if not exists eod_review_enabled           boolean default false;
