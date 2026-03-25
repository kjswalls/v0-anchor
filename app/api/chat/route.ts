import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const SYSTEM_PROMPT =
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

export async function POST(req: NextRequest) {
  const { messages, provider, model, apiKey, systemPrompt } = await req.json()

  const encoder = new TextEncoder()

  // Coming soon providers
  if (provider === 'openclaw' || provider === 'anthropic') {
    return new Response(streamText(COMING_SOON_MESSAGE, encoder), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // No API key or provider disabled — stream mock response
  const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY
  if (!effectiveApiKey || provider === 'none') {
    return new Response(streamText(MOCK_RESPONSE, encoder), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // Build message array for OpenAI
  const systemMessage = context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT

  const effectiveSystemPrompt =
    systemPrompt ||
    'You are Guma, an AI assistant built into Anchor — a daily planner for neurodivergent people. ' +
      'You help users plan their day, break down tasks, stay focused, and reflect on their progress. ' +
      'Be warm, concise, and encouraging. Never judgmental.'

  const openaiMessages = [{ role: 'system', content: effectiveSystemPrompt }, ...messages]
  const effectiveModel = model || 'gpt-4o-mini'
  const openai = new OpenAI({ apiKey: effectiveApiKey })

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model: effectiveModel,
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

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}
