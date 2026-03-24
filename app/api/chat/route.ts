import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const SYSTEM_PROMPT =
  'You are Guma, an AI assistant built into Anchor — a daily planner for neurodivergent people. ' +
  'You help users plan their day, break down tasks, stay focused, and reflect on their progress. ' +
  'Be warm, concise, and encouraging. Never judgmental.'

const MOCK_RESPONSE =
  "Hi! I'm your Anchor AI assistant. (AI not configured yet — add OPENAI_API_KEY to .env.local to enable me.)"

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json()

  const encoder = new TextEncoder()

  // No API key — stream a friendly mock response
  if (!process.env.OPENAI_API_KEY) {
    const stream = new ReadableStream({
      async start(controller) {
        for (const char of MOCK_RESPONSE) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`))
          await new Promise((r) => setTimeout(r, 18))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // Build message array for OpenAI
  const systemMessage = context
    ? `${SYSTEM_PROMPT}\n\nCurrent context:\n${context}`
    : SYSTEM_PROMPT

  const openaiMessages = [
    { role: 'system', content: systemMessage },
    ...messages,
  ]

  // Call OpenAI with streaming
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
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
