# @dsul/types

Shared Zod schemas and TypeScript types for [dsul](https://github.com/kjswalls/dsul).

Used by:
- The dsul Next.js app (`lib/planner-types.ts` imports from here)
- The `@dsul/openclaw-context` OpenClaw plugin (validates API responses at runtime)

## Building (dist/ is committed)

Both consumers resolve this package through its **committed `dist/`** — the
`exports` map never points at `src/`. After any `src/` edit:

```bash
pnpm --filter @dsul/types build
git add packages/types/dist
```

CI (`.github/workflows/test.yml`, unit-tests job) rebuilds and fails the
build if `dist/` drifts from `src/`. A TypeScript upgrade in the lockfile can
change emitted output — regenerate and commit when that happens.

## Publishing

No automation exists yet; publishing is manual and **order matters**:

1. `pnpm publish` **this package first** (`prepublishOnly` rebuilds dist).
2. Then `pnpm publish` the `openclaw-plugin/` package. Use **pnpm**, not npm —
   the plugin depends on `@dsul/types` via `workspace:*`, which pnpm
   rewrites to the released version at publish time and npm would ship
   verbatim (breaking installs).

## Install

```bash
npm install @dsul/types
```

## Usage

```ts
import { TaskSchema, type Task, DsulContextResponseSchema } from '@dsul/types'

// Runtime validation — Zod parses and validates the shape
const result = DsulContextResponseSchema.safeParse(apiResponse)
if (!result.success) {
  console.error('dsul API response changed:', result.error)
} else {
  const { tasks, habits } = result.data  // fully typed ✅
}

// Types only — compile-time, no runtime cost
function doSomething(task: Task) { ... }
```

## Why Zod?

TypeScript types disappear at runtime. If dsul's API schema changes and the plugin isn't updated, you'd get silent data corruption. Zod validates the actual JSON shape at runtime and tells you exactly what changed — so schema drift is caught immediately instead of causing subtle bugs downstream.
