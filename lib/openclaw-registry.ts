/**
 * Where Anchor POSTs change events, and how it finds them.
 *
 * Registrations live in `plugin_registrations` (migration 039). They used to
 * live in an in-process Map, with a comment saying "in production this would
 * live in Supabase" — and production arrived. On Vercel that Map dies with the
 * instance and is absent on every other one, so a plugin that registered
 * against instance A never heard about a mutation served by instance B. The
 * plugin re-registering on startup did not save it: the very next cold start
 * lost it again.
 *
 * THREE THINGS ABOUT THE SHAPE:
 *
 * 1. The table is the truth; the Map below is a CACHE with a short TTL. This is
 *    called from `lib/db.ts` on every mutation, and a query per write to find
 *    the usually-zero rows would be a real cost for a rare payoff. Staleness is
 *    bounded by the TTL, which is strictly better than the old behaviour's
 *    "invisible to other instances forever".
 *
 * 2. It degrades to the old Map when the table is missing, so a build deployed
 *    ahead of `db:push` keeps registering rather than 500ing. Same
 *    `…Available` flag pattern `lib/db.ts` uses for `item_events`.
 *
 * 3. SERVER ONLY, and it has to say so at runtime: `notifyPlugins` is reached
 *    through `lib/db.ts`, which the BROWSER also imports. There is no service
 *    key there, so the client path is a deliberate no-op — exactly what the
 *    empty Map did before. The import is dynamic to keep the service client out
 *    of the browser bundle.
 */

export interface PluginRegistration {
  pluginId: string
  webhookUrl: string
  secret: string
  userId: string
  events: string[]
  registeredAt: string
}

/**
 * The fallback store, and the cache.
 *
 * Keyed `${pluginId}:${userId}`, as it always was. Still exported because it is
 * the whole registry when the table is absent.
 */
export const registeredPlugins = new Map<string, PluginRegistration>()

/** False once a query proved `plugin_registrations` is not deployed yet. */
let tableAvailable = true

/**
 * How long a user's rows may be reused before re-reading.
 *
 * Bounds how late a NEW registration starts receiving events on an instance
 * that had already cached an answer. A minute is short next to "until the next
 * cold start", which is what it replaces, and long enough that a burst of
 * mutations costs one query rather than one each.
 */
const CACHE_TTL_MS = 60_000

const cache = new Map<string, { rows: PluginRegistration[]; at: number }>()

/**
 * Do we hold a service key?
 *
 * The question that actually matters, rather than "am I in Node". Next inlines
 * only `NEXT_PUBLIC_*` into the browser bundle, so `SUPABASE_SECRET_KEY` is
 * `undefined` on the client by construction — which makes this the same test as
 * "server-side" without depending on a global that a test environment may
 * legitimately provide.
 */
function haveServiceKey(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY)
}

function rowToRegistration(row: Record<string, unknown>): PluginRegistration {
  return {
    pluginId: String(row.plugin_id ?? ''),
    webhookUrl: String(row.webhook_url ?? ''),
    secret: String(row.secret ?? ''),
    userId: String(row.user_id ?? ''),
    events: Array.isArray(row.events) ? (row.events as string[]) : [],
    registeredAt: String(row.registered_at ?? ''),
  }
}

/** Every registration for one user, table first, cache in front. */
async function registrationsFor(userId: string): Promise<PluginRegistration[]> {
  const local = [...registeredPlugins.values()].filter((r) => r.userId === userId)
  if (!haveServiceKey() || !tableAvailable) return local

  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows

  try {
    const { createServiceClient } = await import('./supabase-service')
    const { data, error } = await createServiceClient()
      .from('plugin_registrations')
      .select('plugin_id, webhook_url, secret, user_id, events, registered_at')
      .eq('user_id', userId)

    if (error) {
      // 42P01 undefined_table / PGRST205 unknown relation — deployed ahead of
      // the migration. Stop asking and use whatever this instance holds.
      if (error.code === '42P01' || error.code === 'PGRST205') tableAvailable = false
      else console.warn('[openclaw-registry] registration read failed', error.message)
      return local
    }

    const rows = (data ?? []).map((r) => rowToRegistration(r as Record<string, unknown>))
    cache.set(userId, { rows, at: Date.now() })
    return rows
  } catch (err) {
    console.warn('[openclaw-registry] registration read threw', err)
    return local
  }
}

