import { Type } from '@sinclair/typebox'
import type { PluginConfig } from './plugin-types.js'
import { fetchContext, isCacheFresh, shouldSkipInjection, markCacheDirty, markContextInjected, getLastInjectedAt } from './cache.js'
import { buildFullContext } from './context.js'

function errorResult(status: number, text: string) {
  return { content: [{ type: 'text', text: `Error ${status}: ${text}` }] }
}

export function registerTools(api: any, cfg: PluginConfig): void {
  // ── anchor_get_context ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_get_context',
    description: 'Retrieve current tasks, habits, and projects from Anchor. Call this before responding to any task or habit management request, when the user asks about their schedule or what they need to do today, or when you need fresh context after making changes. Returns a short acknowledgement if context is already fresh in this session.',
    parameters: Type.Object({}),
    async execute() {
      const ttlMs = cfg.cacheTtlMs ?? 5 * 60 * 1000
      if (shouldSkipInjection(ttlMs)) {
        const ago = Math.round((Date.now() - getLastInjectedAt()!) / 1000)
        return { content: [{ type: 'text', text: `Context unchanged (injected ${ago}s ago) — use what is already in your context window.` }] }
      }
      if (!isCacheFresh(ttlMs)) {
        try { await fetchContext(cfg) } catch (err) {
          return errorResult(500, (err as Error).message)
        }
      }
      const context = buildFullContext()
      markContextInjected()
      return { content: [{ type: 'text', text: context || 'No context available.' }] }
    },
  })

  // ── anchor_create_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_create_task',
    description: 'Create a new task in Anchor.',
    parameters: Type.Object({
      title: Type.String({ description: 'Task title' }),
      startDate: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
      startTime: Type.Optional(Type.String({ description: 'HH:MM' })),
      timeBucket: Type.Optional(Type.String({ description: 'morning | afternoon | evening' })),
      priority: Type.Optional(Type.String({ description: 'low | medium | high' })),
      project: Type.Optional(Type.String({ description: 'Project name' })),
    }),
    async execute(params: {
      title: string
      startDate?: string
      startTime?: string
      timeBucket?: string
      priority?: string
      project?: string
    }) {
      const body: Record<string, unknown> = {
        title: params.title,
        status: 'pending',
        isScheduled: !!params.startDate,
        order: 0,
      }
      if (params.startDate) body.startDate = params.startDate
      if (params.startTime) body.startTime = params.startTime
      if (params.timeBucket) body.timeBucket = params.timeBucket
      if (params.priority) body.priority = params.priority
      if (params.project) body.project = params.project

      const res = await fetch(`${cfg.anchorUrl}/api/agent/tasks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Task created: ${text}` }] }
    },
  })

  // ── anchor_update_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_update_task',
    description: 'Update an existing task in Anchor. To complete a task, set status to "completed".',
    parameters: Type.Object({
      id: Type.String({ description: 'Task UUID' }),
      title: Type.Optional(Type.String()),
      status: Type.Optional(Type.String({ description: 'pending | completed | cancelled' })),
      startDate: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
      startTime: Type.Optional(Type.String({ description: 'HH:MM' })),
      priority: Type.Optional(Type.String({ description: 'low | medium | high' })),
      project: Type.Optional(Type.String({ description: 'Project name' })),
    }),
    async execute(params: {
      id: string
      title?: string
      status?: string
      startDate?: string
      startTime?: string
      priority?: string
      project?: string
    }) {
      const { id, ...fields } = params
      const body: Record<string, unknown> = {}
      if (fields.title !== undefined) body.title = fields.title
      if (fields.status !== undefined) body.status = fields.status
      if (fields.startDate !== undefined) body.startDate = fields.startDate
      if (fields.startTime !== undefined) body.startTime = fields.startTime
      if (fields.priority !== undefined) body.priority = fields.priority
      if (fields.project !== undefined) body.project = fields.project

      const res = await fetch(`${cfg.anchorUrl}/api/agent/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Task updated: ${text}` }] }
    },
  })

  // ── anchor_delete_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_delete_task',
    description: 'Soft-delete a task in Anchor (recoverable from trash for 30 days).',
    parameters: Type.Object({
      id: Type.String({ description: 'Task UUID' }),
    }),
    async execute(params: { id: string }) {
      const res = await fetch(`${cfg.anchorUrl}/api/agent/tasks/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Task deleted.` }] }
    },
  })

  // ── anchor_create_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_create_habit',
    description: 'Create a new habit in Anchor.',
    parameters: Type.Object({
      title: Type.String({ description: 'Habit title' }),
      repeatFrequency: Type.Optional(Type.String({ description: 'daily | weekly | weekdays | weekends | monthly | custom' })),
      repeatDays: Type.Optional(Type.Array(Type.Number(), { description: 'Days of week (0=Sun … 6=Sat)' })),
    }),
    async execute(params: {
      title: string
      repeatFrequency?: string
      repeatDays?: number[]
    }) {
      const body: Record<string, unknown> = { title: params.title }
      if (params.repeatFrequency) body.repeatFrequency = params.repeatFrequency
      if (params.repeatDays) body.repeatDays = params.repeatDays

      const res = await fetch(`${cfg.anchorUrl}/api/agent/habits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Habit created: ${text}` }] }
    },
  })

  // ── anchor_update_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_update_habit',
    description: 'Update an existing habit in Anchor.',
    parameters: Type.Object({
      id: Type.String({ description: 'Habit UUID' }),
      title: Type.Optional(Type.String()),
      repeatFrequency: Type.Optional(Type.String({ description: "none | daily | weekly | weekdays | weekends | monthly | custom" })),
      repeatDays: Type.Optional(Type.Array(Type.Number(), { description: "Day indices (0=Sun) for custom/weekly recurrence" })),
    }),
    async execute(params: { id: string; title?: string; repeatFrequency?: string; repeatDays?: number[] }) {
      const body: Record<string, unknown> = {}
      if (params.title !== undefined) body.title = params.title
      if (params.repeatFrequency !== undefined) body.repeatFrequency = params.repeatFrequency
      if (params.repeatDays !== undefined) body.repeatDays = params.repeatDays

      const res = await fetch(`${cfg.anchorUrl}/api/agent/habits/${params.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Habit updated: ${text}` }] }
    },
  })

  // ── anchor_delete_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_delete_habit',
    description: 'Soft-delete a habit in Anchor.',
    parameters: Type.Object({
      id: Type.String({ description: 'Habit UUID' }),
    }),
    async execute(params: { id: string }) {
      const res = await fetch(`${cfg.anchorUrl}/api/agent/habits/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return { content: [{ type: 'text', text: `Habit deleted.` }] }
    },
  })
}
