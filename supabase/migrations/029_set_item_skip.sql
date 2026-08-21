-- ─────────────────────────────────────────────────────────────────────────────
-- 029_set_item_skip — intent-based atomic skip, the twin of set_item_completion
--
-- WHY THIS EXISTS. Migration 020 gave completion an intent RPC and spelled out
-- the two flaws it closed: a guard-SELECT/UPDATE race, and parity-toggling
-- inverting user intent against a stale client. `skipped_dates` never got the
-- same treatment — every skip in the app still round-trips the WHOLE array
-- through the update allowlist (`row.skipped_dates = updates.skippedDates`),
-- so it carries both flaws plus a third the completion path does not:
--
--   A client that holds a PARTIAL array overwrites the row with that partial
--   array, and the dates it never knew about are gone for good.
--
-- Today every client holds the full history, so that third flaw is latent. It
-- stops being latent the moment reads are windowed to a recent slice — which is
-- the point of this whole change — so the write path has to be intent-based
-- FIRST. Windowing on top of an absolute-array write is not an optimization,
-- it is silent history deletion.
--
-- SCOPE: skipped_dates ONLY. It deliberately does not clear a completion for
-- the same date, even though skip-clears-completion is a real app rule
-- (planner-store setItemSkipped, toggleHabitStatus). That exclusivity already
-- runs through set_item_completion, which also owns the streak transition —
-- folding it in here would give two RPCs a claim on `streak` and re-open
-- exactly the desync 020 closed. Callers issue both intents; each is
-- idempotent, so any interleaving converges.
--
-- No streak handling for the same reason: nothing in the app moves a streak on
-- a skip, and 024 (pausing) depends on that staying true.
--
-- Additive and safe to re-run. Applying it changes no behavior on its own —
-- nothing calls the RPC until the app side ships.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_item_skip(
  item_id uuid,
  item_type text,
  date_str text,
  skipped boolean
)
returns void as $$
begin
  -- One statement, same shape as set_item_completion: the caller states the
  -- desired end state and the array is made to match. Idempotent under
  -- retries, reordering, and rapid double-clicks — array_append is guarded by
  -- the membership test, array_remove is a no-op on an absent value.
  update items set
    skipped_dates = case
      when skipped and not (date_str = any(coalesce(skipped_dates, '{}')))
        then array_append(coalesce(skipped_dates, '{}'), date_str)
      when not skipped
        then array_remove(coalesce(skipped_dates, '{}'), date_str)
      else skipped_dates
    end
  where id = item_id and type = item_type;
end;
$$ language plpgsql;

comment on function set_item_skip(uuid, text, text, boolean) is
  'Intent-based per-date skip for items.skipped_dates. States the desired end '
  'state rather than toggling parity, so it is safe against stale clients and '
  'concurrent writers. Never touches completed_dates or streak — completion '
  'exclusivity belongs to set_item_completion, which owns the streak column.';
