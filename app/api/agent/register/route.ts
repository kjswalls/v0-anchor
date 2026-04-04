import { NextRequest, NextResponse } from 'next/server'
import { resolveUserIdFromApiKey, createServiceClient } from '@/lib/supabase-service'
import { registeredPlugins, PluginRegistration } from '@/lib/openclaw-registry'

/**
 * POST /api/agent/register
 *
 * Called on OpenClaw plugin startup. Registers the plugin's webhook URL so
 * Anchor pushes change events when data mutates. Also accepts optional chatUrl
 * (plugin endpoint URL, e.g. …/plugins/anchor/chat) for sidebar chat.
 *
 * Auth: Bearer <openclaw_api_key>  — userId resolved from the key automatically.
 *
 * Body:
 *   {
 *     pluginId:    string     // e.g. "anchor-context"
 *     webhookUrl?: string     // where Anchor should POST change events (optional if chatUrl only)
 *     secret?:     string     // HMAC secret for payload verification (optional)
 *     events?:     string[]   // e.g. ["tasks.updated", "habits.updated"]
 *     chatUrl?:    string     // e.g. https://<gateway>/plugins/anchor/chat
 *     agentId?:    string     // OpenClaw agent (default main)
 *   }
 */
export async function POST(req: NextRequest) {
  const userId = await resolveFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { pluginId, webhookUrl, secret, events, chatUrl, agentId } = body as {
    pluginId?: string
    webhookUrl?: string
    secret?: string
    events?: string[]
    chatUrl?: string
    agentId?: string
  }

  // chatUrl-only registration is allowed (no webhookUrl/events required)
  const hasWebhook = webhookUrl && events?.length
  const hasChatUrl = typeof chatUrl === 'string' && chatUrl.length > 0

  if (!pluginId) {
    return NextResponse.json({ error: 'Missing required field: pluginId' }, { status: 400 })
  }
  if (!hasWebhook && !hasChatUrl) {
    return NextResponse.json({ error: 'Provide webhookUrl+events or chatUrl' }, { status: 400 })
  }

  // Persist chat URL + agent on user_settings.
  if (hasChatUrl) {
    const service = createServiceClient()
    const { error: upsertError } = await service.from('user_settings').upsert(
      {
        user_id: userId,
        openclaw_chat_url: chatUrl,
        openclaw_agent_id: typeof agentId === 'string' && agentId.trim() ? agentId.trim() : 'main',
      },
      { onConflict: 'user_id' }
    )
    if (upsertError) {
      console.error(`[agent/register] Failed to store chatUrl for user ${userId}:`, upsertError.message)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log(`[agent/register] chatUrl stored for user ${userId} → ${chatUrl}`)
  }

  // Register webhook if provided
  if (hasWebhook) {
    const registration: PluginRegistration = {
      pluginId,
      webhookUrl,
      secret: secret ?? '',
      userId,
      events,
      registeredAt: new Date().toISOString(),
    }

    registeredPlugins.set(`${pluginId}:${userId}`, registration)
    console.log(`[agent/register] "${pluginId}" registered for user ${userId} → ${webhookUrl}`)
  }

  return NextResponse.json({ ok: true, userId, registeredAt: new Date().toISOString() })
}

/**
 * DELETE /api/agent/register
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
