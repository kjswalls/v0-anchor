import { NextRequest, NextResponse } from 'next/server'
import { registeredPlugins, PluginRegistration } from '@/lib/openclaw-registry'

/**
 * POST /api/openclaw/register
 *
 * Called once by the OpenClaw Anchor channel plugin on startup. Registers the
 * plugin's webhook URL so Anchor can push change events when data mutates.
 *
 * Body:
 *   {
 *     pluginId: string          // unique id (e.g. "anchor-channel")
 *     webhookUrl: string        // where Anchor should POST change events
 *     secret: string            // HMAC secret for verifying payloads
 *     userId: string            // which user's data to subscribe to
 *     events: string[]          // e.g. ["tasks.updated", "habits.updated"]
 *   }
 *
 * Auth: Bearer OPENCLAW_API_KEY
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { pluginId, webhookUrl, secret, userId, events } = body

  if (!pluginId || !webhookUrl || !userId || !events?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const registration: PluginRegistration = {
    pluginId,
    webhookUrl,
    secret: secret ?? '',
    userId,
    events,
    registeredAt: new Date().toISOString(),
  }

  registeredPlugins.set(`${pluginId}:${userId}`, registration)
  console.log(`[openclaw/register] Plugin "${pluginId}" registered for user ${userId}`)

  return NextResponse.json({ ok: true, registeredAt: registration.registeredAt })
}

/**
 * DELETE /api/openclaw/register
 * Deregisters a plugin (called on OpenClaw plugin shutdown).
 */
export async function DELETE(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pluginId, userId } = await req.json()
  registeredPlugins.delete(`${pluginId}:${userId}`)

  return NextResponse.json({ ok: true })
}

function checkApiKey(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.slice(7)
  return !!token && token === process.env.OPENCLAW_API_KEY
}
