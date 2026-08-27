-- ─────────────────────────────────────────────────────────────────────────────
-- 039_one_classify_kind.sql — habit groups become projects
--
-- The CLASSIFY role had two kinds — `project` (for tasks) and `group` (for
-- habits) — which were the same shape wearing two names. Tasks and habits have
-- been ONE entity since migration 019, so two classify kinds is a distinction
-- the data model no longer makes. This migration folds the habit-group half
-- into the project half; `lib/container-registry.ts` loses the `group` kind in
-- the same change. The three ROLES (classify / gate / aspire) are untouched.
--
-- WHAT MOVES
--   * every `habit_groups` row becomes a `projects` row, KEEPING ITS ID, unless
--     a project of the same folded name already exists for that user (see the
--     collision rule below);
--   * every item's `"group"` reference becomes a `project` reference —
--     `items.project` takes the container's canonical name and `items.project_id`
--     its id.
--
-- WHAT DOES NOT MOVE, and deliberately:
--   * `habit_groups` is NOT dropped, and `items."group"` / `items.group_id` are
--     NOT cleared. They become rollback ballast, the same posture migration 019
--     took with the frozen `tasks`/`habits` tables and 027 took with the
--     container name columns.
--
--     Nothing WRITES them after this, and nothing reads the TABLE — there is no
--     `.from('habit_groups')` left in the app. `items."group"` is the one
--     exception and it is deliberate: `itemFromRow` reads it as a FALLBACK
--     (`project: row.project ?? row.group ?? ''`, lib/db.ts) so a build that
--     lands ahead of this migration shows a habit's container instead of
--     blanking it. The NAME falls back; the ID never does, because
--     `items.group_id` points into `habit_groups` and `items_project_id_fkey`
--     would reject it.
--   * the legacy projections are NOT touched by this file and must not be.
--     `/api/agent/context` still serves `habits[].group` and `habitGroups[]`,
--     and the webhooks still emit `habitGroups.updated` — the OpenClaw plugin
--     `safeParse`s both and THROWS on drift. After this migration those are
--     projections over the one container set rather than over a second table.
--
-- ── THE COLLISION RULE ───────────────────────────────────────────────────────
-- A user may hold a project AND a habit group named "Health". After the collapse
-- there is ONE namespace, so they cannot both survive under that name:
-- `projects_user_id_name_key` is UNIQUE over (user_id, name), and the ref
-- grammar (`project:Health`) has no way to tell two same-named containers apart.
--
-- So: names that FOLD EQUAL MERGE, and the PROJECT row survives.
--   * the project keeps its own id, glyph and colour — it is the row that was
--     already there, and the one every task already points at;
--   * the habit group's members adopt the project's id and its canonical
--     spelling; the habit_groups row is left behind untouched (ballast).
--
-- Folded, not exact, because the app folds: `CONTAINER_KINDS.group.caseFold`
-- was true, so 'personal' and 'Personal' were already ONE habit group to every
-- lookup in the store. The merged kind keeps `caseFold: true` for that reason,
-- which means "Health" and "health" must merge here too or the app would resolve
-- both to one row while the database held two.
--
-- ── TEXT-ONLY REFERENCES ARE PRESERVED ───────────────────────────────────────
-- Most `items."group"` values on the live database name a group that has no row
-- at all — 027's header counted 223 of 228. Those items are NOT dropped on the
-- floor: section 5 copies the bare text into `items.project` with a NULL
-- `project_id`, which is exactly the state they were already in on the other
-- side of the axis. Section 4 runs first so a real container always wins.
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Revert the app deploy. `habit_groups` and `items."group"` are byte-identical
-- to what the old build wrote, so it reads its own data back.
--
-- Two things do not come back, and both are additive rather than destructive:
--   * the former habit groups now also exist as `projects` rows, so the old
--     build's project list shows them. Deleting those rows is safe (they are
--     the ones whose id also appears in `habit_groups`) but not required.
--   * anything RE-FILED after this migration was written to `items.project`,
--     and the old build reads `items."group"`, so it shows the pre-migration
--     container. Re-filing is rare and recoverable by hand; dual-writing the
--     frozen column instead would mean the ballast never stops drifting.
--
-- Safe to re-run: every statement is guarded on the destination still being
-- unset (`where project is null`, `not exists`, `on conflict do nothing`), so a
-- second pass is a no-op — and, like 027's backfill, a LATER pass adopts rows
-- whose `items.project` is still unset.
--
-- WITH ONE LIMIT, and it is narrower than it sounds: an item that took section
-- 5's text-only path has a non-NULL `project` and a NULL `project_id`, so
-- `where i.project is null` blocks section 4 from ever LINKING it, even once a
-- container of that name is created. That is not a regression — it is exactly
-- the state the item was in before this migration, and it is exactly what
-- `adoptContainerMembers` (lib/db.ts, the app-side re-run of 027's backfill)
-- exists to repair the moment the container is created. Re-running 039 will not
-- do it.
--
-- DEPLOY ORDER: database first, app second. Nothing reads `items.project` for a
-- habit until the app build lands, so applying this alone changes no behaviour.
--
-- THE READ PATH IS ALREADY TOLERANT; THE WRITE PATH IS NOT. `itemFromRow`'s
-- `row.project ?? row.group` fallback means a build landing AHEAD of this
-- migration still shows a habit's container rather than blanking it — so the
-- wrong order degrades instead of breaking. What it cannot survive is a WRITE:
-- an app that saves a habit writes `items.project` and stops maintaining
-- `items."group"`, and a rolled-back database has no `project` value for the
-- next reader to find. Database first is what keeps that window shut.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Preconditions ─────────────────────────────────────────────────────────
-- No migration in this directory CREATES `projects` or `habit_groups` — they
-- predate the ledger and live only in the stale `supabase/schema.sql` that
-- CLAUDE.md forbids authoring against (027 says the same at length). So the
-- shape is asserted here rather than assumed, and a missing piece fails loudly
-- instead of half-migrating an account.
--
-- `items.project_id` / `items.group_id` come from 027; this migration is a
-- no-op without them, because there would be no id to carry across.

do $$
begin
  if to_regclass('public.projects') is null or to_regclass('public.habit_groups') is null then
    raise notice '039_one_classify_kind: projects/habit_groups not present — nothing to fold.';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'items' and column_name = 'project_id'
  ) then
    raise exception '039_one_classify_kind requires migration 027 (items.project_id is missing)';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'projects' and column_name = 'deleted_at'
  ) then
    raise exception '039_one_classify_kind requires projects.deleted_at (migration 013)';
  end if;
