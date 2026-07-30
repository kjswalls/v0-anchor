# @anchor-app/anchor-context

> OpenClaw plugin — brings your [Anchor](https://github.com/kjswalls/v0-anchor) tasks, habits, and projects into every AI conversation.

Once installed, your OpenClaw agent automatically knows what's on your plate — from any channel (Discord, WhatsApp, webchat, wherever). No more copy-pasting your to-do list into chat.

## How it works

- **On startup:** fetches your full Anchor context and caches it locally
- **On demand:** the agent calls the `anchor_get_context` tool when it needs your
  plate — the model decides when, rather than the plugin guessing from keywords.
  Repeat calls inside one conversation return a short "context unchanged"
  acknowledgement instead of re-spending the tokens.
- **On data change:** Anchor pushes a webhook → cache invalidates instantly (zero polling, always fresh)

## Install

```bash
openclaw plugins install @anchor-app/anchor-context
```

## Setup

```bash
openclaw anchor-context setup
```

The wizard prints a link and waits. Open it, sign in to Anchor, check that the
code on screen matches the one in your terminal, and authorize. The terminal
picks it up and writes the config for you — there is no API key to copy by hand.
The code is single-use and expires after 15 minutes; if you miss it, just run
setup again.

It then asks for your gateway's **public URL** (e.g.
`https://midgar-1b4eaa3.turkey-rockhopper.ts.net`). Leave it blank for pull-only
mode: your agent can still read your tasks, but Anchor can't push changes to it
and the Anchor sidebar chat stays off. You can add `publicUrl` to `openclaw.json`
later — re-running setup preserves keys you've set by hand.

Then restart the gateway:

```bash
openclaw gateway restart
```

That's it. Your agent now sees your tasks from Discord, webchat, Signal — everywhere.

## What the agent sees

`anchor_get_context` returns a compact summary of your day:

```
## Today's Tasks
- Fix login bug [high] (Anchor project) @ 10:00
- Review PR
- Write release notes [medium]

## Habits
- ✅ Morning walk (12 day streak)
- ⬜ Read 30 min (5 day streak)

## Projects
- 🪝 Anchor
- 🎮 Side project
```

Alongside it the plugin registers write tools, so the agent can act on what it
reads rather than just describe it: `anchor_create_task`, `anchor_update_task`,
`anchor_delete_task`, and the matching `anchor_*_habit` trio. Deletes are soft —
Anchor keeps them in the trash for 30 days.

## Configuration

Config lives in `openclaw.json` under `plugins.entries.anchor-context.config.anchor-context`:

| Key | Required | Description |
|-----|----------|-------------|
| `anchorUrl` | ✅ | Base URL of your Anchor deployment (written by setup) |
| `apiKey` | ✅ | Your personal Anchor API key (written by setup) |
| `publicUrl` | Optional | Your gateway's public URL. Required for webhook push and the Anchor sidebar chat; omit for pull-only mode |
| `webhookSecret` | Optional | HMAC secret for verifying change event payloads. **Without it the webhook endpoint accepts unsigned requests** — set it if your gateway is reachable from the internet |
| `agentId` | Optional | OpenClaw agent that backs the Anchor sidebar chat (default: `main`) |
| `cacheTtlMs` | Optional | Max cache age before re-fetch (default: `300000` = 5 min) |

## Requirements

- OpenClaw ≥ 2026.0.0
- An Anchor account with the OpenClaw API enabled

## License

MIT
