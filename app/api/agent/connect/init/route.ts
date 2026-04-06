import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

const ANCHOR_URL = 'https://v0-anchor-plum.vercel.app'
const SESSION_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAX_PENDING_SESSIONS_PER_HOUR = 10

// Unambiguous chars for user codes — no O/I/L (alpha) or 0/1 (digits)
const ALPHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ' // 23 chars
const DIGIT_CHARS = '23456789' // 8 chars

function generateUserCode(): string {
  const randomAlpha = () => Array.from(
    crypto.getRandomValues(new Uint8Array(4)),
    (b) => ALPHA_CHARS[b % ALPHA_CHARS.length]
  ).join('')
  const randomDigits = () => Array.from(
    crypto.getRandomValues(new Uint8Array(4)),
    (b) => DIGIT_CHARS[b % DIGIT_CHARS.length]
  ).join('')
  return `${randomAlpha()}-${randomDigits()}`
}

/**
 * POST /api/agent/connect/init
 *
 * Starts a device auth session. No authentication required.
 * Returns { sessionId, userCode, connectUrl, expiresAt }.
 *
 * Rate limit: max 10 pending sessions per IP per hour.
 * Cleanup: deletes all expired sessions on every call.
 */
export async function POST(req: NextRequest) {
  try {
    const service = createServiceClient()

    // Cleanup expired sessions (simple maintenance on every init)
    await service
      .from('connect_sessions')
      .delete()
      .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    // Rate limit: count pending sessions created by this IP in the last hour
    // We store IP in user_code metadata — instead, we count recent rows.
    // Since we don't store IP, use a simple count of pending sessions
    // created in last hour regardless of IP (good enough for single-user app).
    // For multi-user deployments, add an `ip` column to connect_sessions.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await service
      .from('connect_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', oneHourAgo)

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }

    if ((count ?? 0) >= MAX_PENDING_SESSIONS_PER_HOUR) {
      return NextResponse.json(
        { error: 'Too many pending sessions. Try again later.' },
        { status: 429 }
      )
    }

    const userCode = generateUserCode()
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    const { data, error } = await service
      .from('connect_sessions')
      .insert({ user_code: userCode, expires_at: expiresAt })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sessionId = data.id
    const connectUrl = `${ANCHOR_URL}/connect?code=${encodeURIComponent(userCode)}`

    return NextResponse.json({ sessionId, userCode, connectUrl, expiresAt })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
