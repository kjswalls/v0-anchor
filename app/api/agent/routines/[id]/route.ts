import { makeContainerItemHandlers } from '@/lib/agent-api'

/**
 * PATCH  /api/agent/routines/:id — update (RoutineUpdateSchema). `itemIds` is a
 *                                  WHOLE replacement set, not a delta, so a
 *                                  retried call cannot double-add.
 * DELETE /api/agent/routines/:id — soft-delete (30-day trash). Membership rows
 *                                  survive the delete; whatever the routine was
 *                                  hiding becomes visible again at once.
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership verified before both;
 * wrong owner / trashed ids return 404.
 */
const handlers = makeContainerItemHandlers('routine')
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
