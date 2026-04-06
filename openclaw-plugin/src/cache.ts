import type { AnchorCache, PluginConfig } from './plugin-types.js'
import { AnchorContextResponseSchema } from '@anchor-app/types'

let cache: AnchorCache | null = null
const lastInjectedAt = new Map<string, number>()  // per-conversation: when full context was last returned to the model
let lastModifiedAt: number | null = null  // when cache was last dirtied by a write/webhook (cache-wide)

export function getCache(): AnchorCache | null {
  return cache
}

export function isCacheFresh(ttlMs: number): boolean {
  return !!cache && Date.now() - cache.fetchedAt < ttlMs
}

export function markCacheDirty(): void {
  lastModifiedAt = Date.now()
}

export function markContextInjected(conversationId: string): void {
  lastInjectedAt.set(conversationId, Date.now())
}

export function shouldSkipInjection(ttlMs: number, conversationId: string): boolean {
  const injectedAt = lastInjectedAt.get(conversationId) ?? null
  return (
    injectedAt !== null &&
    (lastModifiedAt === null || lastModifiedAt <= injectedAt) &&
    (Date.now() - injectedAt) < ttlMs
  )
}

export function getLastInjectedAt(conversationId: string): number | null {
  return lastInjectedAt.get(conversationId) ?? null
}

export function isCacheDirty(): boolean {
  return lastModifiedAt !== null && (cache === null || lastModifiedAt > cache.fetchedAt)
}

export function shouldRefreshCache(ttlMs: number): boolean {
  if (!cache) return true
  if (Date.now() - cache.fetchedAt > ttlMs) return true
  if (lastModifiedAt !== null && lastModifiedAt > cache.fetchedAt) return true
  return false
}

export async function fetchContext(cfg: PluginConfig): Promise<void> {
  const res = await fetch(`${cfg.anchorUrl}/api/agent/context`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  })
  if (!res.ok) throw new Error(`Anchor context fetch failed: ${res.status} ${res.statusText}`)

  const raw = await res.json()
  const parsed = AnchorContextResponseSchema.safeParse(raw)
  if (!parsed.success) {
    // Schema mismatch — Anchor API may have changed. Log details and use what we have.
    console.warn('[anchor-context] API response validation failed. The @anchor-app/types package may need updating.')
    console.warn(parsed.error.flatten())
    throw new Error('Anchor API schema mismatch — see logs for details')
  }

  const data = parsed.data
  cache = {
    userId: data.userId,
    userTimezone: data.userTimezone ?? "UTC",
    tasks: data.tasks,
    habits: data.habits,
    projects: data.projects,
    habitGroups: data.habitGroups,
    fetchedAt: Date.now(),
  }
}

/** Test helper — resets all module-level singletons. */
export function resetCacheState(): void {
  cache = null
  lastInjectedAt.clear()
  lastModifiedAt = null
}
