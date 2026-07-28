import { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import {
  TaskCreateSchema,
  HabitCreateSchema,
  TaskUpdateSchema,
  HabitUpdateSchema,
} from '@anchor-app/types'
import { createServiceClient, resolveUserIdFromApiKey } from './supabase-service'
import {
  createTask,
  createHabit,
  updateTask,
  updateHabit,
  deleteTask,
  deleteHabit,
  verifyItemOwnership,
} from './db'
import type { Habit, KnownItemType, Task } from './planner-types'

/**
 * Shared machinery for the /api/agent/tasks|habits routes. The route files are
 * thin facades over one handler set parameterized by ItemType; write bodies
 * are Zod-validated at the boundary so bad payloads get a 400 instead of
 * surfacing as Postgres CHECK-constraint 500s.
 *
 * Server-only: keep the Zod schemas out of lib/item-registry.ts so the client
 * bundle doesn't pay for them — this map is the registry's server-side API
 * extension.
 */

type DbClient = ReturnType<typeof createServiceClient>

interface AgentApiConfig {
  /** JSON key the POST response nests the created entity under. */
  payloadKey: 'task' | 'habit'
  createSchema: ZodType
  updateSchema: ZodType
  /**
   * Seeded under the body on create, matching the legacy routes' entity
   * construction and 201 echo. Load-bearing for habits: items.streak has no
   * column default, and the set_item_completion RPC only moves streak when it
   * is non-NULL (the guard that skips tasks) — a habit created without
   * streak: 0 would never accrue one.
   */
  createDefaults: Record<string, unknown>
  create: (userId: string, entity: never, client: DbClient) => Promise<void>
  update: (id: string, updates: never, userId: string, client: DbClient) => Promise<void>
  remove: (id: string, userId: string, client: DbClient) => Promise<void>
}

// Built-ins only: custom types are not exposed through the agent write API in
// v1 (items[] on the context endpoint serves reads).
const AGENT_API: Record<KnownItemType, AgentApiConfig> = {
  task: {
    payloadKey: 'task',
    createSchema: TaskCreateSchema,
    updateSchema: TaskUpdateSchema,
    createDefaults: {},
    create: (userId, entity, client) => createTask(userId, entity as Task, client),
    update: (id, updates, userId, client) =>
      updateTask(id, updates as Partial<Task>, userId, client),
    remove: (id, userId, client) => deleteTask(id, userId, client),
  },
  habit: {
    payloadKey: 'habit',
    createSchema: HabitCreateSchema,
    updateSchema: HabitUpdateSchema,
    createDefaults: { streak: 0, completedDates: [], skippedDates: [], dailyCounts: {} },
    create: (userId, entity, client) => createHabit(userId, entity as Habit, client),
    update: (id, updates, userId, client) =>
      updateHabit(id, updates as Partial<Habit>, userId, client),
    remove: (id, userId, client) => deleteHabit(id, userId, client),
  },
}

interface AgentAuth {
  userId: string
  serviceClient: DbClient
}

/** Bearer openclaw_api_key auth. Returns a 401 response when it fails. */
async function authenticateAgent(req: NextRequest): Promise<AgentAuth | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const serviceClient = createServiceClient()
  const userId = await resolveUserIdFromApiKey(authHeader.slice(7), serviceClient)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return { userId, serviceClient }
}

/** Parse + validate a JSON body. Returns a 400 response on failure. */
async function parseBody(
  req: NextRequest,
  schema: ZodType
): Promise<{ data: Record<string, unknown> } | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  return { data: parsed.data as Record<string, unknown> }
}

const errorResponse = (err: unknown) => {
  const msg = err instanceof Error ? err.message : 'Internal server error'
  return NextResponse.json({ error: msg }, { status: 500 })
}

/** POST /api/agent/<plural> — create an item of the given type. */
export function makeAgentCreateHandler(type: KnownItemType) {
  const api = AGENT_API[type]
  return async function POST(req: NextRequest) {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth
    const body = await parseBody(req, api.createSchema)
    if (body instanceof NextResponse) return body

    try {
      // createDefaults under the body, id resolved last (body id wins; the
      // schema turns id: null into undefined so it regenerates). Remaining
      // gaps fall through to the db mapper / column defaults, as before.
      const entity = {
        ...api.createDefaults,
        ...body.data,
        id: (body.data.id as string | undefined) ?? crypto.randomUUID(),
      }
      await api.create(auth.userId, entity as never, auth.serviceClient)
      return NextResponse.json({ [api.payloadKey]: entity }, { status: 201 })
    } catch (err) {
      return errorResponse(err)
    }
  }
}

/** PATCH + DELETE /api/agent/<plural>/:id handlers for the given type. */
export function makeAgentItemHandlers(type: KnownItemType) {
  const api = AGENT_API[type]

  const PATCH = async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await verifyItemOwnership(auth.serviceClient, id, type, auth.userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await parseBody(req, api.updateSchema)
    if (body instanceof NextResponse) return body

    try {
      // Nulls survive validation only on clearable fields; the db-layer
      // allowlists translate them into NULL writes.
      await api.update(id, body.data as never, auth.userId, auth.serviceClient)
      return NextResponse.json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const DELETE = async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await verifyItemOwnership(auth.serviceClient, id, type, auth.userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      await api.remove(id, auth.userId, auth.serviceClient)
      return NextResponse.json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  return { PATCH, DELETE }
}
