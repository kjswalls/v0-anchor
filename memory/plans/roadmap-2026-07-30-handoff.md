# Roadmap session handoff — 2026-07-30

Branch: `claude/anchor-roadmap-features-xk9mfx`. Everything below is committed and
pushed. Nothing here has been merged, and no issues were closed — closing them is
your call.

---

## 1. Shipped

| Issue | What landed |
|---|---|
| #196 | Mobile bug-report button in the header, reusing the shared dialog |
| #191 | Escape in the omnibar now `stopPropagation()`s (see §2 — it already worked) |
| #192 | `v` toggles Day/Week, registered through the command registry |
| #183 | Sonner close button moved upper-right, via Sonner's own CSS vars |
| #184 | "Custom days" pre-selects today, only when nothing is chosen yet |
| #193 | Week bucket content caps and scrolls (partial — see §3.1) |
| #181 | Recurring items no longer render struck-through in the braindump |
| #187 | Dismissing a recurring task leaves the series alone |
| #194 #195 | Recurring tasks are skippable; skipped items minimize on the timeline |
| #59 | `/docs/openclaw` connection guide, linked from Settings → AI |
| #143 #144 #145 #147 | Plugin dead code + `api: any` typed |
| #140 | Plugin context fetch is single-flight |
| #146 #141 | Setup prompts for `publicUrl`; warns when `webhookSecret` is unset |

Gates: `pnpm lint` 0 errors, `pnpm test` 248 passing (17 files), `pnpm build`
clean, `packages/types/dist` rebuilt and matching src. E2E not run — it needs
`.env.test` and a live Supabase, neither available here. Two new e2e cases were
added to `recurring.spec.ts` and have never been executed.

---

## 2. Issues that are already true — close them?

I found no work to do on these. Each one's premise doesn't match the current code.

- **#198 (remove theme toggle from mobile nav)** — there is no theme toggle in any
  nav, mobile or desktop. Theme lives in Settings → Appearance and a command-palette
  entry. Nothing to remove.
- **#197 (auto EOD modal on mobile)** — no unconditional trigger exists. There are
  only two openers: the real time-gated one (off unless you've enabled
  `eodReviewEnabled`), and an `?eod=1` deep link used by push notifications. If you
  still see this, it's most likely the deep link firing from a notification tap.
- **#186 (hide manual EOD/morning trigger buttons)** — the dove buttons were already
  removed in an earlier commit. What survives is two *command-palette* entries
  (`rituals.eod`, "Show overdue tasks"). **Decision:** hide those too, or is this done?
- **#177 (failing connect-routes test)** — fixed by commit `519e387`. Suite was green
  before I touched anything.
- **#137 #138 #139 (plugin cache bugs)** — all three already fixed in current code:
  `shouldRefreshCache` compares `lastModifiedAt` to `fetchedAt`, `lastInjectedAt` is
  already a per-conversation Map, and the webhook handler already dirties before
  fetching.
- **#191 (Esc closes search)** — already worked, with a passing e2e test covering it.
  I only added `stopPropagation()` so it stays correct if the omnibar is ever put
  inside a dialog. If you filed this from real symptoms, tell me what you saw,
  because the code path looks right.

---

## 3. Decisions I need from you

### 3.1 #193 — should Week view render project blocks at all? ⚠️ biggest one
The issue says "recurring project blocks in Week View... scroll the content inside
the project block." But **Week view has no project blocks.** Week × Buckets renders
every task as a flat row; the week timeline renders one block per task. There is
nothing to scroll inside.

An agent's first pass wired `ProjectBlock` cards into Week view to give the fix a
target. I reverted that: it's a visual redesign of Week view that you didn't ask
for, and Figma — which CLAUDE.md names as the design source of truth — isn't
reachable from this session.

**Shipped:** the bucket-level scroll cap (part 2 of the issue, literally as written).
**Parked:** part 1. `ProjectBlock` has a `variant="week"` cap ready and documented;
nothing passes it yet.

**Your call:** should Week view group project tasks into cards like Day view does?
If yes it needs a Figma spec — a full ProjectBlock with its "N tasks available /
Move all" panel is a lot of chrome for a ~240px mini column.

### 3.2 #193 sizing
`WEEK_BUCKET_MAX_H = 320px` is an eyeball value with no spec behind it. Wants a
visual pass.

### 3.3 #192 — is `v` the right key?
Audited against every existing binding, no collision. But it's a bare letter, so
it's a land-grab on a small namespace. Happy to move it to `meta+shift+v` or similar.

