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
    // Derive a stable session key per API key so chat history persists across browser reloads
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

  // Subscribe to transcript updates BEFORE running the turn to avoid missing tokens.
  // onSessionTranscriptUpdate fires globally — filter to our session key.
  let unsubscribe: (() => void) | null = null
  let resolveStream!: () => void
  const streamDone = new Promise<void>((resolve) => { resolveStream = resolve })

  unsubscribe = runtime.events.onSessionTranscriptUpdate((update) => {
    if (update.sessionKey !== sessionKey) return

    const msg = update.message as Record<string, unknown> | undefined
    if (!msg) return

    // Stream assistant token deltas
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      // Full assistant message written — extract content and send it
      // (transcript events fire once per complete message, not per token)
      send(JSON.stringify({ content: msg.content }))
      resolveStream()
    }
  })

  try {
    logger.info(`anchor-context: chat turn — session ${sessionKey}`)

    const { runId } = await runtime.subagent.run({
      sessionKey,
      message,
      ...(extraContext ? { extraSystemPrompt: extraContext } : {}),
    })

    // Wait for the run to complete (up to 2 min)
    const result = await runtime.subagent.waitForRun({ runId, timeoutMs: 120_000 })

    // Also wait for transcript event to arrive (it may come slightly after waitForRun)
    await Promise.race([
      streamDone,
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ])

    if (unsubscribe) { unsubscribe(); unsubscribe = null }

    if (result.status === 'error') {
      logger.warn(`anchor-context: chat run errored — ${result.error ?? 'unknown'}`)
      send(JSON.stringify({ error: result.error ?? 'Agent run failed' }))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error(`anchor-context: chat handler error — ${msg}`)
    send(JSON.stringify({ error: msg }))
  } finally {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    send('[DONE]')
    res.end()
  }
}