end$$;

-- ─── 1b. THE ONE CASE THIS MIGRATION CANNOT REPAIR, AND REFUSES ──────────────
--
-- Two LIVE `projects` rows for one user whose names differ only in case.
--
-- The app is about to start folding container names — `CONTAINER_KINDS.project`
-- carries `caseFold: true`, inherited from the habit-group half of the axis
-- because `makeAddDraft` writes a lowercase 'personal' against a seeded
-- 'Personal' whenever the container list has not loaded. Folding is what makes
-- that item resolve; it is also what makes two same-folded ROWS indistinguishable
-- to every lookup in the store, and the consequences are worse than "one row is
-- unreachable":
--
--   * `getProject`, `getProjectEmoji` and `getProjectColor` all answer with
--     whichever row comes first in store order, so the second row's items show
--     the first row's glyph and colour;
--   * `removeProject` matches members with `sameContainerName`, so deleting
--     EITHER row unfiles the other one's items as well — collateral damage
--     across a container the user did not delete.
--
-- This migration cannot fix that. Merging two containers the user created by
-- hand is a data decision with visible consequences (which glyph and which
-- colour survive, and which name), and it is not one a migration should make
-- silently. Renaming one for them is worse.
--
-- So it REFUSES. A loud stop before anything is written is the whole point:
-- proceeding would leave a working database and a quietly misattributing app.
-- Run this to see what is in the way, and merge or rename the rows by hand
-- first:
--
--   select user_id, lower(name) folded, count(*),
--          string_agg(name||'='||id::text, ' | ') from projects
--    where deleted_at is null group by user_id, lower(name) having count(*) > 1;
--
-- LIVE ROWS ONLY (`deleted_at is null`). A binned row differing only in case
-- from a live one is harmless: the store never loads binned containers, so no
-- lookup can confuse the two. It still holds its name against the unique index
-- for 30 days, which section 2 already accounts for.
--
-- The habit-group side needs no equivalent check. Section 2's `distinct on`
-- collapses two groups that fold equal to EACH OTHER down to one project, and a
-- group folding equal to an existing project is the merge case — neither can
-- create a new same-folded pair.

