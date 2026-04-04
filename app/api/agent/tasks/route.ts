import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { createTask } from '@/lib/db'
import type { Task } from '@/lib/planner-types'

/**
 * POST /api/agent/tasks
 *
 * Creates a new task for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body:
 *   Required: title (string), status ("todo"|"in-progress"|"done"), isScheduled (boolean), order (number)
 *   Optional: id (UUID, generated if not provided), priority, project, startDate, timeBucket,
 *             startTime, duration, repeatFrequency, repeatDays, repeatMonthDay
 *
 * Response: { task } with 201 status
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

  const task: Task = {
    id: body.id ?? crypto.randomUUID(),
    title: body.title,
    status: body.status,
    isScheduled: body.isScheduled,
    order: body.order,
    priority: body.priority,
    project: body.project,
    startDate: body.startDate,
    timeBucket: body.timeBucket,
    startTime: body.startTime,
    duration: body.duration,
    repeatFrequency: body.repeatFrequency,
    repeatDays: body.repeatDays,
    repeatMonthDay: body.repeatMonthDay,
  }

  await createTask(userId, task, serviceClient)

  return NextResponse.json({ task }, { status: 201 })
}
