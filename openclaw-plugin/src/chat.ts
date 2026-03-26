import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PluginConfig } from './plugin-types.js'
import type { PluginRuntime } from 'openclaw/plugin-sdk'
import { readBody } from './webhook.js'

const SESSION_KEY_PREFIX = 'anchor-chat'

/**
 * Handles POST /plugins/anchor/chat
 *
 * Body (JSON):
 *   { message: string, sessionKey?: string, context?: string }
 *
 * Response: SSE stream
 *   data: {"content": "..."}   — token chunks
 *   data: [DONE]               — end of stream
 *   data: {"error": "..."}     — on failure
 */
export async function handleChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: PluginConfig,
  runtime: PluginRuntime,
  logger: { info: (s: string) => void; warn: (s: string) => void; error: (s: string) => void }
): Promise<void> {
  // Validate Anchor API key — the route uses auth: 'plugin' so the gateway
  // doesn't enforce its own auth; the plugin must validate the caller.
  const authHeader = (req.headers['authorization'] as string | undefined) ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || token !== cfg.apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // Parse body
  let message: string
  let sessionKey: string
  let extraContext: string | undefined

  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw) as { message?: string; sessionKey?: string; context?: string }
    if (!body.message?.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing message' }))
      return
    }
    message = body.message.trim()
    // Stable session key per user so chat history persists across page loads
    sessionKey = body.sessionKey ?? `${SESSION_KEY_PREFIX}:${cfg.apiKey.slice(-8)}`
    extraContext = body.context
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  // Set up SSE response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const send = (data: string) => res.write(`data: ${data}\n\n`)

  try {
    logger.info(`anchor-context: chat turn — session ${sessionKey}`)

    const { runId } = await runtime.subagent.run({
      sessionKey,
      message,
      idempotencyKey: `anchor-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(extraContext ? { extraSystemPrompt: extraContext } : {}),
    })

    // Wait for run to finish (up to 2 min)
    const result = await runtime.subagent.waitForRun({ runId, timeoutMs: 120_000 })

    if (result.status === 'error') {
      logger.warn(`anchor-context: chat run errored — ${result.error ?? 'unknown'}`)
      send(JSON.stringify({ error: result.error ?? 'Agent run failed' }))
      return
    }

    // Fetch the last few messages from the session to find the assistant reply
    const { messages } = await runtime.subagent.getSessionMessages({ sessionKey, limit: 10 })

    // Find the last assistant message
    const lastAssistant = [...messages].reverse().find((m) => {
      const msg = m as Record<string, unknown>
      return msg.role === 'assistant'
    }) as Record<string, unknown> | undefined

    if (!lastAssistant) {
      send(JSON.stringify({ error: 'No response received' }))
      return
    }

    // Extract text content — content can be a string or an array of content blocks
    let text = ''
    const content = lastAssistant.content
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content
        .filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
        .filter((block) => block.type === 'text')
        .map((block) => block.text as string)
        .join('')
    }

    if (text) {
      send(JSON.stringify({ content: text }))
    } else {
      send(JSON.stringify({ error: 'Empty response' }))
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error(`anchor-context: chat handler error — ${msg}`)
    send(JSON.stringify({ error: msg }))
  } finally {
    send('[DONE]')
    res.end()
  }
}
