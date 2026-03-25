import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const BEACON_SYSTEM_PROMPT =
  'You are Beacon, a warm and encouraging AI assistant built into Anchor — a daily planner for neurodivergent people. ' +
  "You have full visibility into the user's current tasks, habits, and projects. " +
  'Help them plan their day, break down overwhelming tasks, celebrate progress, and stay focused. ' +
  'Be concise, warm, and never judgmental. When you reference their tasks or habits, be specific — you can see exactly what they\'re working on.'

const COMING_SOON_MESSAGE =
  'This provider is coming soon! For now, add an OpenAI API key in Settings → AI Assistant.'

const MOCK_RESPONSE =
  "Hi! I'm your Anchor AI assistant. (AI not configured — add your OpenAI API key in Settings → AI Assistant to enable me.)"

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
    openclawWebhookUrl,
    openclawApiKey,
  } = await req.json()

  const encoder = new TextEncoder()

  // ── OpenClaw provider ──────────────────────────────────────────────────────
  if (provider === 'openclaw') {
    if (!openclawWebhookUrl) {
      return new Response(
        streamChars('Add your OpenClaw webhook URL in Settings → AI Assistant to connect your OpenClaw agent.'),
        { headers: SSE_HEADERS }
      )
    }

    const lastUserMessage =
      [...messages].reverse().find((m: { role: string; content: string }) => m.role === 'user')
        ?.content ?? ''
    const history = messages.slice(0, -1)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (openclawApiKey) fetchHeaders['Authorization'] = `Bearer ${openclawApiKey}`

          const res = await fetch(openclawWebhookUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify({
              message: lastUserMessage,
              context: context ?? '',
              history,
              source: 'anchor',
            }),
          })

          const contentType = res.headers.get('content-type') ?? ''

          if (contentType.includes('text/event-stream')) {
            const reader = res.body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })

              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  controller.enqueue(encoder.encode(`${line}\n\n`))
                }
              }
            }
          } else {
            const json = await res.json()
            const text = typeof json.text === 'string' ? json.text : JSON.stringify(json)
            for (const char of text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`))
              await new Promise((r) => setTimeout(r, 8))
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: `Sorry, I couldn't reach your OpenClaw agent. (${msg})` })}\n\n`
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: SSE_HEADERS })
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
