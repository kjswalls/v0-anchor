import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { fetchTasks, fetchHabits, fetchProjects, fetchHabitGroups } from '@/lib/db'

/**
 * GET /api/openclaw/context
 *
 * Returns the authenticated user's current tasks, habits, projects, and habit
 * groups. Used by the OpenClaw Anchor plugin to seed its local context cache.
 *
 * Auth (either):
 *   A) Bearer <openclaw_api_key>  — server-to-server (plugin uses this)
 *      userId is resolved from the key — no query param needed
 *   B) Supabase session cookie    — in-browser / logged-in user
 */
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [tasks, habits, projects, habitGroups] = await Promise.all([
    fetchTasks(userId),
    fetchHabits(userId),
    fetchProjects(userId),
    fetchHabitGroups(userId),
  ])

  return NextResponse.json({
    userId,
    fetchedAt: new Date().toISOString(),
    tasks,
    habits,
    projects,
    habitGroups,
  })
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  // 1. Bearer token → look up by openclaw_api_key (plugin / server-to-server)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return resolveUserIdFromApiKey(token)
  }

  // 2. Supabase session cookie (in-browser)
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