/**
 * Record a webhook registration. Upserts — a plugin restarting must replace its
 * row, not add a second one.
 */
export async function registerPlugin(reg: PluginRegistration): Promise<void> {
  // Written to the Map too, so this instance is correct immediately and so the
  // fallback path has something to serve.
  registeredPlugins.set(`${reg.pluginId}:${reg.userId}`, reg)
  cache.delete(reg.userId)
  if (!haveServiceKey() || !tableAvailable) return

  try {
    const { createServiceClient } = await import('./supabase-service')
    const { error } = await createServiceClient()
      .from('plugin_registrations')
      .upsert(
        {
          user_id: reg.userId,
          plugin_id: reg.pluginId,
          webhook_url: reg.webhookUrl,
          secret: reg.secret,
          events: reg.events,
          registered_at: reg.registeredAt,
        },
        { onConflict: 'user_id,plugin_id' }
      )
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') tableAvailable = false
      else console.warn('[openclaw-registry] registration write failed', error.message)
    }
  } catch (err) {
    console.warn('[openclaw-registry] registration write threw', err)
  }
}

/** Forget a registration — called on plugin shutdown. */
export async function deregisterPlugin(userId: string, pluginId: string): Promise<void> {
  registeredPlugins.delete(`${pluginId}:${userId}`)
  cache.delete(userId)
  if (!haveServiceKey() || !tableAvailable) return

  try {
    const { createServiceClient } = await import('./supabase-service')
    const { error } = await createServiceClient()
      .from('plugin_registrations')
      .delete()
      .eq('user_id', userId)
      .eq('plugin_id', pluginId)
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
      console.warn('[openclaw-registry] deregister failed', error.message)
    }
  } catch (err) {
    console.warn('[openclaw-registry] deregister threw', err)
  }
}

/** Test seam: drop cached rows so a following read hits the table again. */
export function clearRegistrationCache(): void {
  cache.clear()
}

/**
 * Notify all registered plugins for a given user + event type.
 * Called from db.ts whenever a mutation succeeds.
 *
 * Payload shape (sent as JSON to webhookUrl):
 *   { event, userId, data, timestamp }
 *
 * HMAC signature (if secret is set):
 *   X-Anchor-Signature: sha256=<hex>
 */
export async function notifyPlugins(
  userId: string,
  event: AnchorEvent,
  data: unknown
): Promise<void> {
  const payload = JSON.stringify({
    event,
    userId,
    data,
    timestamp: new Date().toISOString(),
  })

  const registrations = await registrationsFor(userId)
  const promises: Promise<void>[] = []

  for (const reg of registrations) {
    // Belt and braces: the query already filters by user, but the fallback Map
    // holds every user this instance has seen.
    if (reg.userId !== userId) continue
    if (!reg.events.includes(event) && !reg.events.includes('*')) continue

    promises.push(sendWebhook(reg, payload))
  }

  // Fire-and-forget: don't block the mutation response
  await Promise.allSettled(promises)
}

async function sendWebhook(reg: PluginRegistration, payload: string): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Sign the payload if a secret is configured
  if (reg.secret) {
    const sig = await hmacSha256(reg.secret, payload)
    headers['X-Anchor-Signature'] = `sha256=${sig}`
  }

  try {
    const res = await fetch(reg.webhookUrl, { method: 'POST', headers, body: payload })
    if (!res.ok) {
      console.warn(`[openclaw-registry] Webhook delivery failed for ${reg.pluginId}: ${res.status}`)
    }
  } catch (err) {
    console.warn(`[openclaw-registry] Webhook error for ${reg.pluginId}:`, err)
  }
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type AnchorEvent =
  | 'tasks.updated'
  | 'habits.updated'
  | 'projects.updated'
  | 'habitGroups.updated'
  | '*'
