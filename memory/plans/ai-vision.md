# Anchor AI Vision — the item is the unit of collaboration

**Goal:** Anchor is "Linear for personal tasks", built for a neurodivergent audience:
scannable, low-overwhelm, guilt-free, but capability-rich. The AI is not a chatbot bolted
to a planner — it is a **collaborator on the planner itself**. Some items are yours, some
are Beacon's, and the grid tells you at a glance who is doing what and what needs you.

**Status (2026-07-31):** **Phase 1 SHIPPED** (`da56e9b` one SSE parser, `4df4ca7` the
proposal primitive, `046adb4` the gateway transport, `01d254a` review fixes). Phase 2
(delegation) is deliberately **not started** — see the phasing section for why. This
document governs the work the same way [unified-items.md](unified-items.md) governs the
items refactor.

**What works right now, with no configuration at all:** the "Pick things back up" command
(omnibar, or `/catchup`) produces a catch-up proposal computed locally — no key, no
gateway, no network — and accepting it is one undoable gesture. Everything else needs
either an OpenAI key (assistant tier) or a gateway (agent tier).

---

## The core insight

What made Linear work is not features — it is that **the issue is the unit of
coordination**. Humans (and now agents) collaborate *on the issue*: status, assignee,
activity trail, comments. Nobody coordinates work in Linear through a chat window.

Applied to Anchor: the **item** is where the user and the agent meet. This matters twice
over for the audience, because **chat is a hostile primary interface for neurodivergent
users**. It demands initiation (blank-box paralysis), produces walls of text (scanning
cost), holds no state you can glance at (out of sight, gone), and quietly manufactures
guilt ("I asked it to plan Monday and then ignored it"). The best AI surfaces in Anchor
today are the ones that are *not* chat — morning triage and EOD review are app-initiated,
bounded, and one-decision-at-a-time. That is the pattern to bet on.

Note the codebase already leans this way: the chat panel is summoned from the omnibar and
unmounts when collapsed — "there is no persistent chat bar"
([components/sidebar/chat-panel.tsx](../../components/sidebar/chat-panel.tsx)). Demoting
chat is finishing a direction the app already started, not a reversal.

## Three pillars

**Pillar 1 — Executive-function prosthetic (the core value).** The AI does the *planning
work*: triages the braindump, breaks down the overwhelming task, proposes a realistic day,
reschedules slipped items without ceremony. This is the product for this audience, and it
is cheap: each is a single completion over context the app already builds
([lib/ai-context.ts](../../lib/ai-context.ts)), so it works identically on **both tiers**.

The guilt-free mechanic falls out of it: an overdue task never shows a red badge, it shows
Beacon's *proposed new plan*, one tap to accept. The AI absorbs the shame-work of
rescheduling. This generalizes the tone already set by "Still waiting" in
[lib/item-registry.ts](../../lib/item-registry.ts) and `BarCopy` in
[components/ai/morning-check.tsx](../../components/ai/morning-check.tsx).

**Pillar 2 — Delegation (the differentiator).** Assign an item to the agent; it works in
the background and reports progress **on the item** — Linear-style assignee, status,
activity trail, needs-input. OpenClaw tier only. The plumbing largely exists: the plugin
already has tools to read context and mutate items, and webhooks already flow back. What
is missing is product, not infrastructure.

**Pillar 3 — Chat, demoted to an escape hatch.** Not deleted — *re-anchored*. What
disappears is the global, persistent, about-nothing transcript, which is precisely the
part that is hostile to the audience. Conversation reappears wherever it has an anchor:

- **Item threads (the workhorse).** Every item expands into an activity feed —
  status changes, agent actions, and conversation interleaved. Delegation collaboration
  happens here. Deep agent work does not need a chat app; it needs a good thread on the item.
- **The omnibar `?` ask (the front door).** One keystroke, ask anything, get a **card**
  back — an answer, or a proposal with accept/dismiss — not a transcript. Initiation is
  cheap; conversation is a consequence, not a destination.
- **Ritual conversations.** Morning triage and EOD review become conversational *inside a
  structure*: a finite deck of decisions, free-text replies allowed at any step, and a
  visible end. Chat with a progress bar and an exit.

The sidebar becomes an **agent activity feed** — recent proposals, delegated item status,
the needs-input queue — each entry linking into its item thread. The framing: *the sidebar
shows the agent's work; conversations live on the work items.*

## Capability tiers

Tiers, not "provider with a fallback". They are **not** equivalent, and the UI must never
pretend they are.

