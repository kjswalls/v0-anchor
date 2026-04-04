import type { IncomingMessage } from 'node:http'
import type { PluginConfig } from './plugin-types.js'
import { AnchorChangeEventSchema } from '@anchor-app/types'
import { fetchContext } from './cache.js'

export async function verifyHmac(secret: string, body: string, sigHeader: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return sigHeader === `sha256=${hex}`
}

export async function registerWithAnchor(
  cfg: PluginConfig,
  webhookUrl: string,
  logger: { info: (s: string) => void; warn: (s: string) => void }
): Promise<void> {
  const res = await fetch(`${cfg.anchorUrl}/api/agent/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      pluginId: 'anchor-context',
      webhookUrl,
      secret: cfg.webhookSecret ?? '',
      events: ['tasks.updated', 'habits.updated', 'projects.updated', 'habitGroups.updated'],
    }),
  })
  if (res.ok) {
    logger.info(`anchor-context: webhook registered → ${webhookUrl}`)
  } else {
    logger.warn(`anchor-context: webhook registration failed (${res.status}) — change events won't invalidate cache`)
  }
}

export async function registerChatUrl(
  cfg: PluginConfig,
  chatUrl: string,
  agentId: string,
  logger: { info: (s: string) => void; warn: (s: string) => void }
): Promise<void> {
  try {
    const res = await fetch(`${cfg.anchorUrl}/api/agent/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        pluginId: 'anchor-context',
        chatUrl,
        agentId,
      }),
    })
    if (res.ok) {
      logger.info(`anchor-context: chat URL registered → ${chatUrl}`)
    } else {
      logger.warn(`anchor-context: chat URL registration failed (${res.status})`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.warn(`anchor-context: chat URL registration error — ${msg}`)
  }
}

export async function deregisterFromAnchor(
  cfg: PluginConfig,
  logger: { warn: (s: string) => void }
): Promise<void> {
  await fetch(`${cfg.anchorUrl}/api/agent/register`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ pluginId: 'anchor-context' }),
  }).catch((err: Error) => logger.warn(`anchor-context: deregister failed — ${err.message}`))
}

/** Read full body from a Node IncomingMessage */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Parse webhook body and return event name + raw body string */
export async function parseWebhookBody(
  req: IncomingMessage,
  _cfg: PluginConfig
): Promise<{ body: string; eventName: string }> {
  const body = await readBody(req)
  let eventName = 'unknown'
  try {
    const parsed = AnchorChangeEventSchema.safeParse(JSON.parse(body))
    if (parsed.success) eventName = parsed.data.event
  } catch { /* ignore parse errors */ }
  return { body, eventName }
}
