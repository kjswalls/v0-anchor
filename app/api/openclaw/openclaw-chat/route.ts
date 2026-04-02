import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt'

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }

function sseErrorStream(message: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: message })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

function extractDeltaContent(payload: string): string | null {
  try {
    const json = JSON.parse(payload) as Record<string, unknown>
    if (typeof json.content === 'string' && json.content) return json.content
    const choices = json.choices as Array<{ delta?: { content?: string } }> | undefined
    const delta = choices?.[0]?.delta?.content
    return typeof delta === 'string' && delta ? delta : null
  } catch {
    return null
  }
}

/**
 * POST /api/openclaw/openclaw-chat
 * Proxies OpenAI-compatible streaming chat to the user's registered Gateway URL (openclaw_chat_url).
 * Body: { messages, model?, systemPrompt?, context?, openclawGatewayApiKey }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: {
    messages?: Array<{ role: string; content: string }>
    model?: string
    systemPrompt?: string
    context?: string
    openclawGatewayApiKey?: string
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages, model, systemPrompt, context, openclawGatewayApiKey } = body

  if (!openclawGatewayApiKey?.trim()) {
    return new Response(
      sseErrorStream('Add your OpenClaw Gateway API key in Settings → AI Assistant.'),
      { headers: SSE_HEADERS }
    )
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(sseErrorStream('No messages to send.'), { headers: SSE_HEADERS })
  }

  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select('openclaw_chat_url')
    .eq('user_id', user.id)
    .maybeSingle()

  if (settingsError) {
    return new Response(
      sseErrorStream(`Settings error: ${settingsError.message}`),
      { headers: SSE_HEADERS }
    )
  }

  const gatewayUrl = settings?.openclaw_chat_url?.trim()
  if (!gatewayUrl) {
    return new Response(
      sseErrorStream(
        'OpenClaw Gateway URL not registered yet — run `openclaw anchor-context setup` and set publicUrl in openclaw.json so Anchor can reach your Gateway.'
      ),
      { headers: SSE_HEADERS }
    )
  }

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
        Authorization: `Bearer ${openclawGatewayApiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model?.trim() || 'gpt-4o-mini',
        messages: openaiMessages,
        stream: true,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fetch failed'
    return new Response(sseErrorStream(`Could not reach Gateway: ${msg}`), { headers: SSE_HEADERS })
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => upstream.statusText)
    const snippet = text.slice(0, 800)
    return new Response(
      sseErrorStream(`Gateway error (${upstream.status}): ${snippet || upstream.statusText}`),
      { headers: SSE_HEADERS }
    )
  }

  const encoder = new TextEncoder()
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ''
      const finish = () => {
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch {
          /* stream closed */
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') {
              finish()
              return
            }
            const chunk = extractDeltaContent(payload)
            if (chunk) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
            }
          }
        }
        finish()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: `\n\n[Error: ${msg}]` })}\n\n`)
          )
        } catch {
          /* */
        }
        finish()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
