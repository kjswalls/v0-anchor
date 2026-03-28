create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  github_issue_number integer unique,
  supabase_user_id uuid references auth.users(id) on delete set null,
  user_email text,
  report_type text not null default 'bug',
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.bug_reports enable row level security;
