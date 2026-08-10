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

  // ── anchor_pause ──────────────────────────────────────────────────────────
  //
  // One tool for the three entities that pause through the same two columns.
  // Programs are deliberately NOT here: they switch through `state`, and the
  // difference matters enough to make the caller say it — see
  // anchor_update_collection.
  api.registerTool({
    name: 'anchor_pause',
    label: 'Anchor: Pause or Resume',
    description:
      'Pause or resume a task, habit, or routine. Pausing HIDES it from the ' +
      'schedule and every list without deleting it, and without touching its ' +
      'streak, completion history, or dates — resuming brings it back exactly ' +
      'as it was. Use this instead of deleting when the user is stepping away ' +
      'from something (travel, illness, a season off) rather than abandoning ' +
      'it. Pausing a routine hides all of its members at once.',
    parameters: Type.Object({
      kind: Type.String({ description: 'task | habit | routine' }),
      id: Type.String({ description: 'UUID of the task, habit, or routine' }),
      paused: Type.Boolean({ description: 'true to pause, false to resume now' }),
      until: Type.Optional(
        Type.String({
          description:
            'YYYY-MM-DD to come back ON (exclusive — live again that morning). ' +
            'Only with paused: true, and it must be later than today. Omit for ' +
            'an open-ended pause.',
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { kind: string; id: string; paused: boolean; until?: string },
    ) {
      const path = PAUSE_PATHS[params.kind]
      if (!path) return errorResult(400, `kind must be task, habit, or routine (got "${params.kind}")`)

      const body: Record<string, unknown> = { paused: params.paused }
      // Sent only when pausing: the API rejects a resume date alongside
      // paused: false, because "resume ON this date" is exactly what it would
      // NOT do.
      if (params.paused && params.until) body.pausedUntil = params.until

      const res = await fetch(`${cfg.anchorUrl}/api/agent/${path}/${params.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      const when = params.until ? ` until ${params.until}` : ''
      return textResult(params.paused ? `Paused${when}.` : 'Resumed.')
    },
  })

  // ── anchor_create_collection ──────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_create_collection',
    label: 'Anchor: Create Routine or Program',
    description:
      'Create a ROUTINE (a small reusable set of items — a morning routine — ' +
      'that can be paused as one) or a PROGRAM (a period of life, like a ' +
      'summer or a term, holding items and/or routines that appear only while ' +
      'it is on). Members must already exist; create the items first and pass ' +
      'their ids. Subtasks cannot be members.',
    parameters: Type.Object({
      kind: Type.String({ description: 'routine | program' }),
      name: Type.String({ description: 'Display name' }),
      itemIds: Type.Optional(Type.Array(Type.String(), { description: 'Member task/habit UUIDs' })),
      routineIds: Type.Optional(
        Type.Array(Type.String(), { description: 'Held routine UUIDs (programs only)' }),
      ),
      state: Type.Optional(
        Type.String({
          description:
            'Programs only. auto (default) follows startsOn/endsOn; active and ' +
            'paused are manual overrides that IGNORE the dates until changed back.',
        }),
      ),
      startsOn: Type.Optional(Type.String({ description: 'Programs only, YYYY-MM-DD, inclusive' })),
      endsOn: Type.Optional(Type.String({ description: 'Programs only, YYYY-MM-DD, inclusive' })),
    }),
    async execute(_toolCallId: string, params: CollectionParams) {
      return writeCollection(cfg, params, 'POST')
    },
  })

  // ── anchor_update_collection ──────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_update_collection',
    label: 'Anchor: Update Routine or Program',
    description:
      'Update a routine or program. Membership arrays REPLACE the whole set ' +
      'rather than adding to it — read the current members from context first ' +
      'and send the full intended list. To switch a program on or off, set ' +
      'state: active or paused; to hand it back to its dates, set state: auto. ' +
      'Prefer state: auto when the user describes a period ("all summer") so ' +
      'it turns itself off on time.',
    parameters: Type.Object({
      kind: Type.String({ description: 'routine | program' }),
      id: Type.String({ description: 'Routine or program UUID' }),
      name: Type.Optional(Type.String()),
      itemIds: Type.Optional(
        Type.Array(Type.String(), { description: 'FULL replacement member list' }),
      ),
      routineIds: Type.Optional(
        Type.Array(Type.String(), { description: 'FULL replacement routine list (programs only)' }),
      ),
      state: Type.Optional(Type.String({ description: 'Programs only: auto | active | paused' })),
      startsOn: Type.Optional(Type.String({ description: 'Programs only, YYYY-MM-DD' })),
      endsOn: Type.Optional(Type.String({ description: 'Programs only, YYYY-MM-DD' })),
    }),
    async execute(_toolCallId: string, params: CollectionParams & { id: string }) {
      return writeCollection(cfg, params, 'PATCH')
    },
  })

  // ── anchor_delete_collection ──────────────────────────────────────────────
  api.registerTool({
    name: 'anchor_delete_collection',
    label: 'Anchor: Delete Routine or Program',
    description:
      'Soft-delete a routine or program (recoverable for 30 days). Its MEMBERS ' +
      'are not deleted — they are released and become visible again ' +
      'immediately. To hide the members instead, pause the collection.',
    parameters: Type.Object({
      kind: Type.String({ description: 'routine | program' }),
      id: Type.String({ description: 'Routine or program UUID' }),
    }),
    async execute(_toolCallId: string, params: { kind: string; id: string }) {
      const path = COLLECTION_PATHS[params.kind]
      if (!path) return errorResult(400, `kind must be routine or program (got "${params.kind}")`)
      const res = await fetch(`${cfg.anchorUrl}/api/agent/${path}/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      })
      const text = await res.text()
      if (!res.ok) return errorResult(res.status, text)
      markCacheDirty()
      return textResult(`Deleted — its members are visible again.`)
    },
  })
}

const PAUSE_PATHS: Record<string, string | undefined> = {
  task: 'tasks',
  habit: 'habits',
  routine: 'routines',
}

const COLLECTION_PATHS: Record<string, string | undefined> = {
  routine: 'routines',
  program: 'programs',
}

interface CollectionParams {
  kind: string
  id?: string
  name?: string
  itemIds?: string[]
  routineIds?: string[]
  state?: string
  startsOn?: string
  endsOn?: string
}

async function writeCollection(
  cfg: PluginConfig,
  params: CollectionParams,
  method: 'POST' | 'PATCH',
) {
  const path = COLLECTION_PATHS[params.kind]
  if (!path) return errorResult(400, `kind must be routine or program (got "${params.kind}")`)

  const { kind, id, ...fields } = params
  // Program-only keys are dropped rather than forwarded for a routine. The API
  // strips unknown keys anyway, but sending them makes the plugin's own log
  // read as though a routine were given a date range it silently lost.
  const body: Record<string, unknown> = { ...fields }
  if (kind === 'routine') {
    delete body.routineIds
    delete body.state
    delete body.startsOn
    delete body.endsOn
  }

  const url =
    method === 'POST'
      ? `${cfg.anchorUrl}/api/agent/${path}`
      : `${cfg.anchorUrl}/api/agent/${path}/${id}`
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) return errorResult(res.status, text)
  markCacheDirty()
  return textResult(`${kind === 'routine' ? 'Routine' : 'Program'} saved: ${text}`)
}
