import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/agent/chat-url
 * Returns the stored openclaw_chat_url, agentId, and anchorApiKey for the current authenticated user.
 * The anchorApiKey is fetched server-side so it is never hardcoded in the client.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('openclaw_chat_url, openclaw_agent_id, openclaw_api_key')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      chatUrl: data?.openclaw_chat_url ?? null,
      agentId: data?.openclaw_agent_id ?? null,
      anchorApiKey: data?.openclaw_api_key ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
