import type { AnchorCache, PluginConfig } from './types.js'

let cache: AnchorCache | null = null

export function getCache(): AnchorCache | null {
  return cache
}

export function isCacheFresh(ttlMs: number): boolean {
  return !!cache && Date.now() - cache.fetchedAt < ttlMs
}

export async function fetchContext(cfg: PluginConfig): Promise<void> {
  const res = await fetch(`${cfg.anchorUrl}/api/openclaw/context`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  })
  if (!res.ok) throw new Error(`Anchor context fetch failed: ${res.status} ${res.statusText}`)
  const data = await res.json() as {
    userId: string
    tasks: AnchorCache['tasks']
    habits: AnchorCache['habits']
    projects: AnchorCache['projects']
    habitGroups: AnchorCache['habitGroups']
  }
  cache = {
    userId: data.userId,
    tasks: data.tasks ?? [],
    habits: data.habits ?? [],
    projects: data.projects ?? [],
    habitGroups: data.habitGroups ?? [],
    fetchedAt: Date.now(),
  }
}
