# @anchor-app/types

Shared Zod schemas and TypeScript types for [Anchor](https://github.com/kjswalls/v0-anchor).

Used by:
- The Anchor Next.js app (`lib/planner-types.ts` imports from here)
- The `@anchor-app/openclaw-context` plugin (validates API responses at runtime)

## Install

```bash
npm install @anchor-app/types
```

## Usage

```ts
import { TaskSchema, type Task, AnchorContextResponseSchema } from '@anchor-app/types'

// Runtime validation — Zod parses and validates the shape
const result = AnchorContextResponseSchema.safeParse(apiResponse)
if (!result.success) {
  console.error('Anchor API response changed:', result.error)
} else {
  const { tasks, habits } = result.data  // fully typed ✅
}

// Types only — compile-time, no runtime cost
function doSomething(task: Task) { ... }
```

## Why Zod?

TypeScript types disappear at runtime. If Anchor's API schema changes and the plugin isn't updated, you'd get silent data corruption. Zod validates the actual JSON shape at runtime and tells you exactly what changed — so schema drift is caught immediately instead of causing subtle bugs downstream.
