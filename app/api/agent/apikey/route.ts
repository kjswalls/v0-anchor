import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/agent/apikey
 * Returns the current user's OpenClaw API key (or null if not yet generated).
 * Uses the session client — RLS ensures users only see their own row.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('openclaw_api_key')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ apiKey: data?.openclaw_api_key ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/agent/apikey
 * Generates (or regenerates) the current user's OpenClaw API key.
 * Uses the session client — RLS ensures users only write their own row.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Generate a secure random key: "anchor_" prefix + 32 random hex bytes
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const apiKey = 'anchor_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, openclaw_api_key: apiKey },
        { onConflict: 'user_id' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ apiKey })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
