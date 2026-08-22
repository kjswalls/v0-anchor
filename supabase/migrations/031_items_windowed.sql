-- ─────────────────────────────────────────────────────────────────────────────
-- 031_items_windowed — serve a bounded slice of completion history
--
-- completed_dates / skipped_dates accrue one date string per completion and are
-- never trimmed. They are the only part of an account that grows with TIME
-- rather than with what the user creates, and fetchItems selects every live item
-- with no date bound, so a decade-old account ships a decade of date strings on
-- every page load to render one day.
--
-- This view serves the last 400 days of both arrays and passes every other
-- column through untouched. 400 mirrors COMPLETION_READ_WINDOW_DAYS in
-- lib/completion-window.ts — CHANGE ONE, CHANGE BOTH; the header there explains
-- why 400 (the deepest surface that renders history is the 26-week heatmap).
--
-- ORDER OF OPERATIONS. This is the read half. The WRITE half shipped first,
-- deliberately (029/030): until absolute completedDates/skippedDates bodies were
-- reconciled into per-date intents, a client holding a windowed slice would have
-- written that slice back as the whole truth and deleted everything older. The
-- retraction scoping in reconcileDateArrays is the other half of this change and
-- must not be reverted independently — without it this view is a data-loss bug,
-- not an optimization.
--
-- SECURITY_INVOKER IS LOAD-BEARING. A Postgres view runs with its OWNER's
-- privileges by default, which would make this view a complete bypass of the
-- own-rows RLS policy on items — every user reading every user's items. PG15+
-- only; migration 027 already asserts that version, and Supabase is well past
-- it. If this flag is ever dropped the view must be dropped with it.
--
-- WHY THE COLUMN LIST IS GENERATED. `create view ... as select *` freezes the
-- column list at creation time, so a column added to items later would silently
-- be missing from the view — and fetchItems does select('*'), so the app would
-- read it back as undefined with no error anywhere. Rather than hand-maintain a
-- second copy of the schema, rebuild_items_windowed() reads information_schema
-- and regenerates the view.
--
-- WHAT THIS COSTS LATER MIGRATIONS. A view holds a hard dependency on every
-- column it selects, so from here on:
--
--   * ADDING a column to items succeeds, but leaves the view stale. End the
--     migration with `select rebuild_items_windowed();`.
--   * DROPPING or RETYPING an items column FAILS outright, with
--     "cannot drop column X because other objects depend on it". Do not reach
--     for `drop ... cascade` — that drops the view and leaves the app reading a
--     relation that no longer exists. The sequence is:
--
--         drop view if exists public.items_windowed;
--         alter table public.items drop column ...;
--         select public.rebuild_items_windowed();
--
--     Verified against PostgreSQL 16: the alter fails without the drop, and the
--     three statements together leave the view matching the table exactly.
--
-- That cost is worth paying over a hand-copied column list, which fails the same
-- cases SILENTLY rather than loudly. This repo drops columns rarely by policy
-- (frozen legacy tables, kept text columns in 027), so the loud path is rare too.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. The trim ──────────────────────────────────────────────────────────────
-- STABLE, not IMMUTABLE: the cutoff moves with current_date. Marking it
-- immutable would let the planner fold a stale cutoff into a cached plan.
--
-- Dates are 'YYYY-MM-DD' text, so a lexicographic >= is a chronological >= —
-- the property the whole storage format leans on. Junk that does not parse as a
-- date sorts as text and is simply carried or dropped by that comparison; it is
-- never a cast error, which matters because these arrays are plain text[] with
-- no CHECK behind them.
create or replace function public.window_dates(dates text[], days int)
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select d
      from unnest(coalesce(dates, '{}'::text[])) as d
      where d >= to_char((current_date - make_interval(days => days)), 'YYYY-MM-DD')
      order by d
    ),
    '{}'::text[]
  );
$$;

comment on function public.window_dates(text[], int) is
  'Trim a YYYY-MM-DD date array to the last N days. Used by the items_windowed '
  'view; see lib/completion-window.ts for why the horizon is what it is.';

-- ─── 2. The view generator ────────────────────────────────────────────────────
-- DROP then CREATE rather than CREATE OR REPLACE: replace refuses any change to
-- an existing column's name, type or position, so it would fail the first time a
-- column is dropped from items or reordered. A plain drop always works, and
-- nothing but the app selects from this view.
create or replace function public.rebuild_items_windowed()
returns void
language plpgsql
as $$
declare
  col_list text;
begin
  select string_agg(
           case
             when c.column_name in ('completed_dates', 'skipped_dates')
               then format('public.window_dates(i.%I, 400) as %I', c.column_name, c.column_name)
             else format('i.%I', c.column_name)
           end,
           ', ' order by c.ordinal_position
         )
    into col_list
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'items';

  if col_list is null then
    raise exception 'rebuild_items_windowed: public.items has no columns visible';
  end if;

  execute 'drop view if exists public.items_windowed';
  execute format(
    'create view public.items_windowed with (security_invoker = true) as select %s from public.items i',
    col_list
  );

  -- The view inherits nothing: grants are per-object. Without these PostgREST
  -- sees the relation and returns 42501 for every read.
  execute 'grant select on public.items_windowed to authenticated, service_role';
end$$;

comment on function public.rebuild_items_windowed() is
  'Regenerate the items_windowed view from the current column list of items. '
  'Call this at the end of any later migration that adds a column to items, or '
  'that column will be missing from every read the app performs. To DROP or '
  'retype an items column, drop this view first, alter, then call this — the '
  'view''s column dependency makes the bare alter fail.';

-- ─── 3. Build it ──────────────────────────────────────────────────────────────
select public.rebuild_items_windowed();

comment on view public.items_windowed is
  'items with completed_dates/skipped_dates trimmed to the last 400 days '
  '(COMPLETION_READ_WINDOW_DAYS in lib/completion-window.ts). Reads only — every '
  'write still targets items directly, and per-date writes go through '
  'set_item_completion / set_item_skip. security_invoker=true, so the own-rows '
  'RLS policy on items still applies.';
