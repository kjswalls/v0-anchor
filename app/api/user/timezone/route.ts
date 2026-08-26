import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * PATCH /api/user/timezone
 *
 * Updates the authenticated user's stored timezone.
 * Called automatically by the client on every app load with the browser's
 * current IANA timezone string — keeps it accurate when users travel.
 *
 * Body: { timezone: string }  e.g. { timezone: "America/Los_Angeles" }
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { timezone } = await req.json()
  if (!timezone || typeof timezone !== 'string') {
    return NextResponse.json({ error: 'timezone is required' }, { status: 400 })
  }

  // Validate it's a real IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
  } catch {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  }

  // Skip the write when nothing changed. The client PATCHes this on every app
  // load, but a user's timezone almost never differs from the stored one — an
  // unconditional upsert per load made this endpoint one of the database's
  // largest write sources (WAL + a dead tuple + later autovacuum) for a value
  // that changes maybe twice a year. A read here is a cache hit (effectively
  // free); the upsert it avoids is not. `maybeSingle` returns null for a
  // brand-new account with no row yet, which correctly falls through to the
  // upsert so the row still gets created.
  const { data: existing } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing && existing.timezone === timezone) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, timezone }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
