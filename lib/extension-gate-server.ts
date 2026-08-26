import { resolveEnabled } from './extension-registry'
import { isMissingTable } from './reminders/extension-state'

/**
 * extension-gate-server.ts — the same question as lib/extension-gate.ts, asked
 * from a route handler.
 *
 * Two modules rather than one because the client gate carries `'use client'`
 * and reads a Zustand store; neither can appear in a server bundle. What they
 * share, and must keep sharing, is `resolveEnabled` — the sparse-row fallback.
 * A route that read `enabled` straight off the row would answer "off" for every
 * user who has never touched the switch, which for a default-ON extension is
 * every existing user of the feature.
 *
 * ── Why a route gates at all ───────────────────────────────────────────────
 *
 * Because otherwise "off" is a UI decision, and a UI decision is not inertness.
 * The client gates are the ones a user experiences — the palette row that is not
 * offered, the `?` that is not claimed — and they are where the work belongs.
 * This is the line that makes the claim true rather than merely tidy: with the
 * extension off, there is no sequence of clicks, no stale tab and no replayed
 * request that files an issue under this account's name.
 */

/**
 * The minimum of a Supabase client this needs, typed one level deep.
 *
 * `from` returns `unknown` on purpose. Spelling the whole
 * select→eq→eq→maybeSingle chain here as an interface makes TypeScript check a
 * server client's real PostgrestQueryBuilder generics against it structurally,
 * and that check is deep enough to trip TS2589 ("type instantiation is
 * excessively deep") at the call site — a compile error in the ROUTE, caused by
 * a convenience type in this file. One shallow property is all the assignability
 * a caller has to prove; the chain is asserted once, below, where a mismatch
 * would surface as a test failure rather than a type error somewhere else.
 */
interface SupabaseLike {
  from: (table: string) => unknown
}

type ExtensionRowQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { enabled?: boolean } | null
          error: { code?: string; message?: string } | null
        }>
      }
    }
  }
}

/**
 * Is `slug` on for `userId`?
 *
 * Falls back to the manifest default on a missing table (migration 026 has not
 * run) and on a transient read failure, which is the SAME direction the client
 * falls in its hydration window. Failing closed would be the wrong kind of
 * strict: it would turn a database blip into "the feedback form is broken", and
 * a user cannot tell that apart from a switch they never touched. The extensions
 * that must never act on a default are the ones whose default is already off.
 */
export async function serverExtensionOn(
  client: SupabaseLike,
  userId: string,
  slug: string,
): Promise<boolean> {
  const { data, error } = await (client.from('user_extensions') as ExtensionRowQuery)
    .select('enabled')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    if (!isMissingTable(error)) {
      console.warn(`[extensions] ${slug} unreadable for ${userId}, using the default:`, error.message)
    }
    return resolveEnabled({}, slug)
  }

  // No row is not "off" — it is "never touched", which is what the manifest
  // default answers. Only a row with an explicit boolean overrides it.
  return resolveEnabled(
    typeof data?.enabled === 'boolean' ? { [slug]: data.enabled } : {},
    slug,
  )
}
