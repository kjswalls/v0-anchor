alter table user_settings
  add column if not exists openclaw_chat_url text default null;
