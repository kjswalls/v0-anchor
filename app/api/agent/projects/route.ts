import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { createProject } from '@/lib/db'
import type { Project } from '@/lib/planner-types'

/**
 * POST /api/agent/projects
 *
 * Creates a new project for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body:
 *   Required: name (string), emoji (string)
 *   Optional: id (UUID, generated if not provided), repeatFrequency, repeatDays,
 *             repeatMonthDay, timeBucket, startTime, duration
 *
 * Response: { project } with 201 status
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

  const project: Project = {
    id: body.id ?? crypto.randomUUID(),
    name: body.name,
    emoji: body.emoji,
    repeatFrequency: body.repeatFrequency,
    repeatDays: body.repeatDays,
    repeatMonthDay: body.repeatMonthDay,
    timeBucket: body.timeBucket,
    startTime: body.startTime,
    duration: body.duration,
  }

  await createProject(userId, project, serviceClient)

  return NextResponse.json({ project }, { status: 201 })
}
