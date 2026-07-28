-- ============================================================
-- Migration 020: Intent-based atomic completion RPC
--
-- Review findings on the Phase 3 store rewrite showed the parity-based toggle
-- has two flaws the app can hit:
--   1. toggle_item_completed_date's guard SELECT + separate UPDATE races with
--      itself under rapid double-clicks (date can append twice).
--   2. Toggling by parity inverts user intent when the client is stale (an
--      agent/other-device write landed first): the user clicks "done" and the
--      server REMOVES the date.
--
-- set_item_completion fixes both: the caller states the desired end state
-- (completed true/false) and one atomic UPDATE makes it so — idempotent under
-- retries, stale clients, and reordering. It also owns the streak transition:
-- streak moves only when completed_dates actually changes, so streak and
-- completion history can never desync through this path (the old client-side
-- streak write raced the RPC as two independent requests). adjust_streak=false
-- is for absolute restores (undo/redo), which replay date diffs as intents
-- while restoring streak via a normal field patch.
--
-- toggle_item_completed_date is rewritten as one atomic statement for the
-- deploy window (currently-deployed clients still call it), then retired by
-- the eventual cleanup migration. Additive only — safe to apply while the
-- current app version is live.
-- ============================================================

create or replace function set_item_completion(
  item_id uuid,
  item_type text,
  date_str text,
  completed boolean,
  adjust_streak boolean default true
)
returns void as $$
begin
  update items set
    completed_dates = case
      when completed and not (date_str = any(coalesce(completed_dates, '{}')))
        then array_append(coalesce(completed_dates, '{}'), date_str)
      when not completed
        then array_remove(coalesce(completed_dates, '{}'), date_str)
      else completed_dates
    end,
    -- streak is NULL for types without the streak counter (tasks) — untouched.
    -- All right-hand references see the row's OLD completed_dates, so both
    -- CASEs test the same pre-update state.
    streak = case
      when adjust_streak and streak is not null
        and completed and not (date_str = any(coalesce(completed_dates, '{}')))
        then streak + 1
      when adjust_streak and streak is not null
        and not completed and (date_str = any(coalesce(completed_dates, '{}')))
        then greatest(0, streak - 1)
      else streak
    end
  where id = item_id and type = item_type;
end;
$$ language plpgsql;

-- Single-statement toggle: closes the guard-SELECT/UPDATE race for clients
-- deployed before the set_item_completion cutover.
create or replace function toggle_item_completed_date(item_id uuid, item_type text, date_str text)
returns void as $$
begin
  update items set
    completed_dates = case
      when date_str = any(coalesce(completed_dates, '{}'))
        then array_remove(completed_dates, date_str)
      else array_append(coalesce(completed_dates, '{}'), date_str)
    end
  where id = item_id and type = item_type;
end;
$$ language plpgsql;
