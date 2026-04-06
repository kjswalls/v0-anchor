import { readConfigFileSnapshotForWrite, writeConfigFile } from 'openclaw/plugin-sdk/config-runtime'
import type { OpenClawConfig } from 'openclaw/plugin-sdk/config-runtime'

const ANCHOR_URL = 'https://v0-anchor-plum.vercel.app'
const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 15 * 60 * 1000 // 15 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runSetup(): Promise<void> {
  console.log('\n⚓  Anchor — Device Authorization\n')

  // 1. Initialize session
  let sessionId: string
  let userCode: string
  let connectUrl: string
  try {
    const res = await fetch(`${ANCHOR_URL}/api/agent/connect/init`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error(`❌  Failed to start session: ${body.error ?? res.statusText}`)
      process.exit(1)
    }
    const data = await res.json() as {
      sessionId: string
      userCode: string
      connectUrl: string
      expiresAt: string
    }
    sessionId = data.sessionId
    userCode = data.userCode
    connectUrl = data.connectUrl
  } catch (err) {
    console.error(`❌  Could not reach Anchor: ${(err as Error).message}`)
    process.exit(1)
  }

  // 2. Print instructions
  console.log('  Open this URL in your browser:')
  console.log(`  ${connectUrl}\n`)
  console.log('  Waiting for authorization...\n')

  // 3. Poll loop
  const deadline = Date.now() + MAX_WAIT_MS
  let dots = 0

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    let poll: { status: string; apiKey?: string; anchorUrl?: string; error?: string }
    try {
      const pollRes = await fetch(
        `${ANCHOR_URL}/api/agent/connect/poll?session=${encodeURIComponent(sessionId)}`
      )
      poll = await pollRes.json()
    } catch {
      // Network hiccup — retry on next interval
      process.stdout.write('.')
      dots++
      continue
    }

    if (poll.status === 'authorized' && poll.apiKey) {
      if (dots > 0) process.stdout.write('\n')

      // 4. Validate the key works
      try {
        const ctxRes = await fetch(`${ANCHOR_URL}/api/agent/context`, {
          headers: { Authorization: `Bearer ${poll.apiKey}` },
        })
        if (!ctxRes.ok) {
          console.error(`\n❌  Key validation failed: ${ctxRes.status} ${ctxRes.statusText}`)
          process.exit(1)
        }
        const ctx = await ctxRes.json() as { tasks?: unknown[]; habits?: unknown[] }
        console.log(`\n✅  Connected! Found ${ctx.tasks?.length ?? 0} tasks, ${ctx.habits?.length ?? 0} habits.`)
      } catch (err) {
        console.error(`\n❌  Could not validate connection: ${(err as Error).message}`)
        process.exit(1)
      }

      // 5. Write config
      await writePluginConfig(ANCHOR_URL, poll.apiKey)
      console.log('Config saved. Restart the gateway: openclaw gateway restart\n')
      return
    }

    if (poll.status === 'expired') {
      if (dots > 0) process.stdout.write('\n')
      console.error('\n❌  Session expired. Run setup again.')
      process.exit(1)
    }

    if (poll.status === 'consumed') {
      if (dots > 0) process.stdout.write('\n')
      console.error('\n❌  Session already used. Run setup again.')
      process.exit(1)
    }

    // Still pending
    process.stdout.write('.')
    dots++
  }

  if (dots > 0) process.stdout.write('\n')
  console.error('\n❌  Timed out waiting for authorization.')
  process.exit(1)
}

async function writePluginConfig(anchorUrl: string, apiKey: string): Promise<void> {
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite()

  const config = snapshot.config as OpenClawConfig & Record<string, unknown>
  const plugins = ((config.plugins ?? {}) as Record<string, unknown>)
  const entries = ((plugins.entries ?? {}) as Record<string, unknown>)
  const existing = ((entries['anchor-context'] ?? {}) as Record<string, unknown>)

  entries['anchor-context'] = {
    ...existing,
    enabled: true,
    config: {
      'anchor-context': { anchorUrl, apiKey },
    },
  }
  plugins.entries = entries
  ;(config as Record<string, unknown>).plugins = plugins

  await writeConfigFile(config, writeOptions)
}
