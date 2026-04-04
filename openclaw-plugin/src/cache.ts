import type { AnchorCache, PluginConfig } from './plugin-types.js'
import { AnchorContextResponseSchema } from '@anchor-app/types'

let cache: AnchorCache | null = null

export function getCache(): AnchorCache | null {
  return cache
}

export function isCacheFresh(ttlMs: number): boolean {
  return !!cache && Date.now() - cache.fetchedAt < ttlMs
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
