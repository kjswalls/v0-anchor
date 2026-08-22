# Completion-history growth — session handoff

Branch: `claude/repeating-items-account-growth-7fifa5`, two commits, pushed.
Nothing merged. **029, 030 and 031 are all applied to `anchor`
(ctcspcferkdlzdcqlozq)**, ledger-aligned and verified against the live project —
see "What was verified" below. The app side is NOT deployed, which is the
correct order (migrations first; see step 1's note).

---

## What the question was, and what it turned out to be

"Repeating items are their own individual items now — does an account with a lot
of them grow forever?"

Half right, and the wrong half is the reassuring one. A recurring item is ONE row
carrying a rule (`repeat_frequency`, `repeat_days`, `repeat_month_day`);
occurrences are computed at render time by `shouldShowOnDate`. Nothing is
materialised per date, and there is no per-occurrence override at all — which is
why "move just this one occurrence" is not expressible (see the note in
`eod-review.tsx`). Row count grows with how many things you track, not how long.

What *does* grow with time is `completed_dates` / `skipped_dates` **on those
rows**: one date string per completion, never trimmed, and `fetchItems` shipped
all of it on every load. ~30 daily habits over a decade ≈ 1 MB of date strings
per page load to render one day. That is the thing that was fixed.

Also fixed: `item_events` had no retention at all. Not fixed, deliberately:
completed one-off tasks accumulate, but that tracks items *created*, not time,
and the only remedy is auto-archiving — a product decision, not a perf one.

---

## What shipped

| Migration | What |
|---|---|
| **029** | `set_item_skip` — intent RPC for `skipped_dates`, the twin `set_item_completion` (020) has had all along |
| **030** | `item_events` joins the nightly purge at 180 days (matches `HEATMAP_WEEKS`) |
| **031** | `items_windowed` view — both date arrays trimmed to 400 days, every other column passed through |

App side: both arrays lost their column mapping in the `updatesToRow`
allowlists. `updateItem` intercepts them and replays the diff as per-date
intents (`reconcileDateArrays`). `fetchItems` and `listDeleted` read the view.

### The one invariant not to break

`reconcileDateArrays` bounds **retraction** to `COMPLETION_RETRACTION_WINDOW_DAYS`
while leaving **additions** unconditional. That is not a detail — it is what
makes migration 031 safe. Windowing reads creates partial writers, and a partial
writer omits an ancient date because it was never sent it, not because the user
retracted it. **Reverting 031 without the bound, or the bound without 031, is a
data-loss bug.** Both windows live in `lib/completion-window.ts`; retraction is
deliberately the larger, so a stale fetch can still retract what it was served.

### A tax this adds to future migrations

`items_windowed` holds a dependency on every column it selects. Adding a column
to `items` works but leaves the view stale — end the migration with
`select rebuild_items_windowed();`. **Dropping or retyping** an `items` column
now fails outright; the sequence is drop-view → alter → rebuild, spelled out in
031's header. Do not use `drop ... cascade`.

---

## Next steps, in order

1. ~~**`pnpm db:push`.**~~ **Done** — all three applied to `anchor`
   (ctcspcferkdlzdcqlozq) via the Supabase MCP, in the order 029/030 → 031.
   031 must still reach the database **before** the app build reaches users (the
   same direction 027 documents); it has, and the app is not deployed, so that
   ordering holds. Both new reads degrade to the base table if the view is
   missing, so the window was survivable in the interim rather than fatal.

   **Ledger note.** The MCP stamps `schema_migrations.version` as a TIMESTAMP,
   not `NNN`. CLAUDE.md requires NNN alignment or `db push` replays the
   migration later, so each version was corrected by hand after applying. All
   three now read `029` / `030` / `031`; verified by reading the ledger back,
   not just by writing it. **Any future MCP-applied migration needs the same
   correction.**

2. **Sanity-check a real account** — still open, and the one check that needs a
   browser and a human. Open a long-running habit's 6-month heatmap (the deepest
   history surface) and confirm it still fills. Nothing in the data can make
   this fail today (see the no-op note below), so this is a smoke test of the
   read path, not of the trim.

3. **Run the E2E suite** — still NOT run. `pnpm e2e` was attempted and fails in
   `globalSetup` before reaching a browser: all five vars in the env contract
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SECRET_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) are unset and
   there is no `.env.test`. Independently, the sandbox's egress policy denies
   `ctcspcferkdlzdcqlozq.supabase.co:443`, so the suite could not reach the
   project even with credentials. `tests/e2e/habits.spec.ts` and `pause.spec.ts`
   both touch the skip path that changed, and remain the gap in coverage.

4. **Decide the agent-projection question** (below), then merge.

### Open decision

`/api/agent/context` now serves the OpenClaw plugin a 400-day slice instead of
full history. The schema is unchanged so it still `safeParse`s, and a smaller
payload into a model's context is arguably a win — but it is the one behavioural
change here that reaches outside the app. If you would rather the agent
projection stay unwindowed, `fetchItems` needs a flag to select the base table
for that one caller.

Scope confirmed since: `/api/agent/context` is the ONLY external surface
affected. `fetchItems` has three other callers — `planner-store` (the app, which
is the point), and `fetchTasks`/`fetchHabits`, which no route calls. The
`/api/agent/tasks` and `/api/agent/habits` routes are POST-only. So this is one
decision about one endpoint, not a class of them.