| Tier | Transport | Pillars |
|---|---|---|
| **assistant** (BYOK OpenAI, or none/mock) | Next.js route → provider | 1 only |
| **agent** (user's OpenClaw gateway) | Next.js route → gateway | 1 + 2 |
| *hosted (future)* | Anchor-operated agent | 1 + 2, zero config |

Two traps to avoid. **Do not make BYOK do delegation** — that means rebuilding OpenClaw
inside Anchor (tool loop, task queue, background workers). **Do not branch on provider
strings in the UI.** The house pattern is already established: do what
[lib/item-registry.ts](../../lib/item-registry.ts) does and ask a capability question
(`canDelegate()`, `canPropose()`, …). Adding the hosted tier must be config, not code paths.

## Trust model

Predictability *is* the feature for this audience, so the default is conservative:

1. **The AI proposes; the user accepts with one tap.** Proposals are first-class objects
   (a diff + accept/dismiss), never silent mutations.
2. **The agent acts autonomously only on items explicitly delegated to it**, always with a
   visible activity trail and undo.
3. Everything else is read-only to the agent from the UI's perspective.

Looser policies ("Beacon may auto-reschedule overdue items") can be added per-user later.
Trust is easier to extend than to rebuild.

## Integration architecture — three surfaces

Researched against docs.openclaw.ai (2026-07-31). These facts are load-bearing:

- **Sessions have no TTL by default** (`session.reset.mode: "none"`); opt-in `daily`
  (`session.reset.atHour`, default 4) or `idle` resets. A reset keeps the sessionKey and
  starts a new sessionId; transcripts archive to disk. Long contexts are handled by
  compaction, not truncation.
- **Subagent sessions auto-archive after `archiveAfterMinutes` (default 60).** The current
  plugin chat endpoint is built on `runtime.subagent.run` + `waitForRun` +
  `getSessionMessages`, so **Beacon's server-side memory silently evaporates after ~an
  hour today.** This is a real bug, and it is not fixable inside that primitive: subagent
  runs do not stream, and the `subagent:` namespace gets cron-style maintenance aging
  rather than durable-conversation retention.
- **The docs draw a hard line:** external apps must not import `openclaw/plugin-sdk/*`.
  External apps use the Gateway WebSocket protocol (`@openclaw/gateway-client`, browser
  entry available, Ed25519 device pairing) **or** the OpenAI-compatible HTTP API.
- The OpenAI-compatible endpoint is **disabled by default**
  (`gateway.http.endpoints.chatCompletions.enabled`), supports real SSE streaming, and is
  **stateless per request** unless routed with a stable `user` string or the
  `x-openclaw-session-key` header. Docs warn it is **full operator access** — never expose
  its token to a browser.
- Background work: `POST /hooks/agent` (dedicated `hooks.token`, `sessionMode: "isolated"`,
  `idempotencyKey`) returns after runner admission (≤15s), not completion. Sub-agent
  announce is **best-effort and lost on gateway restart**.

Which yields three surfaces:

**1. Conversation → OpenAI-compatible `/v1/chat/completions`, proxied server-side.**
Anchor's Next.js route handler calls the gateway with `stream: true` and translates the
OpenAI-shaped chunks into the `{content}` / `{error}` / `[DONE]` frames the client already
parses, so both tiers share one client code path and the operator token never reaches the
browser. A stable session key per thread gives every item thread durable gateway-side
memory under the no-TTL default.

*This also closes a live security gap:* today the browser holds an Anchor API key and POSTs
directly to the gateway ([lib/chat-store.ts](../../lib/chat-store.ts),
[app/api/agent/chat-url/route.ts](../../app/api/agent/chat-url/route.ts)). After this, the
browser talks only to Anchor.

**2. Delegation → `POST /hooks/agent`,** with the agent reporting results back through the
Anchor items tools the plugin already registers. Because announce is best-effort,
**Anchor's DB is the source of truth** for threads and delegation state; gateway reports
are notifications. Gateway sessions are disposable working memory, always re-primable from
stored thread history.

**3. The plugin stays — shrunk to what only in-process code can do.** The "external apps
shouldn't use the plugin SDK" rule is about *which code uses which surface*, not about who
wrote it. `openclaw-plugin/` runs **inside** the gateway process, so it is a legitimate
plugin and remains the only way to register agent tools. Anchor's Next.js server is the
external app, and it talks HTTP. Two codebases, two roles.

Known third-party plugin limits (bundled-only, not available to us):
`api.session.workflow.scheduleSessionTurn`, `api.runtime.gateway.request`,
`sendSessionAttachment`, and any unprompted push to a channel. Anything needing those must
be driven from Anchor's side via hooks/cron instead.

**ClawBoy-expo is not part of this architecture.** It is an independent OpenClaw client and
a place to borrow code from if a need arises; Anchor requires no shared code with it. (Note
for that repo separately: current gateways pin operator clients to protocol v4; a v3-only
client will stop connecting.)

---

## Locked design decisions

1. **The item is the collaboration surface.** Conversation is anchored to an item, a
   ritual, or a one-shot ask. No global persistent transcript is reintroduced.
2. **Propose-by-default.** Every AI mutation outside a delegated item is a proposal the
   user accepts. Accepting applies through **existing planner-store actions** — never a
   parallel mutation path.
3. **Accepting a proposal is ONE undo.** It must follow the batched-action pattern
   (`moveTasksToDate` / `unscheduleTasks` in
   [lib/planner-store.ts](../../lib/planner-store.ts)): one `set()` → one history entry →
   one Cmd+Z, with `setNextActionLabel` armed before the set.
4. **Tiers are a capability registry**, modeled on `item-registry.ts`. No `provider ===
   'openclaw'` checks in components.
5. **Delegation state must never overload `items.status`.** Task/habit status vocabularies
   are frozen external contracts (the plugin `safeParse`s the context response and
   **throws** on drift). Delegation rides its own columns.
6. **Anchor's DB is the source of truth**; gateway sessions are disposable working memory.
7. **The operator/gateway token is server-side only.** It lives in `user_secrets`
   (service-role only, per migration 012) and must never enter a client component or the
   browser bundle.
8. **All context-response additions stay `.optional()`** — old plugin builds parse the
   whole response with one `safeParse`.
9. **The existing plugin chat path keeps working** until the user deliberately switches
   transports. No flag day.

## Schema note — delegation must NOT enter the `Item` type

*(Corrected 2026-07-31. The first version of this note said to adopt the existing columns
app-side; a review found that would leak straight into a frozen external contract.)*

Migration 019 did carry `assignee`, `ai_status`, `ai_result` and `parent_item_id` onto
`items` (from 007's future-proofing) — all nullable, no CHECKs, referenced nowhere in
`lib/db.ts`, `lib/planner-types.ts` or `packages/types`. Tempting, and a trap:

```ts
// lib/db.ts
export function toLegacyTask(item: TaskItem): Task {
  const { type: _type, ...task } = item;   // ← spreads EVERYTHING else
  return task;
}
```

The legacy projection is a spread. Any field added to `taskShape` therefore (1) appears in
the frozen `tasks[]` the agent API serves, (2) joins schema-derived `TASK_FIELDS`, which
drives `diffItem` and so the undo/redo DB sync, and (3) has to be threaded through the
per-type db allowlists. Delegation state changes many times a minute while an agent works;
routing that through undo history and a frozen external contract is wrong in three
directions at once.

**Locked: delegation state lives in a side table and an app-side store keyed by item id.
It never becomes a field on `Item`.** The 019 columns stay unused — leave them alone
rather than repurposing them, so nothing implies the Item type owns this. `parent_item_id`
is a separate question (real subtasks) and is not part of delegation.

## Unverified assumptions (test these first, with a real gateway)

Written down because none could be checked without a gateway, and each has a one-line fix:

1. **Does posting to a keyed session APPEND or REPLACE history?** The gateway holds session
   state, so resending a full transcript each turn may duplicate it. Anchor currently sends
   the system prompt plus only the newest turn, behind
   `SEND_FULL_TRANSCRIPT_TO_GATEWAY` in `lib/openclaw-gateway.ts`. Under-sending costs
   context the gateway already has; over-sending corrupts it. **Flip the constant if a
   gateway turns out to be stateless per request.**
2. **Does the OpenAI-compatible endpoint accept `x-openclaw-session-key` from Anchor's
   origin,** with `gateway.http.endpoints.chatCompletions.enabled: true`? If not, fall back
   to the OpenAI `user` field, which the docs say derives a stable key.
3. **What does `model` mean here?** Anchor sends `agentId ?? 'default'`. If a gateway
   rejects that, it needs its own config field rather than reusing `openclaw_agent_id`.
4. **CORS/ingress**: Anchor calls the gateway server-side, so browser CORS does not apply —
   but the gateway must be reachable from wherever Anchor runs (Vercel), which a
   tailnet-only gateway is not. Local dev works; production may need Tailscale Funnel or
   equivalent. This is the most likely thing to be wrong.

## Phasing (the app must work at every step)

**Phase 1 — the proposal primitive + the transport fix. SHIPPED.**
- `lib/ai-registry.ts` — the capability registry.
- `lib/proposal.ts` / `lib/proposal-store.ts` / `components/ai/proposal-card.tsx` /
  `app/api/ai/propose/route.ts` — proposals, with the catch-up case computed locally.
- `planner-store.applyProposal` — batched, one undo.
- `lib/sse.ts` — one parser for every transport.
- `lib/openclaw-gateway.ts` + the `/api/chat` gateway branch + `/api/agent/gateway` +
  migration 023 — the server-side transport, alongside the plugin path, opt-in by config.

**Phase 2 — delegation + item threads. NOT STARTED, deliberately.** It is the largest
surface in the plan (a thread table, delegation storage, agent + browser routes, plugin
tools, hooks kickoff, four UI surfaces) and it is **100% unverifiable without a migration
applied, a reachable gateway, and a hooks token with allowlisted prefixes**. It also
carries the only change that can brick the plugin's entire cached context (any addition to
the context response, which `openclaw-plugin/src/cache.ts` `safeParse`s and throws on).
Writing it blind, overnight, on top of a transport that has never spoken to a real gateway
would produce a large diff nobody can trust. It starts once Phase 1 is confirmed working.

When it does start, the order is: migration 024 (thread entries + delegation side table,
RLS, indexes) → `@anchor-app/types` schemas → `lib/db.ts` helpers that `console.warn` and
return `null` on a missing relation, with an `available` flag defaulting FALSE (mirroring
`fetchItemTypes` / `itemTypesAvailable`) → agent API routes on the `lib/agent-api.ts`
machinery, each calling `verifyItemOwnership` **without loosening its signature** → plugin
tools → UI behind `canDelegate()`. The context-response addition comes last and alone.

**Phase 3 — seams, not speculation.** Explicitly *not* building hosted-tier
infrastructure: it would sit on an unvalidated Phase 1. Phase 3 is this document, the
capability-registry seam that lets a hosted tier slot in as one config row, and an honest
statement of what a hosted tier actually needs before it is a product: server-held provider
keys with per-user cost accounting and rate limits, an Anchor-operated agent runtime
(nobody else's gateway to lean on), abuse controls, and a support answer for "the agent did
something I didn't want". That is a business, not a sprint — the market read is that it is
also the only path off the power-user tier.

## Market context (2026-07, research summary)

Worth recording because it shapes priority, not just morale.

- **The composite is unoccupied.** Nobody ships personal day/week planner + habits +
  braindump + agent-as-assignee reporting on the item.
- **ADHD planners stop at breakdown/chat.** Tiimo (Apple's iPhone App of the Year, Dec
  2025; ~500k users / ~50k paid on ~€4.3M raised) does AI breakdown and a copilot, no
  agents. Structured is deliberately AI-minimal. Goblin Tools is free and beloved.
- **Agent products are chat-first.** ChatGPT Agent, Claude Cowork, Gemini Agent, Copilot
  background Tasks all execute, but work lives in transcripts — invisible and unauditable.
  That legibility gap is exactly what an item thread fixes.
- **"Agent as assignee" is proven, but only in B2B**: Linear's Agent API, Asana AI
  Teammates, Notion external agents. Motion is the one task-UI-plus-execution product and
  it went B2B at $49–599/mo, now drawing complaints that agents do irrelevant things.
- **Threats:** Google's unreleased "Remy" has ongoing/background-task sections; execution
  is commoditizing fast.
- **Therefore the moat is not execution.** It is the planning surface, the trust/legibility
  layer, and the neurodivergent design language. The Tiimo/Sunsama/Structured segment is
  evidence that for this audience, UI opinion beats raw capability.
- **Self-hosted does not convert to mainstream.** No consumer SaaS has converted the
  OpenClaw crowd (~380k stars). BYO-gateway is the evangelist/power tier and the personal
  daily driver; a mainstream product would need the hosted tier.

## Verification gates

- `pnpm lint`, `pnpm test`, `pnpm build` green at every commit.
- The app behaves **exactly as before** when the new migration is unapplied and no gateway
  is configured. Feature-detect; fail soft; never hard-500 an existing screen.
- Nothing may make the plugin's `safeParse` of `/api/agent/context` throw — one bad item
  bricks the entire cached context.
- No path may leak the gateway token into a client component or the browser bundle.

## Open questions for the user

Tracked in [ai-vision-decisions.md](ai-vision-decisions.md) — resolved answers get folded
back into the locked decisions above.
