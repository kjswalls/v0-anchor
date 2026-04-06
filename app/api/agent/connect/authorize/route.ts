import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

/**
 * POST /api/agent/connect/authorize
 *
 * Authorizes a pending device session. Requires a valid Supabase session cookie.
 * Body: { userCode: "ABCD-1234" }
 *
 * - Looks up the session by user_code (status=pending, not expired)
 * - Reuses existing openclaw_api_key if user already has one, otherwise generates new
 * - Updates session: status='authorized', user_id, api_key
 * - Upserts api_key into user_settings
 */
export async function POST(req: NextRequest) {
  try {
    // Require session auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const userCode = typeof body?.userCode === 'string' ? body.userCode.trim().toUpperCase() : ''
    if (!userCode) {
      return NextResponse.json({ error: 'Missing userCode' }, { status: 400 })
    }

    const service = createServiceClient()

    // Look up the pending, unexpired session
    const { data: session, error: sessionErr } = await service
      .from('connect_sessions')
      .select('id, status, expires_at')
      .eq('user_code', userCode)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 })
    }
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired code. Please start setup again.' },
        { status: 404 }
      )
    }

    // Reuse existing API key if the user already has one
    const { data: existing } = await service
      .from('user_settings')
      .select('openclaw_api_key')
      .eq('user_id', user.id)
      .maybeSingle()

    let apiKey = existing?.openclaw_api_key ?? null

    if (!apiKey) {
      // Generate a new key: "anchor_" + 32 random hex bytes
      const raw = crypto.getRandomValues(new Uint8Array(32))
      apiKey = 'anchor_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

      // Store in user_settings
      const { error: upsertErr } = await service
        .from('user_settings')
        .upsert(
          { user_id: user.id, openclaw_api_key: apiKey },
          { onConflict: 'user_id' }
        )
      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 })
      }
    }

    // Mark session as authorized (status guard prevents double-authorization race)
    const { error: updateErr } = await service
      .from('connect_sessions')
      .update({ status: 'authorized', user_id: user.id, api_key: apiKey })
      .eq('id', session.id)
      .eq('status', 'pending')

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
