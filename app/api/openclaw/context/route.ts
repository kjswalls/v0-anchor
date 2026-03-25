import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { fetchTasks, fetchHabits, fetchProjects, fetchHabitGroups } from '@/lib/db'

/**
 * GET /api/openclaw/context
 *
 * Returns the authenticated user's current tasks, habits, projects, and habit
 * groups in a single payload. Used by the OpenClaw Anchor channel plugin to
 * seed its local context cache.
 *
 * Auth: Bearer token in Authorization header (matches OPENCLAW_API_KEY env var)
 *       OR a valid Supabase session cookie (for in-browser use)
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Fetch data ────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveUserId(req: NextRequest): Promise<string | null> {
  // 1. Check for OpenClaw API key (server-to-server calls from the plugin)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const expectedKey = process.env.OPENCLAW_API_KEY
    if (!expectedKey) {
      console.warn('[openclaw/context] OPENCLAW_API_KEY not set')
      return null
    }
    if (token !== expectedKey) return null

    // Key is valid — extract userId from query param (plugin passes it)
    const userId = req.nextUrl.searchParams.get('userId')
    return userId || null
  }

  // 2. Fall back to Supabase session (in-browser / logged-in user)
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
