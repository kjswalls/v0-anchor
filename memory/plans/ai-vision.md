# Anchor AI Vision — the item is the unit of collaboration

**Goal:** Anchor is "Linear for personal tasks", built for a neurodivergent audience:
scannable, low-overwhelm, guilt-free, but capability-rich. The AI is not a chatbot bolted
to a planner — it is a **collaborator on the planner itself**. Some items are yours, some
are Beacon's, and the grid tells you at a glance who is doing what and what needs you.

**Status (2026-07-31):** Vision agreed; phases defined below. Nothing shipped yet — this
document is the governing design, written before the first line of implementation, the
same role [unified-items.md](unified-items.md) plays for the items refactor.

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

## Schema note — the delegation columns already exist

Migration 019 carried these onto `items` (originally from 007's future-proofing), all
nullable, no CHECKs, and **not mapped app-side anywhere** (`lib/db.ts`,
`lib/planner-types.ts`, `packages/types` have no reference):

- `assignee text` — who owns the item (user vs agent)
- `ai_status text` — delegation lifecycle
- `ai_result text` — result payload
- `parent_item_id uuid` — FK to `items(id)`, indexed — **subtasks**, which is also where
  "break this down into steps" proposals land

So delegation needs far less migration than expected: primarily a thread-entries table
plus indexes, not a redesign of `items`.

## Phasing (the app must work at every step)

**Phase 1 — the proposal primitive + the transport fix.** Ships value on the *assistant*
tier alone, so it needs no gateway to be real.
- AI capability registry; replace provider-string branching.
- Proposal schema, store, and `ProposalCard`, reusing the one-decision-at-a-time patterns
  already in [components/ai/morning-triage-list.tsx](../../components/ai/morning-triage-list.tsx).
- Batched `applyProposal` in planner-store (one undo).
- Server-side gateway transport (`/v1/chat/completions`, SSE translation, stable session
  key), added **alongside** the existing plugin path, opt-in.
- Extract the duplicated SSE parse loop in `chat-store.ts` into one tested helper.

**Phase 2 — delegation + item threads.** OpenClaw tier.
- Migration: thread entries table (+ RLS), delegation indexes; adopt the existing
  `assignee` / `ai_status` / `ai_result` / `parent_item_id` columns.
- Agent API routes for progress reporting, reusing `lib/agent-api.ts` machinery.
- Plugin tools for report-progress / read-my-work (TypeBox params, matching house style).
- `POST /hooks/agent` kickoff from Anchor's server.
- UI: delegate action, status chip on the item, thread panel, needs-input surface.
- Sidebar becomes the agent activity feed.

**Phase 3 — seams, not speculation.** Explicitly *not* building hosted-tier
infrastructure: it would sit on unvalidated phases 1–2. Phase 3 tonight is this document,
the capability-registry seam that lets a hosted tier slot in as config, and the honest
list of what a hosted tier would require (server-held keys, per-user rate limits and cost
accounting, an Anchor-operated agent runtime, abuse controls).

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
