alter table user_settings
  add column if not exists last_eod_notified_date text default null;
