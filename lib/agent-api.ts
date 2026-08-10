import { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import {
  TaskCreateSchema,
  HabitCreateSchema,
  TaskUpdateSchema,
  HabitUpdateSchema,
  RoutineCreateSchema,
  RoutineUpdateSchema,
  ProgramCreateSchema,
  ProgramUpdateSchema,
} from '@anchor-app/types'
import { createServiceClient, resolveUserIdFromApiKey } from './supabase-service'
import {
  createTask,
  createHabit,
  updateTask,
  updateHabit,
  deleteTask,
  deleteHabit,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  createProgram,
  updateProgram,
  deleteProgram,
  verifyItemOwnership,
  validateParentItemId,
} from './db'
import { resolvePauseWrite, type Pausable } from './active'
import { isCollectible, isPausable } from './item-registry'
import { toDateStr } from './recurrence'
import type { Habit, Item, KnownItemType, Program, Routine, Task } from './planner-types'

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

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 })

// ── Pause, membership, and the guards Postgres cannot state ───────────────────

/**
 * The user's zone, which is the frame the pause interval is resolved in.
 *
 * UTC fallback matches the context route: it is the same read, and a pause
 * resolved a few hours off is far better than a 500 on a write the agent has
 * no way to retry into success.
 */
async function userTimezone(client: DbClient, userId: string): Promise<string> {
  const { data } = await client
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.timezone as string | undefined) ?? 'UTC'
}

/**
 * The two fields isPausable/isCollectible actually read, wearing an Item's
 * shape so the REGISTRY stays the authority.
 *
 * Re-deriving "subtasks aren't collectible" from a raw row here would be a
 * second copy of a rule the registry already owns, and the copies would drift
 * the first time a capability changes. The cast is narrow on purpose — these
 * predicates touch `type`, `customType` and `parentItemId`, nothing else.
 */
function capabilityShape(row: { type: string; parent_item_id?: string | null }): Item {
  const parentItemId = row.parent_item_id ?? undefined
  if (row.type === 'task' || row.type === 'habit') {
    return { type: row.type, parentItemId } as unknown as Item
  }
  return { type: 'custom', customType: row.type, parentItemId } as unknown as Item
}

interface MemberRow {
  id: string
  type: string
  parent_item_id: string | null
}

/**
 * Every id in a membership array must be one of this user's items, and one the
 * registry says may join a collection.
 *
 * Checked here rather than left to the database because the two failure modes
 * are both silent otherwise. The composite (id, user_id) foreign keys reject a
 * cross-user id — but reconcileMembership deliberately SWALLOWS 23503 per row
 * (an undo replaying a snapshot whose member left the trash meanwhile must not
 * fail wholesale), so an agent's typo would return 200 having stored nothing.
 * And the subtask rule (plan decision 7) is not expressible as a constraint at
 * all: a subtask surfaces only inside its parent, so collecting one produces
 * membership the user can neither see nor undo.
 *
 * "Exists" deliberately INCLUDES trashed items. Join rows outlive an item's
 * soft delete by design so a restore inside the 30-day window brings membership
 * back intact, and fetchRoutines/fetchPrograms read the join tables unfiltered
 * — so /api/agent/context publishes those ids. Filtering them here made the API
 * refuse an array it had just handed out: the documented read-modify-write
 * ("read the current members, send the full list") 400'd, and so did an
 * identity write. Ownership is enforced by the user_id filter, not by
 * deleted_at, and a purged or foreign id is still absent and still rejected.
 */
async function validateItemMembers(
  client: DbClient,
  userId: string,
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null
  const unique = [...new Set(ids)]
  const { data, error } = await client
    .from('items')
    .select('id, type, parent_item_id')
    .eq('user_id', userId)
    .in('id', unique)
  if (error) throw error

  const rows = (data ?? []) as MemberRow[]
  const found = new Set(rows.map((r) => r.id))
  const missing = unique.filter((id) => !found.has(id))
  if (missing.length > 0) {
    return `itemIds reference items that do not exist: ${missing.join(', ')}`
  }
  const uncollectible = rows.filter((r) => !isCollectible(capabilityShape(r)))
  if (uncollectible.length > 0) {
    return (
      `itemIds reference items that cannot join a collection: ` +
      `${uncollectible.map((r) => r.id).join(', ')} ` +
      `(subtasks belong to their parent and follow its state)`
    )
  }
  return null
}

