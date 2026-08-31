import { makeProjectCreateHandler } from '@/lib/agent-api'

/**
 * POST /api/agent/projects
 *
 * Creates a project — the CLASSIFY container every item files into. Membership
 * is NOT an array here: an item names its project, so the flow is create the
 * project, then set each item's `project` to this name. A body carrying
 * `itemIds` is refused with that pointer rather than silently stripped.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: validated against ProjectCreateSchema (@anchor-app/types). `name` and
 * `emoji` are required; the block fields (repeat*, timeBucket, startTime,
 * duration) are optional and put the project on the schedule grid. A duplicate
 * name answers 409, naming the trash as a possible holder.
 *
 * Reads live on GET /api/agent/context (projects[]).
 *
 * Response: { project } with 201 status
 */
export const POST = makeProjectCreateHandler()
