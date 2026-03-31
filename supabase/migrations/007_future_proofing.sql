-- Migration 007: Future-proofing schema additions
-- Adds nullable columns to tasks, habits, and projects for upcoming features.
-- All columns are nullable with no defaults — zero impact on existing data.
-- Uses ADD COLUMN IF NOT EXISTS so this migration is safe to re-run.

-- ─── TASKS ────────────────────────────────────────────────────────────────────

alter table tasks add column if not exists deleted_at          timestamptz;
alter table tasks add column if not exists assignee            text;
alter table tasks add column if not exists ai_result           text;
alter table tasks add column if not exists ai_status           text;
alter table tasks add column if not exists profile_id          uuid;
alter table tasks add column if not exists notes               text;
alter table tasks add column if not exists parent_task_id      uuid references tasks(id);
alter table tasks add column if not exists reminder_at         timestamptz;
alter table tasks add column if not exists sort_order          integer;
alter table tasks add column if not exists external_id         text;
alter table tasks add column if not exists calendar_source     text;
alter table tasks add column if not exists completed_at        timestamptz;
alter table tasks add column if not exists duration_minutes    integer;
alter table tasks add column if not exists recurrence_rule     text;

-- ─── HABITS ───────────────────────────────────────────────────────────────────

alter table habits add column if not exists deleted_at    timestamptz;
alter table habits add column if not exists profile_id    uuid;
alter table habits add column if not exists notes         text;
alter table habits add column if not exists sort_order    integer;
alter table habits add column if not exists color         text;

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────

alter table projects add column if not exists deleted_at    timestamptz;
alter table projects add column if not exists sort_order    integer;
alter table projects add column if not exists color         text;

-- ─── USER SETTINGS ────────────────────────────────────────────────────────────
-- Already created in 001_user_settings.sql; this is a no-op if it exists.
-- Phase 2 will add columns here as needed.

create table if not exists user_settings (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
