import { makeGoalCreateHandler } from '@/lib/agent-api'

/**
 * POST /api/agent/goals
 *
 * Creates a goal — a long-horizon aspiration holding ordinary items in one of
 * three roles: `memberIds` (work the goal contains), `milestoneIds` (one-shot
 * targets, whose `startDate` is the target date), `checkinIds` (recurring
 * reviews). An item holds exactly one role per goal; naming the same id in two
 * arrays is refused rather than resolved.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: validated against GoalCreateSchema (@anchor-app/types). `name` is
 * required; `state` defaults to 'active'. Goals never suppress, so there is no
 * pause verb — `paused`/`pausedUntil` are refused with a pointer, and
 * `achievedAt` is derived from `state`.
 *
 * Reads live on GET /api/agent/context (goals[], schemaVersion 5).
 *
 * Response: { goal } with 201 status
 */
export const POST = makeGoalCreateHandler()
