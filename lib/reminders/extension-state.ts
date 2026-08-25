/**
 * extension-state.ts — one user's extension switches, config and credentials.
 *
 * Extracted from scan.ts when a SECOND caller appeared. The nightly settlement
 * reads this once per user per tick; the live completion path (lib/stakes/
 * live.ts) reads it the moment a habit is ticked. Two copies of this read would
 * be two chances to differ about whether an extension is on — and the one thing
 * both halves of the Beeminder path must agree on is exactly that.
 *
 * Both tables are tolerated missing, on the fetchUserExtensions contract: a
 * database that predates them means "no extensions", which leaves push — the
 * channel that needs neither — working exactly as before.
 */

import type { createServiceClient } from '../supabase-service'

type ServiceClient = ReturnType<typeof createServiceClient>

/** PostgREST/Postgres "that table does not exist" — the migration has not run. */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** Postgres undefined_column / PostgREST's flavour of it — migration not applied. */
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column\b.*\bdoes not exist/i.test(error.message ?? '')
}

export interface ExtensionState {
  extensionEnabled: Record<string, boolean>
  configs: Record<string, Record<string, unknown>>
  secrets: Record<string, Record<string, string>>
}

export async function loadChannelState(
  service: ServiceClient,
  userId: string,
): Promise<ExtensionState> {
  const extensionEnabled: Record<string, boolean> = {}
  const configs: Record<string, Record<string, unknown>> = {}

  const { data: extensions, error: extensionsError } = await service
    .from('user_extensions')
    .select('slug, enabled, config')
    .eq('user_id', userId)

  // A transient failure here is indistinguishable from "no extensions" if it is
  // swallowed — and "no extensions" is a perfectly valid answer that makes the
  // settlement stamp the day having done nothing, forgiving it forever. A
  // MISSING TABLE is different: that genuinely means no extensions (the
  // fetchUserExtensions contract), and must not stop push from working.
  if (extensionsError && !isMissingTable(extensionsError)) {
    throw new Error(`user_extensions unreadable: ${extensionsError.message}`)
  }

  for (const row of (extensions ?? []) as { slug: string; enabled: boolean; config: unknown }[]) {
    extensionEnabled[row.slug] = row.enabled
    if (row.config && typeof row.config === 'object') {
      configs[row.slug] = row.config as Record<string, unknown>
    }
  }

  // Credentials, read with the SERVICE client and never sent anywhere else.
  // user_secrets has its grants revoked from anon and authenticated (migration
  // 012), so this is the only kind of client that can see the column at all —
  // which is the property the whole split exists to buy.
  const secrets: Record<string, Record<string, string>> = {}
  const { data: secretRow, error: secretsError } = await service
    .from('user_secrets')
    .select('reminder_secrets')
    .eq('user_id', userId)
    .maybeSingle()

  // Same rule, and it matters more here: silently reading a Twilio token as
  // absent turns a configured channel into a skipped one, which every caller
  // reports as success.
  if (secretsError && !isMissingTable(secretsError) && !isMissingColumn(secretsError)) {
    throw new Error(`user_secrets unreadable: ${secretsError.message}`)
  }

  const bag = (secretRow as { reminder_secrets?: unknown } | null)?.reminder_secrets
  if (bag && typeof bag === 'object') {
    for (const [slug, values] of Object.entries(bag as Record<string, unknown>)) {
      if (!values || typeof values !== 'object') continue
      const clean: Record<string, string> = {}
      for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
        // Validated on READ rather than trusted, the item_types.config rule: a
        // credential left behind by a channel that no longer exists, or a value
        // of the wrong shape, is ignored instead of reaching a fetch.
        if (typeof value === 'string' && value !== '') clean[key] = value
      }
      secrets[slug] = clean
    }
  }

  return { extensionEnabled, configs, secrets }
}
