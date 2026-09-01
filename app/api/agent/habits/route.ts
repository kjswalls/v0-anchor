import { makeAgentCreateHandler } from '@/lib/agent-api'

/**
 * POST /api/agent/habits
 *
 * Creates a new habit for the authenticated user.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: validated against HabitCreateSchema (@dsul/types) — title
 * required, everything else optional with server-side defaults (status
 * 'pending', repeatFrequency read back as 'daily'). Legacy 'weekly'
 * frequency is normalized to 'custom'. Invalid bodies return 400.
 *
 * Response: { habit } with 201 status
 */
export const POST = makeAgentCreateHandler('habit')
