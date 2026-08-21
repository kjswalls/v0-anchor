# Completion-history growth — session handoff

Branch: `claude/repeating-items-account-growth-7fifa5`, two commits, pushed.
Nothing merged. **Nothing applied to the database** — that is step 1 below, and
it has an order that matters.

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

1. **`pnpm db:push`.** 031 must reach the database **before** the app build
   reaches users — the same direction 027 documents. Both new reads degrade to
   the base table if 031 is missing, so the window is survivable rather than
   fatal, but it serves untrimmed arrays until pushed. 029 has the same
   requirement for a different reason: without it every skip calls an RPC that
   does not exist. 030 is order-independent.
2. **Sanity-check a real account** once pushed: open a long-running habit's
   6-month heatmap (the deepest history surface) and confirm it still fills.
3. **Run the E2E suite** — `pnpm e2e` needs `.env.test` + live Supabase, so it
   was not run here. `tests/e2e/habits.spec.ts` and `pause.spec.ts` both touch
   the skip path that changed.
4. **Decide the agent-projection question** (below), then merge.

### Open decision

`/api/agent/context` now serves the OpenClaw plugin a 400-day slice instead of
full history. The schema is unchanged so it still `safeParse`s, and a smaller
payload into a model's context is arguably a win — but it is the one behavioural
change here that reaches outside the app. If you would rather the agent
projection stay unwindowed, `fetchItems` needs a flag to select the base table
for that one caller.

---

## What was verified, and how

`pnpm test` 1337 passing (78 files), `pnpm lint` 0 errors, `pnpm build` clean.
`pnpm e2e` NOT run (see step 3).

The SQL was executed against a real PostgreSQL 16, not reviewed by eye:

- the trim, at the boundary — 399 days in, 401 out
- **`security_invoker=true` genuinely enforces the own-rows RLS policy through
  the view.** An otherwise identical view without the flag returned every
  tenant's rows. If that flag is ever dropped, the view must be dropped with it.
- the generated column list matches `items` exactly and quotes the reserved-word
  columns (`"order"`, `"group"`) that `fetchItems` sorts on
- `rebuild_items_windowed()` recovers the view after a column is added
- `set_item_skip` is idempotent in both directions and leaves `streak` alone
- 029 and 031 both re-apply cleanly

Not verified against the project's actual Supabase — the Supabase MCP server was
unauthorised in that session.
