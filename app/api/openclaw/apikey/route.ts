import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

/**
 * GET /api/openclaw/apikey
 * Returns the current user's OpenClaw API key (or null if not yet generated).
 * Auth: Supabase session cookie.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data } = await service
    .from('user_settings')
    .select('openclaw_api_key')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ apiKey: data?.openclaw_api_key ?? null })
}

/**
 * POST /api/openclaw/apikey
 * Generates (or regenerates) the current user's OpenClaw API key.
 * Returns the new key. Auth: Supabase session cookie.
 */
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Generate a secure random key: "anchor_" prefix + 32 random hex bytes
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const apiKey = 'anchor_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

  const service = createServiceClient()
  const { error } = await service
    .from('user_settings')
    .upsert(
      { user_id: user.id, openclaw_api_key: apiKey },
      { onConflict: 'user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ apiKey })
}
