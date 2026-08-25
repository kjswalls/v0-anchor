import type { McpToolDescriptor } from './protocol'

/**
 * tools.ts — Anchor's planner, as MCP tools.
 *
 * Each tool is PURE planning: it turns arguments into "which agent-API endpoint,
 * which method, which body". Executing that plan is the transport's job. The
 * point of the split is that every semantic Anchor's agent API enforces —
 * whole-set membership replacement, pause-as-a-verb, container-by-name,
 * goal-role eligibility, the demoted-roles response — keeps living in ONE place
 * (lib/agent-api.ts) instead of being re-implemented here. A tool surface that
 * re-derived those rules would drift from them, and the drift would look like
 * the model lying about what it did.
 *
 * Descriptions are written for a model, not a changelog: they say what the tool
 * is FOR and name the trap it would otherwise fall into.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ToolPlan {
  method: HttpMethod
  /** Path under the agent API, e.g. '/api/agent/tasks/abc'. */
  path: string
  body?: Record<string, unknown>
}

export interface McpTool extends McpToolDescriptor {
  plan: (args: Record<string, unknown>) => ToolPlan | { error: string }
}

const str = (description: string) => ({ type: 'string' as const, description })
const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
})

/** Ids come straight from get_context; a made-up one is a 404, not a create. */
const ID = str('The item id, exactly as it appears in get_context.')

const PRIORITY = { type: 'string', enum: ['low', 'medium', 'high'] }
const TIME_BUCKET = { type: 'string', enum: ['anytime', 'morning', 'afternoon', 'evening'] }
const DATE = str('Date as yyyy-MM-dd.')
const TIME = str('Time of day as HH:mm, 24-hour.')