---

## What was verified, and how

Gate results are at the end of this section; `pnpm e2e` is still NOT run
(see step 3).

The SQL was first executed against a real PostgreSQL 16, not reviewed by eye:

- the trim, at the boundary — 399 days in, 401 out
- **`security_invoker=true` genuinely enforces the own-rows RLS policy through
  the view.** An otherwise identical view without the flag returned every
  tenant's rows. If that flag is ever dropped, the view must be dropped with it.
- the generated column list matches `items` exactly and quotes the reserved-word
  columns (`"order"`, `"group"`) that `fetchItems` sorts on
- `rebuild_items_windowed()` recovers the view after a column is added
- `set_item_skip` is idempotent in both directions and leaves `streak` alone
- 029 and 031 both re-apply cleanly

### Re-verified against the live `anchor` project, after applying

The bullets above were PostgreSQL 16 on a workstation. Everything below was run
against ctcspcferkdlzdcqlozq itself (Postgres 17.6), reading state back rather
than trusting the apply:

- **Ledger** reads `029` / `030` / `031`. No timestamp rows remain.
- **`items_windowed` exists**, `relkind=v`, `reloptions={security_invoker=true}`.
- **Column parity is exact**: 46 columns in `items`, 46 in the view, and a
  two-way `EXCEPT` on (name, ordinal_position, data_type) is empty in both
  directions. This is the check that matters, because `fetchItems` does
  `select('*')` and a dropped column would read back as `undefined` in the app
  with no error anywhere.
- **RLS genuinely applies through the view on this project.** As role
  `authenticated` with a user's JWT, the view returns exactly that user's rows
  (826 of 914) and zero rows belonging to anyone else; swapping the JWT to a
  second user changes the count to that user's 59, so the bound is tracking the
  invoker rather than coinciding. As `anon`, both the table and the view return
  0. Supabase's own linter also raises no `security_definer_view` advisory.
- **Both arrays are trimmed and only those two**: the stored view definition
  contains exactly two `window_dates(…, 400)` calls, one per date column, and
  quotes `"order"` / `"group"`.
- **The trim boundary re-checked here**: day −400 survives, day −401 is
  dropped, `null` and `{}` both come back `{}`, and a non-date string is carried
  by the lexicographic compare rather than raising a cast error — the behaviour
  the plain `text[]` columns depend on. `window_dates` is `stable`, not
  `immutable`, so no stale cutoff can be folded into a cached plan.
- **The cron job is intact**: `purge-deleted-items`, `0 0 * * *`, active, with
  all 8 DELETEs including `item_events` at 180 days. One job, not two — the
  unschedule/reschedule in 030 left no duplicate.
- **`rebuild_items_windowed()` runs on this project**, not just locally.
  Calling it again is a clean no-op: still 46 columns, still zero parity drift,
  `security_invoker` still set, grants reinstated, 914 rows readable. The
  documented recovery path for future migrations is therefore live, not
  theoretical. (Adding an actual column to test it was NOT done here — that is
  a schema change to a production table for a test's sake.)
- **A grant wider than the migration asked for, and why it is fine.** 031
  grants `select` to `authenticated, service_role`; the project's blanket
  default privileges also hand `anon` full privileges on new public objects, so
  `anon` holds SELECT (and nominally INSERT/UPDATE/DELETE) on the view. This is
  the same posture `items` itself already has, and it is inert: with
  `security_invoker=true` the own-rows policy evaluates `auth.uid() = user_id`
  as `null` for `anon`, which is why the `anon` probe above returns 0 rows.
  Writes through the view are likewise refused by the same policy, and the two
  windowed columns are expressions, so they are read-only regardless.
- **PostgREST can see the view.** The `pgrst_ddl_watch` event trigger is enabled
  on `ddl_command_end`, so the `create view` fired the schema-cache reload. (The
  REST endpoint itself was not reachable from that sandbox — egress policy — so
  this is the mechanism, checked in the catalog, rather than a live 200.)

Both migrations are no-ops on today's data, as expected: the oldest date in any
array is 2026-04-03 (~141 days), nothing is beyond the 400-day horizon, and
`item_events` has 3616 rows with 0 older than 180 days. So the above verifies
mechanics, not row deltas.

**One undocumented side effect, found by diffing table against view.** Exactly
one of the 914 rows differs, and not because of the trim: `window_dates` ends in
`order by d`, so the view returns SORTED arrays while the table stores
append-order. That row had `[04-04, 04-03, 04-06, 04-07]` — a habit completed
out of order. This is harmless and arguably a stabilisation: every consumer of
`completedDates`/`skippedDates` uses `.includes`, `.length` or `.filter`, and
nothing anywhere does positional access. Worth knowing before someone writes
code that assumes append-order, which the base table still has.

### Gates re-run on this branch

`pnpm test` 1337 passing (78 files), `pnpm lint` 0 errors / 53 warnings,
`pnpm build` clean, and `packages/types/dist` rebuilds with no drift (the gate
CI fails on). Of the 53 lint warnings, 50 are pre-existing on `main`; the 3 new
ones are `_cd`/`_st`/`_sd` at `planner-store.ts:2386`, the same deliberate
underscore-discard idiom `main` already carries at five other sites.
