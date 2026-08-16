-- ─────────────────────────────────────────────────────────────────────────────
-- 028_containers_seeded — the one-shot latch behind first-run container seeding.
--
-- WHY A COLUMN AND NOT AN INFERENCE. The obvious gate is "this account has no
-- containers, so seed it", and that gate is wrong in the one way that matters:
-- it makes the seeds UNDELETABLE. Delete the three starter projects, reload, and
-- an inference-based gate sees an empty account and puts them straight back. The
-- product decision (organize-console.md, decision 2) is that they are "fully
-- deletable", which is a statement about what happens on the NEXT load, not
-- about whether a delete button exists.
--
-- It also cannot live in localStorage. A second device would read an unset flag,
-- see an account someone had deliberately emptied, and re-seed it — the same bug
-- with a longer fuse.
--
-- NOT REUSING `onboarding_completed`. That flag is owned by Beacon's welcome
-- chat and means "has seen the tour". Coupling seeding to it gets both cases
-- wrong: someone who skips the tour never gets containers, and someone who
-- finished it before this shipped never gets them either.
--
-- VERSION 028 AND NOT 025. The remote ledger already carries 025 (theme_palette)
-- and 026 (user_extensions) from branches whose migration files are not in this
-- worktree. Numbering from the local directory would have collided with two live
-- migrations. Ledger first, directory second — see CLAUDE.md.
--
-- Safe to re-run: `if not exists` on the column, and the default leaves every
-- existing row false.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.user_settings
  add column if not exists containers_seeded boolean not null default false;

comment on column public.user_settings.containers_seeded is
  'One-shot latch for first-run container seeding. Set once the app has planned a '
  'seed for this account, INCLUDING when the plan was empty — the question is '
  '"has this account been considered", not "did anything get created". Never '
  'reset: clearing it re-seeds containers the user may have deliberately deleted.';
