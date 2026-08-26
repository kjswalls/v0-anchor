# scripts

## `e2e-local-setup.sh`

Points the Playwright e2e suite at a **local** Supabase instead of production.

**Why:** the suite used to run against the prod project, creating thousands of
throwaway auth sessions there (a real Disk-IO cost — see
`supabase/migrations/037_disk_io_hygiene.sql`) and a non-starter once the app has
real users. This gives e2e its own disposable local database.

### Prerequisites

- Docker running
- Supabase CLI (`supabase`) — <https://supabase.com/docs/guides/cli>
- Memory: the trimmed stack still runs several containers — budget ~1–1.5 GB RAM.
  It excludes the heavy ones (Studio + the analytics pipeline); the full stack is
  closer to 3 GB.

### Use

```bash
./scripts/e2e-local-setup.sh          # set up only
./scripts/e2e-local-setup.sh --smoke  # set up, then run the smoke spec
```

It starts a trimmed local stack → applies all migrations → creates the test user
→ writes `.env.test` (gitignored) → optionally runs `tests/e2e/smoke.spec.ts`.

Then:

```bash
pnpm e2e            # full suite against local
supabase stop       # shut the stack down (frees the RAM)
```

### Notes

- `.env.test` is regenerated on every run; an existing one is backed up to
  `.env.test.bak`.
- The URL and keys are read live from `supabase status`, never hardcoded, so this
  stays correct across CLI versions.
- CI still uses the hosted values injected from GitHub Actions secrets; wiring CI
  to a local (or Supabase-branch) database is a separate follow-up.
- To move to a hosted test DB later — e.g. after upgrading to Pro and using
  Supabase **branching** — just replace `.env.test` with the hosted values; no
  code changes needed.
