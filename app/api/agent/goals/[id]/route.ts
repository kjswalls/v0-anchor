import { makeGoalItemHandlers } from '@/lib/agent-api'

/**
 * PATCH  /api/agent/goals/:id — update (GoalUpdateSchema). `state` is the
 *                               lifecycle verb: 'achieved' stamps `achievedAt`,
 *                               'active' clears it, a same-state write is a
 *                               no-op. The three role arrays are whole
 *                               replacement sets, not deltas, and each is
 *                               replaced independently.
 * DELETE /api/agent/goals/:id — soft-delete (30-day trash). Membership rows
 *                               survive with their roles, so a restore brings
 *                               the goal back with its progress intact.
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership verified before both;
 * wrong owner / trashed ids return 404.
 */
const handlers = makeGoalItemHandlers()
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
