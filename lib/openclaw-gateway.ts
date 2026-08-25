import { createServiceClient } from './supabase-service'
import { sseFrame } from './sse'

/**
 * openclaw-gateway.ts — Anchor's side of the OpenClaw gateway conversation.
 *
 * SERVER ONLY. The gateway token is full operator access to the user's gateway
 * — the docs are blunt about it — so it must never reach a client component or
 * the browser bundle. The browser talks to Anchor; Anchor talks to the gateway.
 * That is a CONVENTION here, not a guarantee, and it is worth being honest
 * about which: `createServiceClient()` throws without SUPABASE_SECRET_KEY, but
 * only when called — importing this module into a client component would
 * bundle it silently and fail at runtime, not at build. The token itself is
 * never in the bundle (it is read from the database, server-side), so what the
 * mistake would cost is a broken screen rather than a leak. The `server-only`
 * package would make it a build error; it is not a dependency of this
 * workspace, and adding one for a single import is the trade not yet taken.
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
 * Stable session keys, derived SERVER-SIDE from the authenticated user.
 *
 * Sessions have no TTL by default, so a stable key is what gives a thread
 * durable gateway-side memory across reloads and devices.
 *
 * Never accept a session key from the client. `subagent:`, `cron:` and `acp:`
 * are reserved namespaces the gateway rejects from external callers, and a
 * caller-supplied key would also let one browser address another thread. Both
 * are structurally impossible here because every key is built from the fixed
 * `anchor:` literal plus values the server already knows — so there is no
 * denylist to maintain and nothing to keep in sync with the gateway.
 */
export function chatSessionKey(userId: string): string {
  return `anchor:u:${userId}:chat`
}

export function itemSessionKey(userId: string, itemId: string): string {
  return `anchor:u:${userId}:item:${itemId}`
}

/**
 * Guard for the one place Anchor fetches a URL the user typed.
 *
 * Deliberately does NOT block RFC1918 or CGNAT 100.64/10: a Tailscale address
 * is the intended, normal deployment, and blocking private ranges here would
 * reject the correct configuration. What it does block is the cloud metadata
 * endpoint, and it requires TLS anywhere but local development.
 */
/** `::ffff:a9fe:a9fe` → is that 169.254.x.x? */
function isMappedLinkLocal(host: string): boolean {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (hex) {
    const high = parseInt(hex[1], 16)
    return ((high >> 8) & 0xff) === 169 && (high & 0xff) === 254
  }
  // Some parsers keep the dotted tail; handle that spelling too.
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  return dotted ? /^169\.254\./.test(dotted[1]) : false
}

export function assertAllowedGatewayUrl(
  raw: string
): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'Enter a full URL, including http:// or https://' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https URLs are supported' }
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'

  // Credentials in the URL would be written to user_settings, which the browser
  // CAN read — the token column exists precisely so secrets stay out of there.
  if (url.username || url.password) {
    return { ok: false, reason: 'Put the token in the token field, not in the URL' }
  }

  // 169.254.0.0/16 — cloud instance metadata lives at 169.254.169.254, and a
  // server-side fetch of it would hand over instance credentials.
  //
  // The WHATWG parser folds octal, decimal and trailing-dot IPv4 spellings back
  // to a dotted quad, so those are caught by the plain test. What it does NOT
  // fold away is the IPv4-mapped IPv6 form: `[::ffff:169.254.169.254]` becomes
  // `[::ffff:a9fe:a9fe]`, hex rather than dotted, and reaches the same address.
  // So the mapped form is decoded back to an IPv4 rather than matched as a
  // literal — one hard-coded address would only block the one everybody knows.
  if (/^169\.254\./.test(host) || host === 'fd00:ec2::254' || isMappedLinkLocal(host)) {
    return { ok: false, reason: 'That address range is not allowed' }
  }

  if (url.protocol === 'http:' && !(isLoopback && process.env.NODE_ENV !== 'production')) {
    return { ok: false, reason: 'Use https (http is only allowed for localhost in development)' }
  }

  return { ok: true, url: url.toString().replace(/\/+$/, '') }
}

export interface GatewayChatRequest {
  config: GatewayConfig
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  sessionKey: string
  signal?: AbortSignal
}

/**
 * THE UNVERIFIED ASSUMPTION — the first thing to test against a real gateway.
 *
 * A keyed session on the gateway holds its own history. What the docs do not
 * say is whether posting a full transcript to an existing session key APPENDS
 * the messages or REPLACES the turn, and the two behaviours differ sharply:
 * if the gateway already remembers the conversation, resending it every turn
 * duplicates history and the model sees each message twice.
 *
 * `false` (send only the newest turn) is the safer default: under-sending
 * costs context the gateway already has, while over-sending corrupts it. If a
 * gateway turns out to be stateless per request, flip this to true.
 */
export const SEND_FULL_TRANSCRIPT_TO_GATEWAY = false

/** The messages to actually put on the wire, per the assumption above. */
export function gatewayTurnMessages(
  messages: GatewayChatRequest['messages']
): GatewayChatRequest['messages'] {
  if (SEND_FULL_TRANSCRIPT_TO_GATEWAY) return messages
  const system = messages.filter((m) => m.role === 'system')
  const latest = messages.filter((m) => m.role !== 'system').slice(-1)
  return [...system, ...latest]
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
  const allowed = assertAllowedGatewayUrl(config.baseUrl)
  if (!allowed.ok) throw new Error(allowed.reason)

  const res = await fetch(`${allowed.url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      // Explicit routing beats the OpenAI `user` field: the gateway derives a
      // key from `user` only as a fallback, and we want the exact key back.
      'x-openclaw-session-key': sessionKey,
    },
    signal,
    // A redirect could bounce this authenticated request — bearer token and
    // all — at a host the URL guard never saw.
    redirect: 'error',
    body: JSON.stringify({
      model: config.agentId ?? 'default',
      messages: gatewayTurnMessages(messages),
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    // Status only. The upstream body can carry configuration detail, and this
    // message is rendered straight into the chat panel.
    throw new Error(`Gateway responded ${res.status}`)
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
