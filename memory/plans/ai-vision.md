# Anchor AI Vision — the item is the unit of collaboration

**Goal:** Anchor is "Linear for personal tasks", built for a neurodivergent audience:
scannable, low-overwhelm, guilt-free, but capability-rich. The AI is not a chatbot bolted
to a planner — it is a **collaborator on the planner itself**. Some items are yours, some
are Beacon's, and the grid tells you at a glance who is doing what and what needs you.

**Status (2026-08-25):** **Phases 1, 2a and 2b SHIPPED.** Phase 1 — the proposal primitive
and the gateway transport (`da56e9b`, `4df4ca7`, `046adb4`, `01d254a`, `2b7dbd7`).
Phase 2a — Anchor as a remote MCP server (`142810c`, `1081f5c`, `eddc778`, `9385854`).
Phase 2b — the delegation loop, built as a pull (`a376de5`, `00ec597`). This document
governs the work the same way [unified-items.md](unified-items.md) governs the items refactor.

**Nothing here has spoken to a real gateway yet.** Every protocol claim is pinned by tests,
not by a handshake — see the verification list in
[ai-vision-decisions.md](ai-vision-decisions.md).

**The re-baseline changed the plan more than the plan changed the code.** Delegation was
further along than this doc assumed: `assignee`/`aiStatus`/`aiResult`, `AgentSection`,
`item_events` and per-item chat threads had all shipped on main while Phase 1 was being
written. What Pillar 2 actually lacked was a transport and the needs-input loop, and both
now exist.

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

## Resolved product decisions (2026-08-25 — Kirby took the recommendations)

Folded here from ai-vision-decisions.md, which now carries only what is still open.

1. **The chat panel keeps a free-form ask.** The agent activity feed takes the top of it;
   the transcript stays underneath. Removing free-form entirely would delete the only place
   to say "why do I keep avoiding this?", which is a real use even though it is not the
   main one.
2. **Proposals stay ephemeral** until item threads are server-persisted. Then the *thread*
   becomes the durable record and proposals stay transient. A resurrected card that
   proposes moving things to a date that has passed is worse than no card.
3. **Proposal scope grows in this order: unschedule → subtasks → habits.** Today a proposal
   may create task-shaped items and change title/date/time/bucket/priority/status (status on
   non-recurring items only). Field-clearing is deliberately next because "put it back in the
   Braindump" is the most-wanted verb and has real semantics beyond writing NULL.
4. **Delegation autonomy stays tight**: propose everywhere; act autonomously only on items
   explicitly delegated, always with a trail and undo. Trust is easier to extend than to
   rebuild, and nothing is built yet, so this is free to loosen later.
5. **Habits are not delegable.** Delegation suits one-shot work; a habit is a recurring
   commitment the user is trying to build, and having an agent do your meditation is
   incoherent. Expressed as the `agentAssignable` registry capability, never a type check.

   *Amended 2026-08-25:* this originally said custom types WERE delegable, and shipping it
   proved otherwise. `/api/agent/tasks/:id` filters on `.eq('type','task')` in both its
   ownership check and its update, and the agent write API does not expose custom types at
   all (a locked v1 decision in [unified-items.md](unified-items.md)) — so a delegated
   custom item appeared in the agent's queue and every progress report on it 404'd, forever,
   with the badge stuck on `queued`. `agentAssignable` is now false on the custom template.
   Flip it back when the agent API grows a type-agnostic item write path; that is the real
   fix, and it is a bigger change than this decision implied.
6. **Beacon is the name on every tier.** The assistant should not appear to change identity
   because a settings toggle moved; the gateway is plumbing, Beacon is the character.
7. **BYOK stays.** On a gateway-owning account it is nearly dead weight, but every Pillar 1
   feature that works over a bare completion also works for a user who will never
   self-host — and it is the rehearsal for the hosted tier.
8. **Anthropic stays declared coming-soon** until there is a reason to wire it. The registry
   now says so explicitly, so no surface offers an action it cannot perform.

## Schema note — where delegation state lives (corrected twice; read the whole note)

*(2026-07-31, revision 3. Revision 1 said "adopt the unused 019 columns". Revision 2
reversed that and locked "delegation never becomes a field on `Item`". Revision 2 was
written against a stale tree and is WRONG — `assignee` / `aiStatus` / `aiResult` shipped
as `taskShape` fields on 2026-07-29 in item-surface-growth Phase 4, and they work.)*

What actually exists, and should be reused rather than rebuilt:

- **`assignee` / `aiStatus` / `aiResult` are fields on `taskShape`** — loose on read, strict
  on write (`aiStatus: 'queued'|'working'|'blocked'|'done'|'failed'`). `AgentSection` in
  [components/planner/item-detail-sections.tsx](../../components/planner/item-detail-sections.tsx)
  already renders assign/unassign and gives `blocked` the destructive treatment, because it
  is "the only state that wants something FROM you".
- **`item_events` (migration 023) is the activity trail.** Its own header anticipated this
  work — *"text (not CHECK) so a future action (completion, assignment, agent progress) is
  additive"* — and `eventLabel` already speaks `assignee` and `aiStatus`. `recordCheckin` is
  the precedent for a deliberate, non-trace event writer.
