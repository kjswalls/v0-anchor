import { makeContainerItemHandlers } from '@/lib/agent-api'

/**
 * PATCH  /api/agent/programs/:id — update (ProgramUpdateSchema). `state` is the
 *                                  on/off verb: 'active'/'paused' override the
 *                                  date range, 'auto' follows it again.
 *                                  `itemIds`/`routineIds` are whole replacement
 *                                  sets, not deltas.
 * DELETE /api/agent/programs/:id — soft-delete (30-day trash). Members are
 *                                  released immediately; membership survives
 *                                  for a restore.
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership verified before both;
 * wrong owner / trashed ids return 404.
 */
const handlers = makeContainerItemHandlers('program')
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
