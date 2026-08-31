import { makeProjectItemHandlers } from '@/lib/agent-api'

/**
 * PATCH + DELETE /api/agent/projects/:id
 *
 * Auth: Bearer <openclaw_api_key> only. Ownership is verified before both;
 * the service role bypasses RLS, so it is checked here or nowhere.
 *
 * PATCH validates against ProjectUpdateSchema and fans a rename out to every
 * member item's `project` column (migration 027) — the container keeps its id,
 * so members follow the rename rather than being stranded on the old string.
 * A duplicate name answers 409.
 *
 * DELETE is a soft delete, recoverable from trash for 30 days.
 *
 * Response: { success: true }
 */
export const { PATCH, DELETE } = makeProjectItemHandlers()
