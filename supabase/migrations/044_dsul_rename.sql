-- ─────────────────────────────────────────────────────────────────────────────
-- 044_dsul_rename.sql — rename the DB-side "anchor" objects to "dsul"
--
-- The app was renamed from Anchor to dsul. Migration 035 created the cron
-- plumbing under the old name: a function `anchor_tick`, two jobs
-- (`anchor-reminders`, `anchor-eod-notify`) and two Vault secrets
-- (`anchor_app_url`, `anchor_cron_secret`). This migration renames the parts
-- that live in the catalog and DELIBERATELY DOES NOT TOUCH VAULT.
--
-- WHY VAULT IS LEFT ALONE. Renaming a secret means reading its value and
-- writing it back, so a half-applied rename is a cron that silently stops
-- firing — and "silently" is the whole problem: dsul_tick no-ops when the
-- secrets are missing, by design (035), so nothing errors and nothing runs.
-- Instead the function reads the NEW names and falls back to the OLD ones, so
-- the ticks keep firing on the existing secrets with no manual step. Rename
-- them at leisure:
--
--   select vault.create_secret(<app url>,     'dsul_app_url');
--   select vault.create_secret(<cron secret>, 'dsul_cron_secret');
--
-- …and then the `anchor_*` reads below can go, along with the old secrets.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── The tick function, under its new name ───────────────────────────────────
-- Body is 035's, plus the transitional secret fallback. See 035 for why this is
-- a function (keeps the secret out of cron.job) and why an unconfigured project
-- returns quietly instead of erroring 288 times a day.
create or replace function public.dsul_tick(route text)
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  app_url text;
  secret  text;
begin
  -- New names first, old names as a fallback: this migration renames the
  -- catalog objects but not the Vault entries, so on a live database the
  -- `anchor_*` branch is the one that answers until those are re-created.
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'dsul_app_url';
  if app_url is null then
    select decrypted_secret into app_url from vault.decrypted_secrets where name = 'anchor_app_url';
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'dsul_cron_secret';
  if secret is null then
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'anchor_cron_secret';
  end if;

  if app_url is null or secret is null then
    return;
  end if;

  perform net.http_get(
    url     := rtrim(app_url, '/') || route,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.dsul_tick(text) from public, anon, authenticated;

comment on function public.dsul_tick(text) is
  'Calls one of dsul''s /api/cron routes with the Bearer secret from Vault. No-ops until dsul_app_url and dsul_cron_secret are set (falls back to the pre-rename anchor_* names).';

-- ─── Re-point the jobs ───────────────────────────────────────────────────────
-- Schedule the new names FIRST, so there is no window in which neither job
-- exists; then drop the old ones. cron.schedule is upsert-by-name, and
-- cron.unschedule raises when a job is absent — which is the normal case on a
-- fresh database and on every re-run, hence the swallowed exceptions.

select cron.schedule('dsul-reminders',  '*/5 * * * *', $$select public.dsul_tick('/api/cron/reminders')$$);
select cron.schedule('dsul-eod-notify', '*/5 * * * *', $$select public.dsul_tick('/api/cron/eod-notify')$$);

do $$
begin
  perform cron.unschedule('anchor-reminders');
exception when others then null;
end$$;

do $$
begin
  perform cron.unschedule('anchor-eod-notify');
exception when others then null;
end$$;

-- Only now that nothing schedules it. Signature must match 035's exactly.
drop function if exists public.anchor_tick(text);

-- ─── Catalog comments that named the old package ─────────────────────────────
-- 019 stored this on the table itself, so the old scope name is live in the
-- catalog rather than only in a migration file.
comment on table items is
  'Unified task/habit/… items. type discriminates; kind-specific columns are nullable; per-type requiredness lives in @dsul/types ItemSchema.';
