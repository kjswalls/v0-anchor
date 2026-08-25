# AI vision — open decisions

Questions that are **Kirby's, not mine**: product taste, risk appetite, or scope. Each says
what I did in the meantime, so nothing is blocked. Resolved answers move into the locked
decisions in [ai-vision.md](ai-vision.md) and leave here.

**The original eight are resolved** (2026-08-25) and now live in that document's "Resolved
product decisions" section. What follows is what tonight's work opened up.

---

## 1. Scoped API keys, before a third-party runtime holds one

Anchor's agent key is **one per user, plaintext, unscoped, no expiry, full read+write**.
That was fine while the only holder was your own gateway. The MCP server does not widen what
a key can do — it is a second protocol over the same surface — but it does change *who
plausibly holds one*: the whole point of MCP is that Claude, Cursor or ChatGPT can connect.

**Current state:** unchanged, and the route says so in a comment rather than quietly
inheriting it.
**What it would take:** hashed keys with a prefix, multiple named keys per user, a scope
field (read-only vs read-write), and revocation. `plugins-themes-store.md` already warns
that migrating off the single plaintext key needs a **dual-read deprecation window with a
coordinated OpenClaw npm release**, or the drift-throwing plugin client bricks the one
production integration.
**My lean:** do it before you point any hosted runtime at this, and not before — a read-only
key you can hand out is most of the value.

## 2. Does the OpenClaw plugin's tool surface retire?

MCP now covers everything `openclaw-plugin/src/tools.ts` covers, and more (it reaches
projects, subtasks, notes, durations — the plugin never did). Keeping both means two tool
surfaces that can drift.

**Current state:** both exist; the plugin is untouched.
**My lean:** keep the plugin for what only in-process code can do — context injection, the
webhook receiver, the setup CLI — and let its *tools* be superseded by MCP once you have
confirmed a gateway can reach `/api/mcp`. That is a plugin release, so it wants your say-so.

## 3. Webhooks die on serverless — fix now or when it bites?

`lib/openclaw-registry.ts` keeps plugin registrations in an **in-process `Map`**. On Vercel
that dies on cold start and is absent on every other instance, so change notifications are
unreliable today. It matters more with MCP, because resource subscriptions would be built on
it.

**Current state:** untouched; out of scope for tonight.
**What it would take:** the swap `plugins-themes-store.md` Project B already specifies — a
Supabase table modelled on `021_item_types.sql` (per-user rows, RLS, jsonb config).
**My lean:** worth doing before delegation, since "the agent finished" is exactly the event
you would want pushed rather than polled.

## 4. Delegation kickoff — hooks token, or let the agent spawn it?

Phase 2b needs something that actually *starts* a background run. Two shapes: Anchor calls
`POST /hooks/agent` on the gateway (needs a dedicated `hooks.token`, a second credential to
store and explain), or the in-chat agent calls `sessions_spawn` itself when you ask it to
take something on (no new credential, but the kickoff only happens inside a conversation).

**Current state:** neither; `user_secrets.openclaw_hooks_token` exists and is unused.
**My lean:** the hooks path, because "delegate" should work from the item without opening a
chat. But it is the first place delegation costs you setup, so it is your call.

---

## Not decisions — things to verify

Full detail in [ai-vision.md](ai-vision.md#unverified-assumptions-test-these-first-with-a-real-gateway).

1. **Apply migration 037** (`pnpm db:push`). Until then the gateway transport is inert, the
   settings rows say "needs a database update", and chat keeps using the plugin path.
2. **Enable `gateway.http.endpoints.chatCompletions.enabled: true`** on the gateway, then put
   its URL and token into Settings → Beacon (both rows are behind Advanced).
3. **Test session memory**, not duplication: say "my favourite colour is green", then ask
   what it is. Remembering means the gateway is session-stateful and the default is right;
   forgetting means it is stateless per request — flip `SEND_FULL_TRANSCRIPT_TO_GATEWAY` in
   `lib/openclaw-gateway.ts`.
4. **Reachability from Vercel.** Anchor calls the gateway server-side, so browser CORS is
   irrelevant — but a tailnet-only gateway is not reachable from Vercel. Local dev works;
   production likely needs Funnel or equivalent. Still the most likely thing to be wrong.
5. **Point a real MCP client at `/api/mcp`.** Nothing has spoken to it yet — the protocol is
   pinned by tests, not by a handshake. OpenClaw takes remote Streamable HTTP servers with
   custom headers, which is exactly the shape this server needs:

   ```bash
   openclaw mcp add anchor \
     --url https://<anchor-host>/api/mcp \
     --transport streamable-http
   # then add the header through the scoped config editor or config:
   #   mcp.servers.anchor.headers.Authorization = "Bearer anchor_<key>"
   #   (keep the key out of config literals — use the secret mechanism)
   openclaw mcp doctor anchor --probe
   ```

   `doctor --probe` is the real proof: the docs are explicit that saving a definition proves
   nothing about reachability. A successful probe listing eleven `anchor_*` tools is the
   first time this code has spoken to a client. `--include` can narrow the tool set if you
   want the agent to see only reads at first.
