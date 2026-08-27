import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { createProject } from '@/lib/db'
import type { HabitGroupType, Project } from '@/lib/planner-types'

/**
 * POST /api/agent/habit-groups
 *
 * Creates a new container for the authenticated user.
 *
 * A LEGACY ALIAS SINCE MIGRATION 039. There is one CLASSIFY kind now, so this
 * writes a `projects` row — exactly what POST /api/agent/projects does. The
 * route stays because a published OpenClaw build calls it and an agent told
 * "make a habit group" has no way to learn a new URL without an npm republish;
 * deleting it would turn a working verb into a 404 for an unbounded number of
 * deployed clients.
 *
 * The RESPONSE keeps its old shape and its old key. `{ habitGroup }` is what
 * the caller destructures, and `HabitGroupType` has no time-block fields — so
 * the four container fields are echoed rather than the whole project, matching
 * the `habitGroups[]` projection in /api/agent/context for the same reason.
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

  const project: Project = {
    id: body.id ?? crypto.randomUUID(),
    name: body.name,
    emoji: body.emoji,
    color: body.color,
  }

  await createProject(userId, project, serviceClient)

  const habitGroup: HabitGroupType = {
    id: project.id,
    name: project.name,
    emoji: project.emoji,
    color: project.color,
  }
  return NextResponse.json({ habitGroup }, { status: 201 })
}
