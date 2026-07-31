# AI vision — open decisions

Questions from building Phase 1 that are **yours, not mine**: product taste, risk appetite,
or scope. Each says what I did in the meantime, so nothing is blocked — resolved answers
get folded into the locked decisions in [ai-vision.md](ai-vision.md) and deleted from here.

---

## 1. Does the global chat panel survive at all?

The vision demotes chat to an escape hatch, and the panel is already summoned-not-persistent.
Phase 2 adds item threads, which is where conversation is *supposed* to live. So the sidebar
panel could become the **agent activity feed** (proposals, delegated-item status, needs-input)
with no free-form transcript in it at all.

**Current state:** the panel is unchanged; the proposal card renders above the transcript.
**My lean:** keep a free-form ask in the panel, but let the feed take the top of it. Killing
free-form chat entirely would remove the only place to say "why do I keep avoiding this?",
which is a real use even if it is not the main one.

## 2. Should proposals persist?

They are session-only right now. Persisting means a table, a staleness policy, and
cross-device reconciliation — and a resurrected card can propose moving things to a date
that has passed.

**My lean:** keep them ephemeral until item threads exist, then let the *thread* be the
durable record and proposals stay transient. Revisit only if you find yourself wanting a
proposal to survive a reload.

## 3. What may a proposal actually change?

Today: create task-shaped items, and update `title` / `startDate` / `startTime` /
`timeBucket` / `priority` / `status` (status only on non-recurring items). Deliberately
excluded, each for a reason worth confirming:

- **Creating habits** — a habit needs a group and a recurrence rule, and "the AI invented
  you a new daily commitment" felt like a product decision I should not make for you.
- **Clearing fields** ("move it back to the Braindump") — the schema allows null but
  validation strips it, because unscheduling has real semantics beyond writing NULL
  (`unscheduleTasks` also clears `startTime` and `isScheduled`).
- **Deleting anything** — never proposed. Feels right, but it is a choice.
- **Subtasks** — `parent_item_id` exists in the DB and nothing uses it. "Break this into
  steps" currently produces flat sibling tasks. Real nesting needs hierarchy UI.

**Which of these do you want next?** My order: unschedule, then subtasks, then habits.

## 4. Delegation autonomy — confirm the default

The locked model is: propose everywhere, act autonomously *only* on explicitly delegated
items, always with an activity trail and undo. The looser option is a per-user rule like
"Beacon may reschedule overdue items without asking".

**Nothing is built yet**, so this is free to change. Trust is easier to extend than to
rebuild, which is why I locked it tight — but you are the user, and if propose-everywhere
turns out to be friction rather than safety, say so before Phase 2.

## 5. Can habits be delegated at all?

Delegation suits one-shot work ("book the dentist"). A habit is a recurring commitment you
are trying to build — having an agent do your meditation is incoherent. The registry can
express this as a per-type `delegable` capability.

**My lean:** tasks and custom types yes, habits no.

## 6. Is "Beacon" the assistant on both tiers?

Right now the label follows the tier: "OpenClaw · agentId" on the agent tier, "Beacon" on
assistant. So the assistant appears to change identity with a settings toggle. The
alternative is that Beacon is always the name and the tier is an implementation detail.

**My lean:** one name. Beacon is the character; the gateway is plumbing.

## 7. Keep BYOK long-term?

You run a gateway, so on your own account the assistant tier is nearly dead weight. I kept
it because every Pillar 1 feature that works over a bare completion also works for a future
user who will never self-host — and the market read says a mainstream product needs a
hosted tier, which the assistant tier is the rehearsal for.

**Cheap to keep, so I kept it.** Worth confirming you agree it earns its place.

## 8. Anthropic support

`anthropic` is selectable in Settings and wired to nothing. I made the registry say so
explicitly, so surfaces no longer offer actions it cannot perform. Adding it properly is
small — one branch in `/api/chat` and one in `/api/ai/propose`.

**Want it?** You would need an Anthropic key, and it only matters on the assistant tier.

---

## Not decisions — things to verify

These are facts I could not check without a gateway or DB, listed in full with their
one-line fixes in [ai-vision.md](ai-vision.md#unverified-assumptions-test-these-first-with-a-real-gateway).
The short version:

1. **Apply migration 023** (`pnpm db:push`). Until then the gateway transport is inert and
   chat keeps using the plugin path — which is safe, but means nothing new is exercised.
2. **Enable `gateway.http.endpoints.chatCompletions.enabled: true`** on the gateway, then
   put its URL and token into Settings → AI Assistant → Gateway.
3. **Watch for duplicated history** on the second message of a conversation. If the gateway
   is stateless per request instead of session-stateful, flip
   `SEND_FULL_TRANSCRIPT_TO_GATEWAY` in `lib/openclaw-gateway.ts`.
4. **Reachability from Vercel.** Anchor calls the gateway server-side, so browser CORS is
   irrelevant — but a tailnet-only gateway is not reachable from Vercel. Local dev works;
   production likely needs Funnel or equivalent. Most likely thing to be wrong.
