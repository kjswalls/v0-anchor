import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { writeConfigFile, readConfigFileSnapshotForWrite } from 'openclaw/plugin-sdk/config-runtime'

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({ input, output })

  console.log('\n⚓  Anchor Context Plugin — Setup\n')
  console.log('You\'ll need your personal Anchor API key.')
  console.log('Generate one at: Anchor → Settings → AI Assistant → OpenClaw → "Generate key"\n')

  const anchorUrl = (await rl.question('Anchor URL (e.g. https://anchor.yourdomain.com): ')).trim().replace(/\/$/, '')
  if (!anchorUrl.startsWith('http')) {
    console.error('❌  URL must start with http:// or https://')
    rl.close()
    process.exit(1)
  }

  const apiKey = (await rl.question('Your Anchor API key (anchor_xxx...): ')).trim()
  if (!apiKey.startsWith('anchor_')) {
    const confirm = (await rl.question('⚠️  Key doesn\'t look like an Anchor key. Continue? (y/N): ')).trim()
    if (confirm.toLowerCase() !== 'y') { rl.close(); process.exit(1) }
  }

  const webhookSecret = (await rl.question('Webhook secret for payload verification (optional, Enter to skip): ')).trim()
  rl.close()

  // Validate key
  console.log('\n🔍  Validating key...')
  try {
    const res = await fetch(`${anchorUrl}/api/openclaw/context`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      console.error(`❌  Validation failed: ${res.status} ${res.statusText}`)
      console.error('    Double-check your URL and API key and try again.')
      process.exit(1)
    }
    const data = await res.json() as { tasks: unknown[]; habits: unknown[]; userId: string }
    console.log(`✅  Connected! Found ${data.tasks?.length ?? 0} tasks, ${data.habits?.length ?? 0} habits.`)
  } catch (err) {
    console.error(`❌  Could not reach Anchor: ${(err as Error).message}`)
    process.exit(1)
  }

  // Write to openclaw.json
  const snapshot = await readConfigFileSnapshotForWrite()
  const config = snapshot.config as Record<string, unknown>
  const plugins = (config.plugins ?? {}) as Record<string, unknown>
  const entries = (plugins.entries ?? {}) as Record<string, unknown>
  const existing = (entries['anchor-context'] ?? {}) as Record<string, unknown>

  entries['anchor-context'] = {
    ...existing,
    enabled: true,
    config: {
      'anchor-context': {
        anchorUrl,
        apiKey,
        ...(webhookSecret ? { webhookSecret } : {}),
      },
    },
  }
  plugins.entries = entries
  config.plugins = plugins

  await writeConfigFile(snapshot.path, config)

  console.log('\n✅  Config saved!')
  console.log('🔄  Restart the gateway to activate: openclaw gateway restart')
  console.log('\nOnce active, I\'ll have full visibility into your Anchor tasks and habits from any channel. 🐉\n')
}
