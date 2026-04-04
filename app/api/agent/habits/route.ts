import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { createHabit } from '@/lib/db'
import type { Habit } from '@/lib/planner-types'

/**
 * POST /api/agent/habits
 *
 * Creates a new habit for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body:
 *   Required: title (string), group (string), status ("pending"|"done"|"skipped"),
 *             repeatFrequency (string)
 *   Defaults: streak (0), completedDates ([]), skippedDates ([]), dailyCounts ({})
 *   Optional: id (UUID, generated if not provided), timeBucket, startTime, repeatDays,
 *             repeatMonthDay, timesPerDay, currentDayCount
 *
 * Response: { habit } with 201 status
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

  const habit: Habit = {
    id: body.id ?? crypto.randomUUID(),
    title: body.title,
    group: body.group,
    streak: body.streak ?? 0,
    status: body.status,
    repeatFrequency: body.repeatFrequency,
    completedDates: body.completedDates ?? [],
    skippedDates: body.skippedDates ?? [],
    dailyCounts: body.dailyCounts ?? {},
    timeBucket: body.timeBucket,
    startTime: body.startTime,
    repeatDays: body.repeatDays,
    repeatMonthDay: body.repeatMonthDay,
    timesPerDay: body.timesPerDay,
    currentDayCount: body.currentDayCount,
  }

  await createHabit(userId, habit, serviceClient)

  return NextResponse.json({ habit }, { status: 201 })
}
