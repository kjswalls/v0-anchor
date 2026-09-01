import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { BEACON_SYSTEM_PROMPT } from '@/lib/beacon-system-prompt'
import { createClient } from '@/lib/supabase-server'
import {
  chatSessionKey,
  getGatewayConfig,
  itemSessionKey,
  streamGatewayChat,
} from '@/lib/openclaw-gateway'

const COMING_SOON_MESSAGE =
  'This provider is coming soon! For now, add an OpenAI API key in Settings → AI Assistant.'

const MOCK_RESPONSE =
  "Hi! I'm your dsul AI assistant. (AI not configured — add your OpenAI API key in Settings → AI Assistant to enable me.)"

function streamText(text: string, encoder: TextEncoder) {
  return new ReadableStream({
    async start(controller) {
      for (const char of text) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`))
        await new Promise((r) => setTimeout(r, 18))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }

function streamChars(text: string, delayMs = 18): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      for (const char of text) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`))
        await new Promise((r) => setTimeout(r, delayMs))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

export async function POST(req: NextRequest) {
  const {
    messages,
    provider,
    model,
    apiKey,
    systemPrompt,
    context,
    threadItemId,
  } = await req.json()

  const encoder = new TextEncoder()

  // ── OpenClaw gateway ───────────────────────────────────────────────────────
  // Proxied here rather than called from the browser: the gateway token is full
  // operator access and stays server-side. Chunks are translated into dsul's
  // own frames, so the client parser is the same one the OpenAI path feeds.
  if (provider === 'openclaw') {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return new Response(streamChars('Sign in to use your OpenClaw gateway.'), {
          headers: SSE_HEADERS,
        })
      }

      const config = await getGatewayConfig(user.id)
      if (!config) {
        // Not an error: this account simply has not moved off the plugin chat
        // path yet, and the client only routes here when it believes a gateway
        // is configured.
        return new Response(
          streamChars('No OpenClaw gateway configured — add one in Settings → AI Assistant.'),
          { headers: SSE_HEADERS }
        )
      }

      const resolvedPrompt = systemPrompt || BEACON_SYSTEM_PROMPT
      const stream = await streamGatewayChat({
        config,
        // Derived from the authenticated user, never taken from the body. The
        // client names which THREAD it is (an item id, or nothing for the
        // global conversation); the key itself is built here, so a browser
        // cannot address another user's thread or a reserved gateway
        // namespace. Per-item threads get their own durable gateway session.
        sessionKey:
          typeof threadItemId === 'string' && threadItemId
            ? itemSessionKey(user.id, threadItemId)
            : chatSessionKey(user.id),
        messages: [
          { role: 'system', content: context ? `${resolvedPrompt}\n\n${context}` : resolvedPrompt },
          ...messages,
        ],
      })
      return new Response(stream, { headers: SSE_HEADERS })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return new Response(streamChars(`Could not reach your gateway — ${msg}`, 0), {
        headers: SSE_HEADERS,
      })
    }
  }

  // ── Anthropic (coming soon) / none ─────────────────────────────────────────
  if (provider === 'anthropic') {
    return new Response(streamChars(COMING_SOON_MESSAGE), { headers: SSE_HEADERS })
  }

  if (provider === 'none' || (!apiKey && !process.env.OPENAI_API_KEY)) {
    return new Response(streamChars(MOCK_RESPONSE), { headers: SSE_HEADERS })
  }

  // ── No API key — stream a friendly mock response ───────────────────────────
  if (!process.env.OPENAI_API_KEY && !apiKey) {
    return new Response(streamChars(MOCK_RESPONSE), { headers: SSE_HEADERS })
  }

  // ── OpenAI provider ────────────────────────────────────────────────────────
  // A caller's OWN key is self-funded and needs no session. Falling back to the
  // deployment's key does: without this, anyone could POST here and spend the
  // owner's OpenAI budget. Pre-dates the gateway work; same hole, same fix.
  if (!apiKey && process.env.OPENAI_API_KEY) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return new Response(streamChars('Sign in to use the assistant.'), { headers: SSE_HEADERS })
      }
    } catch {
      return new Response(streamChars('Sign in to use the assistant.'), { headers: SSE_HEADERS })
    }
  }

  const resolvedSystemPrompt = systemPrompt || BEACON_SYSTEM_PROMPT
  const systemMessage = context ? `${resolvedSystemPrompt}\n\n${context}` : resolvedSystemPrompt

  const openaiMessages = [{ role: 'system', content: systemMessage }, ...messages]

  const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model: model || 'gpt-4o-mini',
          messages: openaiMessages,
          stream: true,
        })

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content ?? ''
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: `\n\n[Error: ${msg}]` })}\n\n`)
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
