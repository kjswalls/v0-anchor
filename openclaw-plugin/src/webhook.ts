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
  const res = await fetch(`${cfg.anchorUrl}/api/openclaw/register`, {
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

export async function deregisterFromAnchor(
  cfg: PluginConfig,
  logger: { warn: (s: string) => void }
): Promise<void> {
  await fetch(`${cfg.anchorUrl}/api/openclaw/register`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ pluginId: 'anchor-context' }),
  }).catch((err: Error) => logger.warn(`anchor-context: deregister failed — ${err.message}`))
}

export function makeWebhookHandler(cfg: PluginConfig, logger: { info: (s: string) => void; warn: (s: string) => void }) {
  return async (req: Request): Promise<Response> => {
    let eventName = 'unknown'

    let rawPayload: unknown
    if (cfg.webhookSecret) {
      const body = await req.text()
      const sig = req.headers.get('x-anchor-signature') ?? ''
      const valid = await verifyHmac(cfg.webhookSecret, body, sig)
      if (!valid) return new Response('Unauthorized', { status: 401 })
      rawPayload = JSON.parse(body)
    } else {
      rawPayload = await (req as Request).json()
    }

    const parsed = AnchorChangeEventSchema.safeParse(rawPayload)
    if (parsed.success) {
      eventName = parsed.data.event
    } else {
      logger.warn('anchor-context: unrecognised webhook payload shape')
    }

    logger.info(`anchor-context: cache invalidated (${eventName})`)
    fetchContext(cfg).catch((err: Error) => {
      logger.warn(`anchor-context: post-change refresh failed — ${err.message}`)
    })

    return new Response('ok', { status: 200 })
  }
}