/**
 * Same contract for a program's routineIds — trashed included, for the same
 * reason. Routines have no subtask analog, so existence is the whole check.
 */
async function validateRoutineMembers(
  client: DbClient,
  userId: string,
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null
  const unique = [...new Set(ids)]
  const { data, error } = await client
    .from('routines')
    .select('id')
    .eq('user_id', userId)
    .in('id', unique)
  if (error) throw error
  const found = new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
  const missing = unique.filter((id) => !found.has(id))
  return missing.length > 0
    ? `routineIds reference routines that do not exist: ${missing.join(', ')}`
    : null
}

/**
 * Membership arrays are whole-set replacements, so anything absent is removed.
 * Add back the members that are absent only because the caller could not SEE
 * them.
 *
 * The plan's dangling-id rule is explicit: "member arrays may reference trashed
 * items … arrays are pruned only by the purge CASCADE, never eagerly." The UI
 * honours it for free — ItemMemberList edits the raw stored array, so a trashed
 * member's id rides along untouched. An agent cannot: `items[]` on the wire is
 * `deleted_at`-filtered, so a model rebuilding the list from what it can see
 * omits the trashed id, reconcileMembership computes it as removed, and DELETEs
 * the join row. Restoring the item then returns it as a NON-member, silently,
 * and the restore-brings-membership-back guarantee is gone.
 *
 * Applied only at the agent boundary, not inside reconcileMembership: the agent
 * is the one caller that cannot see these ids, and the db layer's other callers
 * would pay two queries per membership write for a case they cannot hit.
 *
 * The cost is that an agent cannot REMOVE a trashed member. Neither can the UI
 * (the picker does not render them), and the purge clears them at 30 days.
 */
export function withTrashedMembersKept(
  desired: string[],
  current: string[],
  liveIds: ReadonlySet<string>,
): string[] {
  const asked = new Set(desired)
  const trashed = current.filter((id) => !asked.has(id) && !liveIds.has(id))
  return trashed.length === 0 ? desired : [...desired, ...trashed]
}

interface JoinTable {
  table: string
  ownerCol: string
  memberCol: string
  /** Where the member itself lives, so liveness can be resolved. */
  memberTable: 'items' | 'routines'
}

/** Gather what {@link withTrashedMembersKept} needs, then apply it. */
async function keepTrashedMembers(
  client: DbClient,
  userId: string,
  join: JoinTable,
  ownerId: string,
  desired: string[],
): Promise<string[]> {
  const { data, error } = await client
    .from(join.table)
    .select(join.memberCol)
    .eq(join.ownerCol, ownerId)
    .eq('user_id', userId)
  if (error) throw error
  // `unknown` first: the column name is dynamic, so the client cannot infer a
  // row shape and types the select as its error branch.
  const current = ((data ?? []) as unknown as Record<string, string>[]).map(
    (r) => r[join.memberCol],
  )

  const asked = new Set(desired)
  const candidates = current.filter((id) => !asked.has(id))
  // Nothing is being dropped, so nothing can be dropped WRONGLY — skip the
  // liveness read entirely on the common path (an add, or an unchanged set).
  if (candidates.length === 0) return desired

  const { data: live, error: liveError } = await client
    .from(join.memberTable)
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', candidates)
  if (liveError) throw liveError
  const liveIds = new Set(((live ?? []) as { id: string }[]).map((r) => r.id))
  return withTrashedMembersKept(desired, current, liveIds)
}

/**
 * Translate `paused` / `pausedUntil` into the columns, for an item.
 *
 * The verb is resolved against the row's CURRENT state (resolvePauseWrite needs
 * it to leave `pausedAt` alone when a pause is already running), so this costs
 * one read — taken only when the body actually carries the verb.
 */