- **Per-item threads exist** (`itemChatStore(id)`, `ItemThread`), keyed to their own gateway
  session via `itemSessionKey(userId, itemId)`.

Revision 2's *reasoning* was not baseless, and the true part survives as the rule:

> `toLegacyTask` is a spread, so every `taskShape` field enters the frozen `tasks[]`
> projection and joins schema-derived `TASK_FIELDS` → `diffItem` → the 50-entry undo stack.

That is a real hazard for anything that changes *often*. It is not a hazard for these three,
because they are small, stable, and the frozen projection's schema already contains them (so
the plugin's `safeParse` sees no drift), and because agent writes land through
`/api/agent/*` → `lib/db.ts`, never through the store, so they push no history entries.

**Locked, replacing revision 2's rule:** the delegation *state machine* is three fields on
the item (`assignee`, `aiStatus`, `aiResult`) — a handful of transitions per delegation.
Everything **high-frequency** — progress notes, tool traces, partial findings — goes to
`item_events` as trace rows and NEVER to `items`. The split is not a compromise; it is what
the two stores are each for. If `aiStatus` ever needs sub-states that tick, they are events,
not statuses.

Two consequences worth stating: `aiStatus`'s vocabulary becomes a frozen external contract
the moment a real agent writes it, so extend it only additively; and `setItemCompletion` /
`setItemSkip` go through RPCs that bypass `updateItem`, so completions currently emit no
`item_events` — a gap to close when the trail is load-bearing.

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

**Phase 2a — Anchor as an MCP server.** The executor should be an adapter, not a
commitment. Anchor's agent API is the durable asset; which runtime acts on it is not.
Exposing that API over MCP means OpenClaw *and* Claude, ChatGPT, Cursor and anything else
MCP-capable can act on the planner, with no per-vendor plugin each time — OpenClaw's own
docs describe consuming remote MCP servers (`mcp.servers.<name>`, `type: "http"`, OAuth).
Doing it BEFORE delegation matters: it decides whether delegation's contract is written
against a vendor-neutral tool surface or against one gateway's plugin API.

**Phase 2b — delegation, as a PULL. SHIPPED** (`a376de5`, `00ec597`).

The agent asks Anchor what it owes; Anchor never calls the gateway. Three MCP tools close
the loop: `anchor_my_work` (assigned, open items only), `anchor_report_progress` (writes
`aiStatus`/`aiResult`), `anchor_item_activity` (reads the trail, including the user's answer
to a blocked question). The UI half already existed — `AgentSection` — and gained a reply
box on `blocked`.

**Why pull and not `POST /hooks/agent`.** OpenClaw's built-in Tailscale integration
exposes only the Control UI and WebSocket — *"Serve/Funnel only expose the Gateway control
UI + WS"* — not `/v1/*` or `/hooks/*`. Making the push path work from Vercel would mean
hand-rolling a funnel across the whole gateway port, which publishes the endpoint the docs
call **full operator access** to the internet behind one shared password; OpenClaw's own
security audit lists that under *"fix immediately"*. Pull needs no ingress, no second
credential, and no attack surface. The cost is pickup latency, which for "book the dentist"
is not a cost. Funnel + hooks stays available as the upgrade if instant pickup ever matters.

### Wiring it up (gateway side)

Anchor's half is done; the agent needs a schedule. Roughly:

```bash
openclaw cron add anchor-work \
  --schedule '*/10 * * * *' \
  --prompt 'Call anchor_my_work. For each queued item: mark it working, do it, then report
            done with what you found, or blocked with the question you need answered.
            If anchor_my_work returns nothing, stop.'
```

Check `openclaw cron` for the exact flags — the shape above is from the automation docs,
not from a run. **Unverified:** that a cron turn can carry MCP tools. Test with a throwaway
job before relying on it.

**Phase 2c — what delegation still lacks.** It is the largest
surface in the plan (a thread table, delegation storage, agent + browser routes, plugin
tools, hooks kickoff, four UI surfaces) and it is **100% unverifiable without a migration
applied, a reachable gateway, and a hooks token with allowlisted prefixes**. It also
carries the only change that can brick the plugin's entire cached context (any addition to
the context response, which `openclaw-plugin/src/cache.ts` `safeParse`s and throws on).
Writing it blind, overnight, on top of a transport that has never spoken to a real gateway
would produce a large diff nobody can trust. It starts once Phase 1 is confirmed working.

Known gaps, none of them blocking a first run:

- **Nothing un-sticks a `working` item.** If a run dies mid-task the item stays `working`
  forever and later runs skip it. A staleness rule ("working for >N hours → back to
  queued") is the fix, and it wants a real run's timings before being guessed at.
- **Two overlapping runs could both claim the same item.** Claiming is read-then-write with
  nothing atomic behind it. On a personal planner with a ten-minute schedule this is
  unlikely and cheap when it happens; a conditional update is the fix if it ever bites.
- **Only plain tasks can be delegated**, gated by the `agentAssignable` registry capability.
  Custom types are excluded until the agent API can address them — see the amendment to
  decision 5. Habits are excluded permanently, and for a better reason.
- **Item threads are still localStorage-only.** The agent cannot read the conversation on an
  item, only its activity trail. item-surface-growth deferred server persistence on purpose
  — "the first stored chat data deserves its own review" — and that is still the right call.

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