### 3.4 ⚠️ The OpenClaw plugin's write tools have never worked
Typing `api: any` (issue #145) surfaced this. The agent loop calls
`execute(toolCallId, params, …)`, but all six Anchor tools declared
`execute(params)` — so every write tool was reading its fields off the tool-call-ID
*string*. `anchor_create_task` would POST a body with no title; `anchor_delete_task`
would DELETE `/api/agent/tasks/undefined`.

Confirmed against the compiled agent loop, and against OpenClaw's own bundled
feishu extension and its shipped plugin docs, which both use
`execute(_toolCallId, params)`. `anchor_get_context` was unaffected — it takes no
params, which is exactly why "reading works, Beacon can't create anything" would
have looked like a different problem.

I realigned all six to the SDK contract. **This is untested against a live
gateway** — I had no OpenClaw instance. Please smoke-test before trusting it.

**Related:** does this need an npm republish (#134)? The plugin ships from its own
`dist`, and the fix is worthless to anyone installing from npm until it's pushed.

### 3.5 #149 — SSE framing that doesn't stream
The issue offers two options: implement real streaming via `runtime.subagent`
callbacks, or drop to plain JSON so the framing stops lying. I didn't pick — it's a
product call about whether streaming chat is wanted soon. My lean: option 2 now
(it's ~10 lines and removes a false signal), option 1 when chat UX gets attention.

### 3.6 New bug found — worth its own issue?
**EOD's "Tomorrow" pill, date picker, and "Move all to tomorrow" shift entire
recurring series.** They call `updateTask(id, { startDate })`, which rewrites the
recurrence anchor. Same class as #187 but a different door — #187 only covered the
✕ dismiss. `planner-store.ts` even documents the hazard for the bulk verb
("Callers are responsible for excluding recurring items") and EOD is a caller that
doesn't. I left it alone because it's out of #187's scope and the right fix
(refuse? apply to this occurrence only?) is a product decision.

### 3.7 Settings reports "Not connected" for a working pull-only install
Connection state is derived from `openclaw_chat_url`, which is only written when
the plugin registers a chat URL — which only happens when `publicUrl` is set. So a
correctly-authorized pull-only install reads as "Not connected". I documented the
quirk in the new guide, but the honest fix is a status that distinguishes
"authorized, pull-only" from "never connected".

### 3.8 Smaller ones
- **#73** (`package.json` name → `anchor`): it's currently `anchor-workspace`, which
  arguably already satisfies the issue and better describes a workspace root.
  Rename anyway, or close?
- **#181 adjacent:** braindump's "hide completed" filter reads scalar `status` for
  recurring items, which is inconsistent with per-date completion. Separate fix?
- **`ItemTypeConfig.accent`** is referenced by `item-dialog.tsx` but doesn't exist in
  the registry — 3 pre-existing tsc errors on main, predating this session. Someone
  started a registry field and didn't finish it.
- **Skip semantics** (from #194): a one-shot task can never be skipped — skip
  requires recurrence, since it's a date in `skippedDates`. Also, skipping clears a
  same-day completion, and a skipped item stays visible-but-minimized even with
  "show completed" off. All three mirror the habit precedent; flagging in case you
  wanted different.
- **Week-view date bug (pre-existing):** completion toggles in week views write
  against `selectedDate` rather than the row's own date, so completing from a week
  column marks the wrong day. I fixed this for *skip* but deliberately left
  *completion* alone — it's a live bug with blast radius beyond this session.

---

## 4. Parked — you said these need brainstorming

Untouched: **#201** (recurring-task home base in sidebar), **#189** (clashing
recurring project times), **#179** (pause habit/task), **#206** (loading quotes —
profanity handling and attribution links), **#200** (schedule versions), **#205**
(bulk multi-select), **#204** (TV apps), **#203** (Atlas view), **#188** (habit
duration), **#158** (recurrence end date), **#185** (reorder within project blocks),
**#182** (align repeating tasks with repeating projects), **#180** (patch-notes modal).

Two of those have useful groundwork already:

- **#188 (habit duration)** is closer than it looks. `item-dialog.tsx` already
  reads and writes `duration` on habits — it just isn't in `habitShape`, which is
  why there are pre-existing tsc errors. `HabitSchema` is a plain `z.object` (strip,
  not strict), so adding an optional `duration` is backward-compatible: older plugin
  builds drop the key rather than throwing. It's mostly a schema + migration away.

- **#190 (Enter on multi-select)** — you asked what I thought. My take: Enter should
  select the focused option, not submit, for multi-selects **and** date/time pickers,
  since in all three the user is mid-choice and submit is a surprise. Keep
  Enter-submits for single-line text inputs — that's the expected affordance and
  removing it would cost more than it saves. So: gate submit on the focused control
  type rather than globally. Say the word and I'll implement it.
