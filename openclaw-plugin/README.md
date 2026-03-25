# @anchor-app/openclaw-context

> OpenClaw plugin — brings your [Anchor](https://github.com/kjswalls/v0-anchor) tasks, habits, and projects into every AI conversation.

Once installed, your OpenClaw agent automatically knows what's on your plate — from any channel (Discord, WhatsApp, webchat, wherever). No more copy-pasting your to-do list into chat.

## How it works

- **On startup:** fetches your full Anchor context and caches it locally
- **On every message:** injects a compact summary if your message is planning-related, or a tiny header otherwise (~20 tokens)
- **On data change:** Anchor pushes a webhook → cache invalidates instantly (zero polling, always fresh)

## Install

```bash
openclaw plugins install @anchor-app/openclaw-context
```

## Setup

```bash
openclaw anchor-context setup
```

The wizard will ask for:
1. Your Anchor URL (e.g. `https://anchor.yourdomain.com`)
2. Your personal Anchor API key — generate it in **Anchor → Settings → AI Assistant → OpenClaw**

Then restart the gateway:

```bash
openclaw gateway restart
```

That's it. Your agent now sees your tasks from Discord, webchat, Signal — everywhere.

## What gets injected

**Planning messages** (contains "task", "today", "habit", "plan", etc.) get the full summary:

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

**Everything else** gets a lightweight header (~20 tokens):

```
[Anchor: 3 tasks today, 1 overdue, 2 habits pending — say "show my tasks" for details]
```

## Configuration

Config lives in `openclaw.json` under `plugins.entries.anchor-context.config.anchor-context`:

| Key | Required | Description |
|-----|----------|-------------|
| `anchorUrl` | ✅ | Base URL of your Anchor deployment |
| `apiKey` | ✅ | Your personal Anchor API key |
| `webhookSecret` | Optional | HMAC secret for verifying change event payloads |
| `cacheTtlMs` | Optional | Max cache age before re-fetch (default: `300000` = 5 min) |

For push invalidation (real-time cache updates), also set `gateway.publicUrl` in `openclaw.json` to your OpenClaw instance's public URL.

## Requirements

- OpenClaw ≥ 2026.0.0
- An Anchor account with the OpenClaw API enabled

## License

MIT
