# Anchor

A personal planning PWA — a day/week schedule grid, a braindump sidebar, recurring
habits, an end-of-day review, and an AI assistant ("Beacon"). Next.js App Router +
Supabase, deployed on Vercel.

## Commands

```bash
pnpm dev            # next dev --webpack
pnpm build          # next build --webpack
pnpm lint           # eslint .
pnpm test           # vitest run  (unit)
pnpm e2e            # playwright test
pnpm db:list        # supabase migration list
pnpm db:push        # supabase db push
pnpm db:new <name>  # supabase migration new
```

pnpm workspace (Node 24). `packages/types` is `@anchor-app/types`, and its `dist/` is
**committed** — CI rebuilds it and fails on any drift from `src`, so a schema edit
without `pnpm --filter @anchor-app/types build` is a red build. `openclaw-plugin/` is a
separate consumer of the agent API; its `dist/` is gitignored and built at publish time,
so CI does not gate it — a plugin `src` change reaches users only when the npm package
is republished.

## Setting up a new machine

```bash
pnpm install
vercel env pull .env.local   # .env.local is gitignored and Vercel-generated — don't hand-copy
```

Then run `/mcp` to authenticate. `.mcp.json` is committed but holds only hosted OAuth
URLs (Figma + Supabase), no secrets, so it works from any machine. E2E tests need a
separate `.env.test` — see `.env.test.example`.

## Architecture

**Unified items.** Tasks and habits are one entity. There is a single `items` table with
a `type` discriminator; `type` is open text, so users can define custom types via the
per-user `item_types` table. The old `tasks`/`habits` tables are **frozen, not dropped** —
they exist as rollback ballast. Never query them.

**The type registry is the extension point.** [lib/item-registry.ts](lib/item-registry.ts)
declares what each type *can do* — allowed statuses, recurrence rules, whether it's
date-anchored, orderable, braindump-eligible, resizable on the grid, and so on. Any code
that wants to branch on `task` vs `habit` should ask the registry a capability question
instead. Adding a type means adding config, not adding code paths.

Custom types travel under a closed `{type:'custom', customType}` envelope app-side so
discriminated-union narrowing keeps working, but the DB stores the bare slug in
`items.type`. `itemDbType()` in [lib/db.ts](lib/db.ts) is the boundary.

**Legacy projections are permanent.** `/api/agent/context` still serves `tasks[]` and
`habits[]` as exact-legacy-schema views over items, and webhooks still emit
`tasks.updated`/`habits.updated`. The OpenClaw plugin `safeParse`s these and *throws* on
drift, so status vocabularies (`pending|completed|cancelled` for tasks,
`pending|done|skipped` for habits) are external contracts — don't merge or translate them.

**Reminders reach outward; everything else in the app waits to be opened.** A cue at the
habit's own hour, a streak-at-risk last call, and a nightly settlement all run unattended
from one cron (`/api/cron/reminders` → [lib/reminders/scan.ts](lib/reminders/scan.ts)).
Three rules there are load-bearing and are not obvious from the code shape:

- **Nothing re-derives "does this want doing".** `lib/reminders/due.ts` and
  `lib/stakes/day.ts` compose `isOpenLoopOn` + `isItemActiveOn` from
  [lib/active.ts](lib/active.ts). A nudge about a habit the grid has hidden is the app
  arguing with a decision the user made.
- **Claim, then act.** Cues are taken with a conditional update and only delivered if the
  database actually changed a row; stake rows are inserted against a unique index and only
  the newly-claimed ones reach the outside world. A cron is at-least-once, and the naive
  order rings a phone twice or charges a pledge twice.
- **Channels and stake adapters are declarative and isolated.** One is a manifest entry in
  [lib/extension-registry.ts](lib/extension-registry.ts), a field list in
  [lib/extension-settings.ts](lib/extension-settings.ts), and a `deliver()`/`plan()`+
  `commit()`. They must return a failure, never throw it — an expired token in one must
  not cost the others. Non-secret config lives in `user_extensions.config` (browser-
  readable); credentials live in `user_secrets`, which is service-role only, and
  `/api/reminders/secrets` will say which keys are set and never what they are.

Read [habit-reminders.md](memory/plans/habit-reminders.md) before touching any of it — the
copy contract, the midnight clamp and the snooze day-gate all exist because the obvious
version was wrong.

**State.** Zustand stores in `lib/*-store.ts`, one per concern (planner, view, drag,
sidebar, eod, morning, chat, …). `planner-store.ts` is the big one: it holds `items[]`
with `tasks`/`habits` projections derived off it.

**Layout.** `app/` is thin — one main page plus `api/` routes. The UI lives in
`components/` (`views/`, `shell/`, `planner/`, `sidebar/`, `canvas/`, `mobile/`, `ai/`,
`primitives/`, `ui/` for shadcn).

## Database

**Migrations in `supabase/migrations/` are the single source of truth.**
`supabase/schema.sql` is stale and missing columns, CHECKs, RPCs, and cron — never author
SQL against it.

Migrations are numbered `NNN_name.sql` and the remote ledger
(`supabase_migrations.schema_migrations`) is kept aligned to those numbers. If you apply
something out-of-band via the SQL editor or MCP, record it in the ledger with the matching
`NNN` version, or `db push` will try to replay it later. Write migrations idempotently
(`add column if not exists`, `drop … if exists`, `do $$ … end$$` guards) — they're
expected to be safe to re-run.

## Conventions and gotchas

- **`<ScrollArea>` ignores `max-h`.** The Radix wrapper silently drops the cap; use a
  plain `overflow-y-auto` container when you need a real height limit.
- **The lime accent never dims in dark mode**, and must never be faded through a parent's
  opacity — give it its own element if the container is being dimmed.
- **`canvas-container` caps the canvas at 1100px**, which is why seven week columns never
  fit on any monitor. The week COLUMN views opt out with `data-wide="true"`; every
  `canvas-container` on the page must flip together (header capsule, past-due bar, grid)
  or they lose the shared left edge the utility exists to guarantee. Its `padding-inline`
  is mirrored in JS as `CANVAS_PAD_PX` — change one, change both. Week × Schedule's pinned
  hour gutter depends on this: a sticky box is constrained to its containing block, so
  restoring the cap would unstick it mid-scroll.
- **Design source of truth is the Figma file, not the mockup PNGs in the repo.** Pull
  specs live via the Figma MCP; the checked-in PNGs drift.
- Some settings persist but are read by no view. That's deliberate — leave them alone
  rather than surfacing or deleting them.
- Recurring items track completion per-date in `completedDates`, never via scalar
  `status`. Habit `streak` is an opaque stored counter (`+1`/`-1` on toggle), not
  recomputable from `completedDates` — resetting a streak must not touch `completedDates`.

## Plans

Longer-running design docs live in [memory/plans/](memory/plans/) and are committed.
[unified-items.md](memory/plans/unified-items.md) carries the phase ledger and the locked
design decisions for the items refactor — read it before touching item types, the
registry, or the agent API.
