import { NextRequest, NextResponse } from 'next/server'
import type { HabitItem, TaskItem } from '@anchor-app/types'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { fetchItems, fetchProjects, fetchHabitGroups, fetchRoutines, toLegacyTask, toLegacyHabit } from '@/lib/db'
import { isOpenLoopSuppressedOn } from '@/lib/active'
import { toDateStr } from '@/lib/recurrence'

/**
 * GET /api/agent/context
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
  const [items, projects, habitGroups, routinesResult, settingsResult] = await Promise.all([
    fetchItems(userId, undefined, dbClient),
    fetchProjects(userId, dbClient),
    fetchHabitGroups(userId, dbClient),
    // Needed for the filter below to see routine-caused suppression. Without
    // it the server would answer "pending" for work the app itself hides,
    // and the plugin would nag about it.
    fetchRoutines(userId, dbClient),
    serviceClient
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single(),
  ])
  // null means the tables are unreachable — degrade to item-level pause rather
  // than 500ing a read the plugin depends on.
  const routines = routinesResult ?? []

  // Timezone priority: stored user setting → X-Timezone header fallback → UTC
  // The client syncs the browser timezone to user_settings on every app load,
  // so the stored value stays current even when users travel.
  //
  // Resolved BEFORE the projections below, which read it: this is a dateless
  // surface, so "today" is the user's day per plan decision 3.
  const userTimezone =
    settingsResult.data?.timezone ??
    req.headers.get('x-timezone') ??
    'UTC'
  const todayStr = toDateStr(new Date(), userTimezone)

  // The pinned tasks[]/habits[] arrays are projections of the same items
  // fetch — filtering preserves the per-type relative order the old
  // fetchTasks/fetchHabits queries produced. Future custom types appear in
  // items[] only.
  //
  // Suppressed OPEN LOOPS are dropped: a deployed plugin would otherwise
  // narrate paused work as pending and nag about it, since the plugin has no
  // concept of pausing and cannot get one without an npm republish. Arrays may
  // shrink freely — that is schema-safe for every build ever published, whereas
  // a new field or status value is not.
  //
  // Dropping whole rows takes their history with them, which is the ONE
  // recorded waiver of the history rule (plan decision 6). It is acceptable
  // only because items[] below stays unfiltered and carries the same rows
  // complete, pause metadata included, for future plugin builds. A paused item
  // that was already marked today is NOT an open loop, so it stays in these
  // arrays and the plugin's narration keeps matching the EOD review.
  const visible = items.filter(
    (i) => !isOpenLoopSuppressedOn(i, todayStr, { userTimezone, routines })
  )
  const tasks = visible.filter((i): i is TaskItem => i.type === 'task').map(toLegacyTask)
  const habits = visible.filter((i): i is HabitItem => i.type === 'habit').map(toLegacyHabit)

  return NextResponse.json({
    userId,
    fetchedAt: new Date().toISOString(),
    userTimezone,
    tasks,
    habits,
    projects,
    habitGroups,
    // Additive — old plugin builds strip unknown keys. Version 2 = tasks/habits
    // are projections of the unified items table (migration 019); version 3 =
    // unified items[] included alongside the legacy projections.
    items,
    schemaVersion: 3,
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
