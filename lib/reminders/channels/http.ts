/**
 * channels/http.ts — the outbound request every Tier 2 channel makes.
 *
 * Two things live here because getting either wrong in three separate adapters
 * is how a reminder feature takes down a cron: a hard timeout, and a URL check.
 */

/** Every channel gets the same ceiling. */
export const CHANNEL_TIMEOUT_MS = 8000

/**
 * Reject a destination this server should not be asked to fetch.
 *
 * The Home Assistant base URL is typed by the user into their own settings, so
 * the ordinary SSRF framing ("untrusted input") does not quite fit: someone who
 * can write that config already holds the session. What they do NOT already
 * hold is the ability to make DSUL'S SERVER issue requests from inside the
 * hosting provider's network — and that is a real escalation, because cloud
 * metadata endpoints answer to anything that can reach them.
 *
 * So this blocks the loopback and link-local ranges (169.254.169.254 among
 * them) and nothing else. Private LAN ranges stay ALLOWED on purpose: Home
 * Assistant overwhelmingly lives on 192.168.x or 10.x, blocking them would
 * break the honest case, and a serverless function cannot reach the user's LAN
 * anyway — the address is only meaningful to a self-hosted deployment, where
 * the user is the operator.
 *
 * Known and accepted limit: a hostname that resolves to a blocked address only
 * at connect time (DNS rebinding) passes this check. Closing that needs a
 * resolve-then-pin fetch, which the platform's fetch does not expose.
 */
export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported scheme ${url.protocol}`)
  }
  // Credentials in the URL would be logged by every hop that touches it.
  if (url.username || url.password) throw new Error('credentials in URL are not accepted')

  if (isBlockedHost(url.hostname)) throw new Error(`refusing to call ${url.hostname}`)
  return url
}

/**
 * Loopback, the unspecified address, and link-local — in every spelling.
 *
 * The IPv6 forms are not pedantry: `http://[::ffff:169.254.169.254]/` is the
 * same metadata endpoint the dotted-quad check refuses, and a guard that only
 * matches the obvious spelling is a guard that looks present and is not.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0' || /^127\./.test(host)) return true
  // Link-local, which is where the cloud metadata services answer.
  if (/^169\.254\./.test(host)) return true

  // IPv6 loopback and unspecified, long form and short.
  const collapsed = host.replace(/(^|:)0+(?=[0-9a-f])/g, '$1')
  if (collapsed === '::1' || collapsed === '::' || /^0*:(0*:)*0*1$/.test(host)) return true
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true

  // IPv4-mapped and IPv4-compatible IPv6, written in dotted form.
  const dotted = /^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/.exec(host)
  if (dotted) return isBlockedHost(dotted[1])

  // …and written in HEX, which is what actually reaches this function: the
  // WHATWG URL parser canonicalises `[::ffff:169.254.169.254]` to
  // `[::ffff:a9fe:a9fe]`, so a check that only understood the dotted spelling
  // would pass the very address the comment above names.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (hex) {
    const high = parseInt(hex[1], 16)
    const low = parseInt(hex[2], 16)
    return isBlockedHost(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
    )
  }

  return false
}

export interface ChannelRequest {
  headers?: Record<string, string>
  /** JSON body, or a pre-encoded form body with the matching content-type. */
  body: string
  contentType?: string
  /**
   * Defaults to POST, which is what every delivery channel sends.
   *
   * DELETE exists for one caller: withdrawing a Beeminder datapoint when a
   * completion is un-ticked. It rides this helper rather than a bare fetch so
   * the timeout, the redirect refusal and the truncated error text apply to the
   * retraction exactly as they do to the post — an un-tick that hangs for
   * thirty seconds is the same outage as a cue that does.
   */
  method?: 'POST' | 'DELETE'
}

/**
 * POST with a hard timeout, returning the response text on failure so the
 * channel can report WHY rather than "request failed".
 *
 * Throws on non-2xx and on timeout. Channels catch and convert — the contract
 * in channels/types.ts is that a channel returns a failed result rather than
 * letting one integration take the tick down.
 */
export async function postToChannel(
  url: string | URL,
  request: ChannelRequest,
  timeoutMs = CHANNEL_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: request.method ?? 'POST',
      headers: {
        'Content-Type': request.contentType ?? 'application/json',
        ...(request.headers ?? {}),
      },
      body: request.body,
      // assertSafeUrl checks the address the user TYPED. With the default
      // redirect:'follow' that check is decorative — any user-supplied host can
      // answer 302 and send this fetch straight to the loopback or metadata
      // address the guard exists to refuse. None of these APIs redirect, so
      // rejecting outright costs nothing real.
      redirect: 'error',
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      // Truncated: a provider error page can be a whole HTML document, and this
      // string ends up in a cron log line.
      throw new Error(`${res.status} ${text.slice(0, 200)}`)
    }
    return text
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Read a required string from a channel's config or secrets. */
export function requireString(
  bag: Record<string, unknown>,
  key: string,
): string | null {
  const value = bag[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
