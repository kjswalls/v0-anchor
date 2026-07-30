import { Type } from '@sinclair/typebox'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import type { PluginConfig } from './plugin-types.js'
import { fetchContext, shouldRefreshCache, shouldSkipInjection, markCacheDirty, markContextInjected, getLastInjectedAt } from './cache.js'
import { buildFullContext } from './context.js'

/** AgentTool requires `details` on every result; we have no structured payload
 *  to report, so it is always an empty object. */
function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

function errorResult(status: number, text: string) {
  return textResult(`Error ${status}: ${text}`)
}

export function registerTools(api: OpenClawPluginApi, cfg: PluginConfig): void {
  // ── anchor_get_context ────────────────────────────────────────────────────
  api.registerTool((ctx: { sessionId?: string }) => ({
    name: 'anchor_get_context',
    label: 'Anchor: Get Context',
    description: 'Retrieve current tasks, habits, and projects from Anchor. Call this before responding to any task or habit management request, when the user asks about their schedule or what they need to do today, or when you need fresh context after making changes. Returns a short acknowledgement if context is already fresh in this session.',
    parameters: Type.Object({}),
    async execute(_toolCallId: string) {
      const ttlMs = cfg.cacheTtlMs ?? 5 * 60 * 1000
      const conversationId = ctx.sessionId ?? 'default'
      if (shouldSkipInjection(ttlMs, conversationId)) {
        const ago = Math.round((Date.now() - getLastInjectedAt(conversationId)!) / 1000)
        return textResult(`Context unchanged (injected ${ago}s ago) — use what is already in your context window.`)
      }
      if (shouldRefreshCache(ttlMs)) {
        try { await fetchContext(cfg) } catch (err) {
          return errorResult(500, (err as Error).message)
        }
      }
      const context = buildFullContext()
      markContextInjected(conversationId)
      return textResult(context || 'No context available.')
    },
  }))

  // ── anchor_create_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_create_task',
    label: 'Anchor: Create Task',
    description: 'Create a new task in Anchor.',
    parameters: Type.Object({
      title: Type.String({ description: 'Task title' }),
      startDate: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
      startTime: Type.Optional(Type.String({ description: 'HH:MM' })),
      timeBucket: Type.Optional(Type.String({ description: 'anytime | morning | afternoon | evening' })),
      priority: Type.Optional(Type.String({ description: 'low | medium | high' })),
      project: Type.Optional(Type.String({ description: 'Project name' })),
    }),
    async execute(_toolCallId: string, params: {
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
      return textResult(`Task created: ${text}`)
    },
  })

  // ── anchor_update_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_update_task',
    label: 'Anchor: Update Task',
    description: 'Update an existing task in Anchor. For one-off tasks, set status to complete them. For recurring tasks, use completedDates instead of status to record per-date completions.',
    parameters: Type.Object({
      id: Type.String({ description: 'Task UUID' }),
      title: Type.Optional(Type.String()),
      status: Type.Optional(Type.String({ description: 'pending | completed | cancelled (one-off tasks only; not for recurring tasks)' })),
      startDate: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
      startTime: Type.Optional(Type.String({ description: 'HH:MM' })),
      priority: Type.Optional(Type.String({ description: 'low | medium | high' })),
      project: Type.Optional(Type.String({ description: 'Project name' })),
      completedDates: Type.Optional(Type.Array(Type.String(), { description: '(recurring tasks only) full set of ISO date strings YYYY-MM-DD in user\'s timezone representing all completion dates' })),
    }),
    async execute(_toolCallId: string, params: {
      id: string
      title?: string
      status?: string
      startDate?: string
      startTime?: string
      priority?: string
      project?: string
      completedDates?: string[]
    }) {
      const { id, ...fields } = params
      const body: Record<string, unknown> = {}
      if (fields.title !== undefined) body.title = fields.title
      if (fields.status !== undefined) body.status = fields.status
      if (fields.startDate !== undefined) body.startDate = fields.startDate
      if (fields.startTime !== undefined) body.startTime = fields.startTime
      if (fields.priority !== undefined) body.priority = fields.priority
      if (fields.project !== undefined) body.project = fields.project
      if (fields.completedDates !== undefined) body.completedDates = fields.completedDates

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
      return textResult(`Task updated: ${text}`)
    },
  })

  // ── anchor_delete_task ────────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_delete_task',
    label: 'Anchor: Delete Task',
    description: 'Soft-delete a task in Anchor (recoverable from trash for 30 days).',
    parameters: Type.Object({
      id: Type.String({ description: 'Task UUID' }),
    }),
    async execute(_toolCallId: string, params: { id: string }) {
      const res = await fetch(`${cfg.anchorUrl}/api/agent/tasks/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return textResult(`Task deleted.`)
    },
  })

  // ── anchor_create_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_create_habit',
    label: 'Anchor: Create Habit',
    description: 'Create a new habit in Anchor.',
    parameters: Type.Object({
      title: Type.String({ description: 'Habit title' }),
      repeatFrequency: Type.Optional(Type.String({ description: 'daily | weekly | weekdays | weekends | monthly | custom' })),
      repeatDays: Type.Optional(Type.Array(Type.Number(), { description: 'Days of week (0=Sun … 6=Sat)' })),
    }),
    async execute(_toolCallId: string, params: {
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
      return textResult(`Habit created: ${text}`)
    },
  })

  // ── anchor_update_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_update_habit',
    label: 'Anchor: Update Habit',
    description: 'Update an existing habit in Anchor.',
    parameters: Type.Object({
      id: Type.String({ description: 'Habit UUID' }),
      title: Type.Optional(Type.String()),
      repeatFrequency: Type.Optional(Type.String({ description: "none | daily | weekly | weekdays | weekends | monthly | custom" })),
      repeatDays: Type.Optional(Type.Array(Type.Number(), { description: "Day indices (0=Sun) for custom/weekly recurrence" })),
    }),
    async execute(_toolCallId: string, params: { id: string; title?: string; repeatFrequency?: string; repeatDays?: number[] }) {
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
      return textResult(`Habit updated: ${text}`)
    },
  })

  // ── anchor_delete_habit ───────────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_delete_habit',
    label: 'Anchor: Delete Habit',
    description: 'Soft-delete a habit in Anchor.',
    parameters: Type.Object({
      id: Type.String({ description: 'Habit UUID' }),
    }),
    async execute(_toolCallId: string, params: { id: string }) {
      const res = await fetch(`${cfg.anchorUrl}/api/agent/habits/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return textResult(`Habit deleted.`)
    },
  })
}
