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

pnpm workspace (Node 24). `packages/types` is `@anchor-app/types`; `openclaw-plugin/`
is a separate consumer of the agent API with its own `dist` that CI gates against `src`.

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
