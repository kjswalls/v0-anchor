import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

/**
 * /api/agent/gateway — read and write the user's OpenClaw gateway connection.
 *
 * The URL is not a secret and lives in user_settings. The token is FULL
 * OPERATOR ACCESS to the gateway, lives in user_secrets (no anon/authenticated
 * policies — service role only, migration 012), and is NEVER returned: GET
 * reports whether one is stored, never what it is.
 *
 * Contrast /api/agent/chat-url, which hands the browser an API key so it can
 * POST at the gateway itself. That is the arrangement this transport exists to
 * retire; it stays only until the plugin chat path is removed.
 */

interface GatewayBody {
  gatewayUrl?: string | null
  token?: string | null
}

/** Reject anything that is not a plausible absolute http(s) URL. */
function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // The URL comes back through the session client (RLS-scoped); the token's
    // presence is checked with the service client because the user's own JWT
    // deliberately cannot read user_secrets at all.
    const [{ data: settings }, { data: secrets }] = await Promise.all([
      supabase
        .from('user_settings')
        .select('openclaw_gateway_url, openclaw_agent_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      createServiceClient()
        .from('user_secrets')
        .select('openclaw_gateway_token')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const gatewayUrl = settings?.openclaw_gateway_url ?? null
    const hasToken = Boolean(secrets?.openclaw_gateway_token)

    return NextResponse.json({
      gatewayUrl,
      agentId: settings?.openclaw_agent_id ?? null,
      hasToken,
      /** Both halves present — the client uses this to pick its transport. */
      configured: Boolean(gatewayUrl && hasToken),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: GatewayBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Each field is optional so the settings UI can update the URL without
    // making the user retype a token it can never show them.
    if (body.gatewayUrl !== undefined) {
      const url = body.gatewayUrl === null || body.gatewayUrl.trim() === ''
        ? null
        : normalizeUrl(body.gatewayUrl)
      if (body.gatewayUrl && url === null) {
        return NextResponse.json({ error: 'Enter a full http(s) URL' }, { status: 400 })
      }
      const { error } = await supabase
        .from('user_settings')
        .update({ openclaw_gateway_url: url })
        .eq('user_id', user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (body.token !== undefined) {
      const token = body.token === null || body.token.trim() === '' ? null : body.token.trim()
      const { error } = await createServiceClient()
        .from('user_secrets')
        .upsert({ user_id: user.id, openclaw_gateway_token: token }, { onConflict: 'user_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
