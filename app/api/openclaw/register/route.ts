import { NextRequest, NextResponse } from 'next/server'
import { resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { registeredPlugins, PluginRegistration } from '@/lib/openclaw-registry'

/**
 * POST /api/openclaw/register
 *
 * Called on OpenClaw plugin startup. Registers the plugin's webhook URL so
 * Anchor pushes change events when data mutates.
 *
 * Auth: Bearer <openclaw_api_key>  — userId resolved from the key automatically.
 *
 * Body:
 *   {
 *     pluginId:    string     // e.g. "anchor-context"
 *     webhookUrl:  string     // where Anchor should POST change events
 *     secret:      string     // HMAC secret for payload verification (optional)
 *     events:      string[]   // e.g. ["tasks.updated", "habits.updated"]
 *   }
 */
export async function POST(req: NextRequest) {
  const userId = await resolveFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pluginId, webhookUrl, secret, events } = await req.json()
  if (!pluginId || !webhookUrl || !events?.length) {
    return NextResponse.json({ error: 'Missing required fields: pluginId, webhookUrl, events' }, { status: 400 })
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
  console.log(`[openclaw/register] "${pluginId}" registered for user ${userId} → ${webhookUrl}`)

  return NextResponse.json({ ok: true, userId, registeredAt: registration.registeredAt })
}

/**
 * DELETE /api/openclaw/register
 * Deregisters a plugin (called on OpenClaw plugin shutdown).
 */
export async function DELETE(req: NextRequest) {
  const userId = await resolveFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pluginId } = await req.json()
  registeredPlugins.delete(`${pluginId}:${userId}`)

  return NextResponse.json({ ok: true })
}

async function resolveFromBearer(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.slice(7)
  if (!token) return null
  return resolveUserIdFromApiKey(token)
}
