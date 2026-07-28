import { makeAgentItemHandlers } from '@/lib/agent-api'

/**
 * PATCH  /api/agent/habits/:id — update (body validated by HabitUpdateSchema;
 *                                null clears nullable fields, NOT-NULL habit
 *                                fields like group/streak reject null)
 * DELETE /api/agent/habits/:id — soft-delete (30-day trash)
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership verified before both;
 * wrong owner / wrong type / trashed ids return 404.
 */
const handlers = makeAgentItemHandlers('habit')
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