do $$
declare
  clash record;
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  select p.user_id                                            as user_id,
         lower(p.name)                                        as folded,
         count(*)                                             as n,
         string_agg(p.name || '=' || p.id::text, ' | ' order by p.id) as rows
    into clash
    from public.projects p
   where p.deleted_at is null
   group by p.user_id, lower(p.name)
  having count(*) > 1
   limit 1;

  if found then
    raise exception
      '039_one_classify_kind: user % holds % live projects whose names fold to ''%'' — %. '
      'The app folds container names after this migration, so these rows would be '
      'indistinguishable to every lookup and deleting either would unfile the other''s '
      'items. Merge or rename them by hand, then re-run. See the header for the query.',
      clash.user_id, clash.n, clash.folded, clash.rows;
  end if;
end$$;

-- ─── 2. Habit groups become projects ──────────────────────────────────────────
-- KEEPING THE ID is the whole trick. `items.group_id` already points at these
-- uuids and `items_group_id_fkey` already guarantees they resolve, so carrying
-- the id over makes section 4's link a copy rather than a lookup — and makes
-- the FK on `project_id` satisfiable in the same statement.
--
-- SOFT-DELETED GROUPS COME TOO, with their `deleted_at` intact. Their members
-- still point at them (027 links deleted parents on purpose, so a Trash restore
-- can reconnect what it had), and leaving them behind would strand exactly the
-- rows a restore is for. It also matters for the unique index:
-- `projects_user_id_name_key` has no `WHERE deleted_at IS NULL`, so a binned
-- container reserves its name for the full 30 days — inserting over one would
-- raise 23505 rather than merge.
--
-- `distinct on` collapses two habit groups that fold equal to EACH OTHER
-- (a 'Work' and a 'work' in the same account) down to one project, preferring a
-- live row over a binned one and then the lower id — the same preference
-- section 4 uses, so the two agree about which row is canonical.

do $$
begin
  if to_regclass('public.projects') is null or to_regclass('public.habit_groups') is null then
    return;
  end if;

  insert into public.projects (id, user_id, name, emoji, color, deleted_at)
  select distinct on (g.user_id, lower(g.name))
         g.id, g.user_id, g.name, g.emoji, g.color, g.deleted_at
    from public.habit_groups g
   where not exists (
           select 1
             from public.projects p
            where p.user_id = g.user_id
              and lower(p.name) = lower(g.name)
         )
   order by g.user_id, lower(g.name), (g.deleted_at is not null), g.id
  on conflict (id) do nothing;
end$$;

-- ─── 3. The canonical container per folded name ───────────────────────────────
-- Defined once as a view-shaped CTE in both statements below rather than a
-- temporary table: two accounts can legitimately hold "Work" and "work" as
-- separate project rows (the unique index is over the raw text), and every
-- lookup in the app now folds, so exactly one of them has to be the answer.
-- Live beats binned, then the lower id — deterministic, and re-running picks
-- the same row.

-- ─── 4. Items adopt their container ───────────────────────────────────────────
-- `where i.project is null` is what makes this re-runnable, and it is
-- load-bearing rather than tidy: after the app ships, moving a habit to a
-- different project writes `items.project` and leaves the frozen `"group"` at
-- its old value. Re-running must not drag that habit back.

do $$
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  with canon as (
    select distinct on (p.user_id, lower(p.name))
           p.user_id, lower(p.name) as folded, p.id, p.name
      from public.projects p
     order by p.user_id, lower(p.name), (p.deleted_at is not null), p.id
  )
  update public.items i
     set project = c.name,
         project_id = c.id
    from canon c
   where i.project is null
     and i."group" is not null
     and i."group" <> ''
     and c.user_id = i.user_id
     and c.folded = lower(i."group");
end$$;

-- ─── 5. Text-only references survive as text ──────────────────────────────────
-- The dominant case on the live database, and the one that would look like data
-- loss if it were skipped: an item naming a container that has no row. It kept
-- working before because `items."group"` is free text the UI renders directly,
-- and it keeps working after for the same reason on the other column. NULL
-- `project_id`, honestly — there is nothing to point at.
--
-- Runs after section 4, so a name that DOES have a row has already taken the
-- row's canonical spelling and id.

do $$
begin
  update public.items i
     set project = i."group"
   where i.project is null
     and i."group" is not null
     and i."group" <> '';
end$$;
