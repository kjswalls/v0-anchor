import { makeAgentItemHandlers } from '@/lib/agent-api'

/**
 * PATCH  /api/agent/tasks/:id — update (body validated by TaskUpdateSchema;
 *                               null clears nullable fields)
 * DELETE /api/agent/tasks/:id — soft-delete (30-day trash)
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership verified before both;
 * wrong owner / wrong type / trashed ids return 404.
 */
const handlers = makeAgentItemHandlers('task')
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
