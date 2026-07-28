import { makeAgentCreateHandler } from '@/lib/agent-api'

/**
 * POST /api/agent/tasks
 *
 * Creates a new task for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: validated against TaskCreateSchema (@anchor-app/types) — title
 * required, everything else optional with server-side defaults. Invalid
 * bodies return 400 with field-level details.
 *
 * Response: { task } with 201 status
 */
export const POST = makeAgentCreateHandler('task')
