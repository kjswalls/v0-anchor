create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_md text default null,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table user_settings enable row level security;
create policy "Users manage own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create trigger user_settings_updated_at before update on user_settings
  for each row execute function update_updated_at();
