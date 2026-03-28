import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
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
  const { userId, isBearer } = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Bearer token (plugin/server-to-server) → use service client to bypass RLS
  // Session cookie (in-browser) → RLS handles it naturally, no service client needed
  const dbClient = isBearer ? createServiceClient() : undefined

  const serviceClient = createServiceClient()
  const [tasks, habits, projects, habitGroups, settingsResult] = await Promise.all([
    fetchTasks(userId, dbClient),
    fetchHabits(userId, dbClient),
    fetchProjects(userId, dbClient),
    fetchHabitGroups(userId, dbClient),
    serviceClient
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single(),
  ])

  // Timezone priority: stored user setting → X-Timezone header fallback → UTC
  // The client syncs the browser timezone to user_settings on every app load,
  // so the stored value stays current even when users travel.
  const userTimezone =
    settingsResult.data?.timezone ??
    req.headers.get('x-timezone') ??
    'UTC'

  return NextResponse.json({
    userId,
    fetchedAt: new Date().toISOString(),
    userTimezone,
    tasks,
    habits,
    projects,
    habitGroups,
  })
}

async function resolveUserId(req: NextRequest): Promise<{ userId: string | null; isBearer: boolean }> {
  // 1. Bearer token → look up by openclaw_api_key (plugin / server-to-server)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const userId = await resolveUserIdFromApiKey(token)
    return { userId, isBearer: true }
  }

  // 2. Supabase session cookie (in-browser)
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { userId: data.user?.id ?? null, isBearer: false }
}
