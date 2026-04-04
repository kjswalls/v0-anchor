import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { createHabitGroup } from '@/lib/db'
import type { HabitGroupType } from '@/lib/planner-types'

/**
 * POST /api/agent/habit-groups
 *
 * Creates a new habit group for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body:
 *   Required: name (string), emoji (string)
 *   Optional: id (UUID, generated if not provided), color
 *
 * Response: { habitGroup } with 201 status
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = await resolveUserIdFromApiKey(authHeader.slice(7))
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const body = await req.json()

  const habitGroup: HabitGroupType = {
    id: body.id ?? crypto.randomUUID(),
    name: body.name,
    emoji: body.emoji,
    color: body.color,
  }

  await createHabitGroup(userId, habitGroup, serviceClient)

  return NextResponse.json({ habitGroup }, { status: 201 })
}
