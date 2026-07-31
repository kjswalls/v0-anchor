import { createServiceClient } from './supabase-service'
import { sseFrame } from './sse'

/**
 * openclaw-gateway.ts — Anchor's side of the OpenClaw gateway conversation.
 *
 * SERVER ONLY. The gateway token is full operator access to the user's gateway
 * — the docs are blunt about it — so it must never reach a client component or
 * the browser bundle. The browser talks to Anchor; Anchor talks to the gateway.
 * Enforced structurally rather than by convention: this module reaches
 * user_secrets through createServiceClient(), which throws without
 * SUPABASE_SECRET_KEY, so importing it into a client component fails loudly
 * instead of shipping a token. (The `server-only` package would say it more
 * directly, but it is not a dependency of this workspace.)
 *
 * Transport is the gateway's OpenAI-compatible surface
 * (`POST /v1/chat/completions`, opt-in via
 * `gateway.http.endpoints.chatCompletions.enabled`), chosen over the WebSocket
 * protocol because it streams real SSE, fits a Next route handler, and needs no
 * per-browser Ed25519 device pairing. The tradeoff is no tool-call events — an
 * acceptable one while chat is an escape hatch rather than the main surface.
 */

export interface GatewayConfig {
  baseUrl: string
  token: string
  agentId: string | null
}

/** Trailing slashes break `${base}/v1/...` concatenation. */
const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '')

/**
 * Resolve a user's gateway config, or null when they have not set one up.
 *
 * Uses the service client because `user_secrets` is deliberately unreachable
 * with a user JWT (migration 012) — callers must have already authenticated the
 * user through their session before passing a userId in here.
 */
export async function getGatewayConfig(userId: string): Promise<GatewayConfig | null> {
  const service = createServiceClient()

  const [{ data: settings }, { data: secrets }] = await Promise.all([
    service
      .from('user_settings')
      .select('openclaw_gateway_url, openclaw_agent_id')
      .eq('user_id', userId)
      .maybeSingle(),
    service
      .from('user_secrets')
      .select('openclaw_gateway_token')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const baseUrl = settings?.openclaw_gateway_url
  const token = secrets?.openclaw_gateway_token
  if (!baseUrl || !token) return null

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    token,
    agentId: settings?.openclaw_agent_id ?? null,
  }
}

/**
 * Stable session key for a conversation.
 *
 * Sessions have no TTL by default, so a stable key is what gives a thread
 * durable gateway-side memory across reloads and devices. `subagent:`, `cron:`
 * and `acp:` are reserved namespaces the gateway REJECTS from external callers,
 * hence the `anchor:` prefix.
 */
export function sessionKeyFor(scope: 'chat' | 'item', id?: string): string {
  return scope === 'chat' ? 'anchor:chat' : `anchor:item:${id}`
}

export interface GatewayChatRequest {
  config: GatewayConfig
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  sessionKey: string
  signal?: AbortSignal
}

/**
 * Extracts the incremental text from one OpenAI-shaped streaming chunk.
 *
 * Exported for tests: this is the only place that knows the gateway's wire
 * shape, and everything downstream sees Anchor frames.
 */
export function deltaFromChunk(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const delta = (choices[0] as { delta?: unknown })?.delta
  if (!delta || typeof delta !== 'object') return ''
  const content = (delta as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

/**
 * Opens a streaming chat against the gateway and returns a ReadableStream of
 * ANCHOR frames (`data: {"content":…}` … `data: [DONE]`), so the browser parser
 * is identical for every tier and provider.
 */
export async function streamGatewayChat({
  config,
  messages,
  sessionKey,
  signal,
}: GatewayChatRequest): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      // Explicit routing beats the OpenAI `user` field: the gateway derives a
      // key from `user` only as a fallback, and we want the exact key back.
      'x-openclaw-session-key': sessionKey,
    },
    signal,
    body: JSON.stringify({
      model: config.agentId ?? 'default',
      messages,
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gateway responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
    )
  }

  return translateGatewayStream(res.body)
}

/** OpenAI-shaped SSE in, Anchor frames out. */
export function translateGatewayStream(
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''

  return new ReadableStream({
    // Loops until it enqueues something or the source ends. A pull that
    // returns having enqueued nothing is NOT pulled again — the stream just
    // stalls — and gateway streams are full of content-free chunks (role
    // openers, finish_reason, usage, keepalives), so "read one chunk per pull"
    // deadlocks on the first one of them.
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read()

        if (done) {
          // Flush a trailing frame that arrived without its newline.
          for (const text of framesIn(buffer, true)) {
            if (text) controller.enqueue(encoder.encode(sseFrame({ content: text })))
          }
          // Always terminate, even if the gateway didn't: Anchor's client
          // parser stops on [DONE], and without one it reads to EOF.
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let enqueued = false
        for (const line of lines) {
          for (const text of framesIn(line, false)) {
            if (text) {
              controller.enqueue(encoder.encode(sseFrame({ content: text })))
              enqueued = true
            }
          }
        }
        if (enqueued) return
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {})
    },
  })
}

/** Yields the delta text of one SSE line, skipping anything unparseable. */
function framesIn(line: string, isTail: boolean): string[] {
  const trimmed = isTail ? line.trim() : line
  if (!trimmed.startsWith('data:')) return []
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return []
  try {
    return [deltaFromChunk(JSON.parse(payload))]
  } catch {
    return []
  }
}