async function pausePatchForItem(
  client: DbClient,
  userId: string,
  id: string,
  req: { paused?: boolean; pausedUntil?: string | null },
): Promise<{ patch: Pausable } | { error: string }> {
  const { data, error } = await client
    .from('items')
    .select('type, parent_item_id, paused_at, paused_until')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return { error: 'Not found' }

  const row = data as MemberRow & { paused_at: string | null; paused_until: string | null }
  if (!isPausable(capabilityShape(row))) {
    return {
      error:
        'this item cannot be paused — subtasks surface only inside their parent ' +
        'and follow its state',
    }
  }

  const tz = await userTimezone(client, userId)
  const now = new Date()
  const resolved = resolvePauseWrite(
    { pausedAt: row.paused_at ?? undefined, pausedUntil: row.paused_until ?? undefined },
    req,
    toDateStr(now, tz),
    now.toISOString(),
    tz,
  )
  return 'reason' in resolved ? { error: resolved.reason } : { patch: resolved.patch }
}

/** POST /api/agent/<plural> — create an item of the given type. */
export function makeAgentCreateHandler(type: KnownItemType) {
  const api = AGENT_API[type]
  return async function POST(req: NextRequest) {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth
    const body = await parseBody(req, api.createSchema)
    if (body instanceof NextResponse) return body

    // parentItemId is a reference, and Zod can only shape-check it — the
    // ownership/type/nesting rules live in one guard shared with PATCH.
    if (type === 'task') {
      const parentId = (body.data as { parentItemId?: string | null }).parentItemId
      if (typeof parentId === 'string') {
        const problem = await validateParentItemId(
          auth.serviceClient,
          auth.userId,
          (body.data.id as string | undefined) ?? null,
          parentId
        )
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
      }
    }

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

    // Same referential guard as create: without it, a hallucinated id can
    // self-parent (item vanishes from every view), point at another user's
    // row, or nest subtasks.
    if (type === 'task') {
      const parentId = (body.data as { parentItemId?: string | null }).parentItemId
      if (typeof parentId === 'string') {
        const problem = await validateParentItemId(
          auth.serviceClient,
          auth.userId,
          id,
          parentId
        )
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
      }
    }

    // The pause VERB is not a column. Both keys are peeled off before the
    // update reaches the db layer — `pausedUntil` especially, because it IS in
    // updatesToRow's allowlist and would otherwise be written straight through,
    // skipping the interval rules resolvePauseWrite exists to enforce.
    const { paused, pausedUntil, ...fields } = body.data as {
      paused?: boolean
      pausedUntil?: string | null
    }
    const updates: Record<string, unknown> = fields
    if (paused !== undefined || pausedUntil !== undefined) {
      let resolved
      try {
        resolved = await pausePatchForItem(auth.serviceClient, auth.userId, id, {
          paused,
          pausedUntil,
        })
      } catch (err) {
        return errorResponse(err)
      }
      if ('error' in resolved) {
        // 'Not found' here means the row vanished between the ownership check
        // and this read — a 404 is the truthful answer, not a 400.
        return resolved.error === 'Not found'
          ? NextResponse.json({ error: 'Not found' }, { status: 404 })
          : badRequest(resolved.error)
      }
      Object.assign(updates, resolved.patch)
    }

    try {
      // Nulls survive validation only on clearable fields; the db-layer
      // allowlists translate them into NULL writes.
      await api.update(id, updates as never, auth.userId, auth.serviceClient)
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

// ── Routines & programs ───────────────────────────────────────────────────────
// Agent-writable from schemaVersion 4. Reads stay on /api/agent/context, which
// serves routines[] and programs[] alongside the items they gate — the same
// split tasks and habits have always had.

export type ContainerKind = 'routine' | 'program'

interface ContainerApiConfig {
  payloadKey: ContainerKind
  table: 'routines' | 'programs'
  createSchema: ZodType
  updateSchema: ZodType
  /** Merged UNDER the body on create — the columns the db layer requires. */
  createDefaults: Record<string, unknown>
  create: (userId: string, entity: never, client: DbClient) => Promise<void>
  update: (userId: string, id: string, updates: never, client: DbClient) => Promise<void>
  remove: (userId: string, id: string, client: DbClient) => Promise<void>
  /** True when this container may hold routines as well as items. */
  holdsRoutines: boolean
  /** True when this container's suppression is expressed as pause columns. */
  usesPauseVerb: boolean
  /** Where this container's item membership lives, for the trashed-member rule. */
  itemJoin: JoinTable
  /** Only programs hold routines. */
  routineJoin?: JoinTable
}

const CONTAINER_API: Record<ContainerKind, ContainerApiConfig> = {
  routine: {
    payloadKey: 'routine',
    table: 'routines',
    createSchema: RoutineCreateSchema,
    updateSchema: RoutineUpdateSchema,
    // itemIds is NOT NULL-able app-side (Routine.itemIds is required), and
    // createRoutine reads .length on it before deciding to reconcile.
    createDefaults: { itemIds: [] },
    create: (userId, entity, client) => createRoutine(userId, entity as Routine, client),
    update: (userId, id, updates, client) =>
      updateRoutine(userId, id, updates as Partial<Routine>, client),
    remove: (userId, id, client) => deleteRoutine(userId, id, client),
    holdsRoutines: false,
    usesPauseVerb: true,
    itemJoin: {
      table: 'routine_items',
      ownerCol: 'routine_id',
      memberCol: 'item_id',
      memberTable: 'items',
    },
  },
  program: {
    payloadKey: 'program',
    table: 'programs',
    createSchema: ProgramCreateSchema,
    updateSchema: ProgramUpdateSchema,
    // 'auto' with no range means "always on", which is the least surprising
    // thing a program created without a state can be — and unlike a pause it
    // needs no timestamp, so there is nothing to derive.
    createDefaults: { state: 'auto', itemIds: [], routineIds: [] },
    create: (userId, entity, client) => createProgram(userId, entity as Program, client),
    update: (userId, id, updates, client) =>
      updateProgram(userId, id, updates as Partial<Program>, client),
    remove: (userId, id, client) => deleteProgram(userId, id, client),
    holdsRoutines: true,
    // Programs express the same idea as a tri-state enum, which carries no
    // derived timestamp and therefore needs no verb translation: `state` IS the
    // verb. See isProgramActiveOn for why the two containers differ.
    usesPauseVerb: false,
    itemJoin: {
      table: 'program_items',
      ownerCol: 'program_id',
      memberCol: 'item_id',
      memberTable: 'items',
    },
    routineJoin: {
      table: 'program_routines',
      ownerCol: 'program_id',
      memberCol: 'routine_id',
      memberTable: 'routines',
    },
  },
}

async function verifyContainerOwnership(
  client: DbClient,
  table: string,
  id: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from(table)
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  return !!data && data.user_id === userId
}

/** Membership arrays in a create/update body, validated together. */
async function validateContainerMembers(
  client: DbClient,
  userId: string,
  body: { itemIds?: string[]; routineIds?: string[] },
  config: ContainerApiConfig,
): Promise<string | null> {
  if (body.itemIds) {
    const problem = await validateItemMembers(client, userId, body.itemIds)
    if (problem) return problem
  }
  if (body.routineIds) {
    // Unreachable for routines — RoutineUpdateSchema has no routineIds key and
    // Zod strips unknown ones — but stated rather than assumed, so nesting a
    // routine inside a routine can never arrive silently through a schema edit.
    if (!config.holdsRoutines) return 'routines cannot hold other routines'
    const problem = await validateRoutineMembers(client, userId, body.routineIds)
    if (problem) return problem
  }
  return null
}

/**
 * Translate a container's pause verb. Routines only — see `usesPauseVerb`.
 *
 * `current` is the row's stored pause columns; on create it is empty, which is
 * what makes `paused: true` at creation mean "born paused, from now".
 */
async function pausePatchForContainer(
  client: DbClient,
  userId: string,
  current: Pausable,
  req: { paused?: boolean; pausedUntil?: string | null },
): Promise<{ patch: Pausable } | { error: string }> {
  const tz = await userTimezone(client, userId)
  const now = new Date()
  const resolved = resolvePauseWrite(current, req, toDateStr(now, tz), now.toISOString(), tz)
  return 'reason' in resolved ? { error: resolved.reason } : { patch: resolved.patch }
}

/** POST /api/agent/<routines|programs> */
export function makeContainerCreateHandler(kind: ContainerKind) {
  const config = CONTAINER_API[kind]
  return async function POST(req: NextRequest) {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth
    const body = await parseBody(req, config.createSchema)
    if (body instanceof NextResponse) return body

    const { paused, pausedUntil, ...fields } = body.data as {
      paused?: boolean
      pausedUntil?: string | null
      itemIds?: string[]
      routineIds?: string[]
    }

    try {
      const problem = await validateContainerMembers(
        auth.serviceClient,
        auth.userId,
        fields,
        config,
      )
      if (problem) return badRequest(problem)

      const entity: Record<string, unknown> = {
        ...config.createDefaults,
        ...fields,
        id: (fields as { id?: string }).id ?? crypto.randomUUID(),
      }

      if (config.usesPauseVerb && (paused !== undefined || pausedUntil !== undefined)) {
        // Empty `current`: a container being created is not paused yet, so
        // `paused: true` takes the fresh-pause branch and stamps pausedAt now.
        const resolved = await pausePatchForContainer(auth.serviceClient, auth.userId, {}, {
          paused,
          pausedUntil,
        })
        if ('error' in resolved) return badRequest(resolved.error)
        Object.assign(entity, resolved.patch)
      }

      await config.create(auth.userId, entity as never, auth.serviceClient)
      return NextResponse.json({ [config.payloadKey]: entity }, { status: 201 })
    } catch (err) {
      return errorResponse(err)
    }
  }
}

/** PATCH + DELETE /api/agent/<routines|programs>/:id */
export function makeContainerItemHandlers(kind: ContainerKind) {
  const config = CONTAINER_API[kind]

  const PATCH = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await authenticateAgent(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await verifyContainerOwnership(auth.serviceClient, config.table, id, auth.userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await parseBody(req, config.updateSchema)
    if (body instanceof NextResponse) return body

    const { paused, pausedUntil, ...fields } = body.data as {
      paused?: boolean
      pausedUntil?: string | null
      itemIds?: string[]
      routineIds?: string[]
    }
    const updates: Record<string, unknown> = fields

    try {
      const problem = await validateContainerMembers(
        auth.serviceClient,
        auth.userId,
        fields,
        config,
      )
      if (problem) return badRequest(problem)

      // Whole-set replacement, minus the members the caller could not see —
      // see withTrashedMembersKept.
      if (fields.itemIds) {
        updates.itemIds = await keepTrashedMembers(
          auth.serviceClient,
          auth.userId,
          config.itemJoin,
          id,
          fields.itemIds,
        )
      }
      if (fields.routineIds && config.routineJoin) {
        updates.routineIds = await keepTrashedMembers(
          auth.serviceClient,
          auth.userId,
          config.routineJoin,
          id,
          fields.routineIds,
        )
      }

      if (config.usesPauseVerb && (paused !== undefined || pausedUntil !== undefined)) {
        const { data } = await auth.serviceClient
          .from(config.table)
          .select('paused_at, paused_until')
          .eq('id', id)
          .eq('user_id', auth.userId)
          .maybeSingle()
        const row = (data ?? {}) as { paused_at?: string | null; paused_until?: string | null }
        const resolved = await pausePatchForContainer(
          auth.serviceClient,
          auth.userId,
          { pausedAt: row.paused_at ?? undefined, pausedUntil: row.paused_until ?? undefined },
          { paused, pausedUntil },
        )
        if ('error' in resolved) return badRequest(resolved.error)
        Object.assign(updates, resolved.patch)
      }

      await config.update(auth.userId, id, updates as never, auth.serviceClient)
      return NextResponse.json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await authenticateAgent(_req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await verifyContainerOwnership(auth.serviceClient, config.table, id, auth.userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      // Soft delete, like every other agent DELETE — membership rows survive so
      // a restore inside the 30-day window brings the collection back intact,
      // and the resolver ignores trashed containers meanwhile, so whatever this
      // was hiding becomes visible again immediately.
      await config.remove(auth.userId, id, auth.serviceClient)
      return NextResponse.json({ success: true })
    } catch (err) {
      return errorResponse(err)
    }
  }

  return { PATCH, DELETE }
}
