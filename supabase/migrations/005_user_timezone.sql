-- Add timezone column to user_settings.
-- Stores the user's IANA timezone string (e.g. 'America/Los_Angeles').
-- Updated automatically by the client on every app load so it stays
-- current even when the user travels.
alter table user_settings
  add column if not exists timezone text default null;
