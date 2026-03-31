-- Migration 009: push_subscriptions table for PWA web push notifications
-- Each row stores one browser push subscription endpoint for a user.
-- A single user may have multiple subscriptions (different devices/browsers).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now() not null,
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "Users manage own subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id);
