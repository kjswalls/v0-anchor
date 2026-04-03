import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt'

export const maxDuration = 60

/**
 * POST /api/openclaw/openclaw-chat
 * Proxies non-streaming chat to the user's registered Gateway URL.
 * Chat URL + agent id from user_settings (session); gateway token from user_secrets (service role only).
 * Body: { messages, systemPrompt?, context? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    messages?: Array<{ role: string; content: string }>
    systemPrompt?: string
    context?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages, systemPrompt, context } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages to send.' }, { status: 400 })
  }

  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select('openclaw_chat_url, openclaw_agent_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (settingsError) {
    return NextResponse.json({ error: `Settings error: ${settingsError.message}` }, { status: 500 })
  }

  const service = createServiceClient()
  const { data: secretRow, error: secretError } = await service
    .from('user_secrets')
    .select('openclaw_gateway_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (secretError) {
    return NextResponse.json({ error: `Secrets error: ${secretError.message}` }, { status: 500 })
  }

  const gatewayUrl = settings?.openclaw_chat_url?.trim()
  if (!gatewayUrl) {
    return NextResponse.json(
      {
        error:
          'OpenClaw Gateway URL not registered yet — run `openclaw anchor-context setup` and set publicUrl in openclaw.json so Anchor can reach your Gateway.',
      },
      { status: 500 }
    )
  }

  const gatewayToken = secretRow?.openclaw_gateway_token?.trim()
  if (!gatewayToken) {
    return NextResponse.json(
      {
        error:
          'OpenClaw Gateway token not synced yet. Add gatewayToken to your anchor-context plugin config and restart the Gateway so it can register with Anchor.',
      },
      { status: 500 }
    )
  }

  const agentId = settings?.openclaw_agent_id?.trim() || 'main'
  const model = `openclaw:${agentId}`

  const resolvedSystem = (systemPrompt?.trim() || BEACON_SYSTEM_PROMPT).trim()
  const systemMessage = context?.trim() ? `${resolvedSystem}\n\n${context.trim()}` : resolvedSystem

  const cleanMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : '',
  }))

  const openaiMessages = [{ role: 'system' as const, content: systemMessage }, ...cleanMessages]

  let upstream: Response
  try {
    upstream = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        stream: false,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fetch failed'
    return NextResponse.json({ error: `Could not reach Gateway: ${msg}` }, { status: 500 })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => upstream.statusText)
    const snippet = text.slice(0, 800)
    return NextResponse.json(
      { error: `Gateway error (${upstream.status}): ${snippet || upstream.statusText}` },
      { status: 500 }
    )
  }

  let json: unknown
  try {
    json = await upstream.json()
  } catch {
    return NextResponse.json({ error: 'Failed to parse Gateway response' }, { status: 500 })
  }

  const content =
    (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content ?? ''

  return NextResponse.json({ content })
}
