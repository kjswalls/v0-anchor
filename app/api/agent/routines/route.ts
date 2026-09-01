import { makeContainerCreateHandler } from '@/lib/agent-api'

/**
 * POST /api/agent/routines
 *
 * Creates a routine — a small reusable set of items whose pause suppresses all
 * of them at once.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: validated against RoutineCreateSchema (@dsul/types). `name` is
 * required; `itemIds` must reference the caller's own live, collectible items.
 * Pausing is expressed as `paused` / `pausedUntil`, never as raw columns.
 *
 * Reads live on GET /api/agent/context (routines[], schemaVersion 4).
 *
 * Response: { routine } with 201 status
 */
export const POST = makeContainerCreateHandler('routine')
