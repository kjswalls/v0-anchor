-- ============================================================
-- Anchor Schema
-- Run this in the Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  emoji text not null default '📁',
  repeat_frequency text default 'none',
  repeat_days int[] default '{}',
  repeat_month_day int,
  time_bucket text,
  start_time text,
  duration int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

-- ============================================================
-- HABIT GROUPS
-- ============================================================
create table if not exists habit_groups (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  emoji text not null default '⭐',
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

-- ============================================================
-- TASKS
-- ============================================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  priority text default 'medium',
  project text,
  start_date text, -- yyyy-MM-dd
  status text not null default 'pending',
  time_bucket text,
  start_time text, -- HH:mm
  duration int,
  is_scheduled boolean not null default false,
  repeat_frequency text default 'none',
  repeat_days int[] default '{}',
  repeat_month_day int,
  "order" int not null default 0,
  in_project_block boolean default false,
  previous_start_time text,
  previous_start_date text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- HABITS
-- ============================================================
create table if not exists habits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  "group" text not null,
  streak int not null default 0,
  status text not null default 'pending',
  completed_dates text[] default '{}',
  skipped_dates text[] default '{}',
  daily_counts jsonb default '{}',
  time_bucket text,
  start_time text, -- HH:mm
  repeat_frequency text not null default 'daily',
  repeat_days int[] default '{}',
  repeat_month_day int,
  times_per_day int default 1,
  current_day_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table projects enable row level security;
alter table habit_groups enable row level security;
alter table tasks enable row level security;
alter table habits enable row level security;

-- Projects policies
create policy "Users can manage their own projects"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Habit groups policies
create policy "Users can manage their own habit groups"
  on habit_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tasks policies
create policy "Users can manage their own tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Habits policies
create policy "Users can manage their own habits"
  on habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

create trigger habits_updated_at before update on habits
  for each row execute function update_updated_at();

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

create trigger habit_groups_updated_at before update on habit_groups
  for each row execute function update_updated_at();