const requireString = (
  args: Record<string, unknown>,
  key: string
): string | { error: string } => {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${key} is required and must be a non-empty string` }
  }
  return value
}

/** Copies only the keys a given endpoint accepts, dropping undefined. */
const pick = (args: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  for (const key of keys) if (args[key] !== undefined) body[key] = args[key]
  return body
}

const TASK_WRITE_KEYS = [
  'title', 'status', 'startDate', 'startTime', 'timeBucket', 'priority', 'project',
  'notes', 'duration', 'parentItemId', 'repeatFrequency', 'repeatDays', 'completedDates',
]

const HABIT_WRITE_KEYS = [
  'title', 'group', 'repeatFrequency', 'repeatDays', 'timeBucket', 'startTime',
  'notes', 'timesPerDay', 'completedDates', 'skippedDates',
]

const COLLECTION_PATHS: Record<string, string> = {
  routine: 'routines',
  program: 'programs',
  goal: 'goals',
}

/**
 * Which keys each collection kind accepts. Sending a key the kind does not take
 * is REFUSED rather than dropped — silently stripping `milestoneIds` off a
 * routine write is how a model concludes it created milestones it did not.
 */
const COLLECTION_KEYS: Record<string, string[]> = {
  routine: ['name', 'icon', 'color', 'itemIds', 'paused', 'pausedUntil'],
  program: ['name', 'icon', 'color', 'itemIds', 'routineIds', 'state', 'startsOn', 'endsOn'],
  goal: ['name', 'icon', 'color', 'why', 'state', 'startsOn', 'targetOn', 'memberIds', 'milestoneIds', 'checkinIds'],
}

const PAUSE_PATHS: Record<string, string> = {
  task: 'tasks',
  habit: 'habits',
  routine: 'routines',
}

function planCollection(
  args: Record<string, unknown>,
  method: 'POST' | 'PATCH'
): ToolPlan | { error: string } {
  const kind = requireString(args, 'kind')
  if (typeof kind !== 'string') return kind
  const segment = COLLECTION_PATHS[kind]
  if (!segment) return { error: `kind must be one of: ${Object.keys(COLLECTION_PATHS).join(', ')}` }

  const allowed = COLLECTION_KEYS[kind]
  const supplied = Object.keys(args).filter((k) => k !== 'kind' && k !== 'id')
  const stray = supplied.filter((k) => !allowed.includes(k))
  if (stray.length > 0) {
    return {
      error: `A ${kind} does not take: ${stray.join(', ')}. It accepts: ${allowed.join(', ')}.`,
    }
  }

  if (method === 'POST') {
    const name = requireString(args, 'name')
    if (typeof name !== 'string') return name
    return { method, path: `/api/agent/${segment}`, body: pick(args, allowed) }
  }

  const id = requireString(args, 'id')
  if (typeof id !== 'string') return id
  return { method, path: `/api/agent/${segment}/${id}`, body: pick(args, allowed) }
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'anchor_get_context',
    description:
      "Read the user's whole planner: today's tasks, habits and streaks, projects, " +
      'routines, programs and goals, plus their timezone. Call this before any write — ' +
      'ids come from here, and answering from memory is how a stale plan gets acted on. ' +
      'Note tasks[] and habits[] omit work that is paused or out of season; items[] does not.',
    inputSchema: obj({}),
    plan: () => ({ method: 'GET', path: '/api/agent/context' }),
  },
  {
    name: 'anchor_create_task',
    description:
      'Create a one-off task. Use the project NAME, not an id. Omit startDate to leave ' +
      'it in the Braindump rather than guessing a day for it.',
    inputSchema: obj(
      {
        title: str('What the task is, in the user\'s own words where possible.'),
        startDate: DATE,
        startTime: TIME,
        timeBucket: TIME_BUCKET,
        priority: PRIORITY,
        project: str('Project NAME, e.g. "Work". Not an id.'),
        notes: str('Longer detail that does not belong in the title.'),
        duration: { type: 'number', description: 'Minutes the task is expected to take.' },
        parentItemId: str('Make this a subtask of that item. Subtasks cannot nest.'),
      },
      ['title']
    ),
    plan: (args) => {
      const title = requireString(args, 'title')
      if (typeof title !== 'string') return title
      return { method: 'POST', path: '/api/agent/tasks', body: pick(args, TASK_WRITE_KEYS) }
    },
  },
  {
    name: 'anchor_update_task',
    description:
      'Change an existing task. Send only the fields you are changing. To complete one, ' +
      "set status to 'completed' — but for a RECURRING task use completedDates instead, " +
      'because status would end the whole series rather than today.',
    inputSchema: obj(
      {
        id: ID,
        title: str('New title.'),
        status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
        startDate: DATE,
        startTime: TIME,
        timeBucket: TIME_BUCKET,
        priority: PRIORITY,
        project: str('Project NAME, e.g. "Work". Not an id.'),
        notes: str('Longer detail.'),
        duration: { type: 'number', description: 'Minutes.' },
        completedDates: {
          type: 'array',
          items: { type: 'string' },
          description: 'For recurring tasks: the yyyy-MM-dd dates completed. Whole-set replacement.',
        },
      },
      ['id']
    ),
    plan: (args) => {
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { method: 'PATCH', path: `/api/agent/tasks/${id}`, body: pick(args, TASK_WRITE_KEYS) }
    },
  },
  {
    name: 'anchor_delete_task',
    description:
      'Delete a task. It goes to trash for 30 days. Deleting a task deletes its subtasks ' +
      'too. Prefer cancelling over deleting when the user simply changed their mind.',
    inputSchema: obj({ id: ID }, ['id']),
    plan: (args) => {
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { method: 'DELETE', path: `/api/agent/tasks/${id}` }
    },
  },
  {
    name: 'anchor_create_habit',
    description:
      'Create a recurring habit. A habit belongs to a group (by NAME) and repeats by ' +
      "definition — there is no 'none' frequency. Use custom with repeatDays for " +
      'specific weekdays (0 = Sunday).',
    inputSchema: obj(
      {
        title: str('What the habit is.'),
        group: str('Group NAME, e.g. "Health". Not an id.'),
        repeatFrequency: {
          type: 'string',
          enum: ['daily', 'weekdays', 'weekends', 'monthly', 'custom'],
        },
        repeatDays: {
          type: 'array',
          items: { type: 'number' },
          description: 'Required when repeatFrequency is custom. 0 = Sunday … 6 = Saturday.',
        },
        timeBucket: TIME_BUCKET,
        startTime: TIME,
        timesPerDay: { type: 'number', description: 'For counted habits, e.g. 3 glasses of water.' },
        notes: str('Longer detail.'),
      },
      ['title']
    ),
    plan: (args) => {
      const title = requireString(args, 'title')
      if (typeof title !== 'string') return title
      return { method: 'POST', path: '/api/agent/habits', body: pick(args, HABIT_WRITE_KEYS) }
    },
  },
  {
    name: 'anchor_update_habit',
    description:
      'Change an existing habit. To mark one done for a day, add that date to ' +
      'completedDates — habits are never completed by status. completedDates and ' +
      'skippedDates are whole-set replacements, so send the full list.',
    inputSchema: obj(
      {
        id: ID,
        title: str('New title.'),
        group: str('Group NAME. Not an id.'),
        repeatFrequency: {
          type: 'string',
          enum: ['daily', 'weekdays', 'weekends', 'monthly', 'custom'],
        },
        repeatDays: { type: 'array', items: { type: 'number' } },
        timeBucket: TIME_BUCKET,
        startTime: TIME,
        timesPerDay: { type: 'number' },
        completedDates: { type: 'array', items: { type: 'string' }, description: 'yyyy-MM-dd dates done.' },
        skippedDates: { type: 'array', items: { type: 'string' }, description: 'yyyy-MM-dd dates deliberately skipped.' },
        notes: str('Longer detail.'),
      },
      ['id']
    ),
    plan: (args) => {
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { method: 'PATCH', path: `/api/agent/habits/${id}`, body: pick(args, HABIT_WRITE_KEYS) }
    },
  },
  {
    name: 'anchor_delete_habit',
    description:
      'Delete a habit and its whole streak history. Goes to trash for 30 days. Almost ' +
      'always the wrong verb: if the user is just stepping away from it, pause it instead ' +
      'so the history survives and it comes back on its own.',
    inputSchema: obj({ id: ID }, ['id']),
    plan: (args) => {
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { method: 'DELETE', path: `/api/agent/habits/${id}` }
    },
  },
  {
    name: 'anchor_pause',
    description:
      'Put something down for a while, or pick it back up. Pausing HIDES the item ' +
      'without ending it and without touching its history — the right verb when a user ' +
      'is away or has set something aside, and much better than deleting. `until` is the ' +
      'date it becomes live again (exclusive), so pass tomorrow for "just today".',
    inputSchema: obj(
      {
        kind: { type: 'string', enum: ['task', 'habit', 'routine'] },
        id: ID,
        paused: { type: 'boolean', description: 'true to pause, false to resume.' },
        until: str('yyyy-MM-dd it becomes live again. Only valid when pausing.'),
      },
      ['kind', 'id', 'paused']
    ),
    plan: (args) => {
      const kind = requireString(args, 'kind')
      if (typeof kind !== 'string') return kind
      const segment = PAUSE_PATHS[kind]
      if (!segment) return { error: `kind must be one of: ${Object.keys(PAUSE_PATHS).join(', ')}` }
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      if (typeof args.paused !== 'boolean') return { error: 'paused must be a boolean' }
      if (args.until !== undefined && args.paused === false) {
        return { error: 'until is only valid when pausing. Resume takes no date.' }
      }
      return {
        method: 'PATCH',
        path: `/api/agent/${segment}/${id}`,
        body: {
          paused: args.paused,
          ...(args.until !== undefined ? { pausedUntil: args.until } : {}),
        },
      }
    },
  },
  {
    name: 'anchor_create_collection',
    description:
      'Create a routine (a set of items that switch on and off together), a program (a ' +
      'dated season holding items and routines), or a goal (something being worked ' +
      'towards, whose members can be milestones or check-ins). Membership arrays are ' +
      'whole sets, not additions.',
    inputSchema: obj(
      {
        kind: { type: 'string', enum: ['routine', 'program', 'goal'] },
        name: str('What to call it.'),
        icon: str('An icon token like "icon:Sparkles".'),
        color: str('A colour token.'),
        itemIds: { type: 'array', items: { type: 'string' }, description: 'Routines and programs only.' },
        routineIds: { type: 'array', items: { type: 'string' }, description: 'Programs only.' },
        state: { type: 'string', description: 'Programs: auto|active|paused. Goals: active|achieved|abandoned.' },
        startsOn: DATE,
        endsOn: { ...DATE, description: 'Programs only. yyyy-MM-dd the season ends.' },
        why: str('Goals only: why this matters to the user, in their words.'),
        targetOn: { ...DATE, description: 'Goals only: the date being aimed at.' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Goals only: supporting work.' },
        milestoneIds: { type: 'array', items: { type: 'string' }, description: 'Goals only: dated one-off items that mark progress.' },
        checkinIds: { type: 'array', items: { type: 'string' }, description: 'Goals only: recurring items that keep it alive.' },
      },
      ['kind', 'name']
    ),
    plan: (args) => planCollection(args, 'POST'),
  },
  {
    name: 'anchor_update_collection',
    description:
      'Change a routine, program or goal. Membership arrays REPLACE the whole set, so ' +
      'read the current members from get_context and send the full list, or you will ' +
      'remove everything you left out.',
    inputSchema: obj(
      {
        kind: { type: 'string', enum: ['routine', 'program', 'goal'] },
        id: ID,
        name: str('New name.'),
        icon: str('An icon token like "icon:Sparkles".'),
        color: str('A colour token.'),
        itemIds: { type: 'array', items: { type: 'string' } },
        routineIds: { type: 'array', items: { type: 'string' } },
        state: { type: 'string' },
        startsOn: DATE,
        endsOn: DATE,
        why: str('Goals only.'),
        targetOn: DATE,
        memberIds: { type: 'array', items: { type: 'string' } },
        milestoneIds: { type: 'array', items: { type: 'string' } },
        checkinIds: { type: 'array', items: { type: 'string' } },
        paused: { type: 'boolean', description: 'Routines only — programs use state.' },
        pausedUntil: DATE,
      },
      ['kind', 'id']
    ),
    plan: (args) => planCollection(args, 'PATCH'),
  },
  {
    name: 'anchor_delete_collection',
    description:
      'Delete a routine, program or goal. Its member items are NOT deleted — they simply ' +
      'stop belonging to it.',
    inputSchema: obj(
      {
        kind: { type: 'string', enum: ['routine', 'program', 'goal'] },
        id: ID,
      },
      ['kind', 'id']
    ),
    plan: (args) => {
      const kind = requireString(args, 'kind')
      if (typeof kind !== 'string') return kind
      const segment = COLLECTION_PATHS[kind]
      if (!segment) return { error: `kind must be one of: ${Object.keys(COLLECTION_PATHS).join(', ')}` }
      const id = requireString(args, 'id')
      if (typeof id !== 'string') return id
      return { method: 'DELETE', path: `/api/agent/${segment}/${id}` }
    },
  },
]

export const toolByName = (name: string): McpTool | undefined =>
  MCP_TOOLS.find((t) => t.name === name)

/** The descriptor half, which is all `tools/list` may expose. */
export const TOOL_DESCRIPTORS: McpToolDescriptor[] = MCP_TOOLS.map(
  ({ name, description, inputSchema }) => ({ name, description, inputSchema })
)
