import { NextRequest, NextResponse } from 'next/server'
import {
  makeAgentCreateHandler,
  makeAgentItemHandlers,
  makeContainerCreateHandler,
  makeContainerItemHandlers,
  makeGoalCreateHandler,
  makeGoalItemHandlers,
} from '@/lib/agent-api'
import { GET as getContext } from '@/app/api/agent/context/route'
import { dispatch, isNotification, type ToolResult } from '@/lib/mcp/protocol'
import { TOOL_DESCRIPTORS, toolByName, type ToolPlan } from '@/lib/mcp/tools'

/**
 * POST /api/mcp — Anchor's planner as a remote MCP server.
 *
 * One endpoint, JSON-RPC 2.0 in the body, which is MCP's Streamable HTTP
 * transport minus the optional SSE half (nothing here streams, and a tools-only
 * server has nothing to push). Any MCP-capable runtime — OpenClaw via
 * `mcp.servers.<name>` with `type: "http"`, or Claude, Cursor, ChatGPT — can
 * therefore act on the planner with no per-vendor plugin.
 *
 * Auth is the SAME bearer key the agent API already takes, deliberately: this
 * is a second protocol over one surface, not a second surface. That also means
 * it inherits that key's properties, and they are worth naming — one key per
 * user, plaintext, unscoped, no expiry, full read+write. Acceptable while the
 * only holder is the user's own gateway; it is the thing to fix before handing
 * the key to a third-party runtime, and it is why this route does not widen
 * what a key can reach.
 *
 * Tool calls are executed IN-PROCESS against the same handler factories the
 * /api/agent routes are built from — not by re-implementing their rules and not
 * by Anchor calling itself over HTTP. Every validation, refinement and error
 * string stays in lib/agent-api.ts, so the two protocols can never disagree.
 */

// Built once. These are the exact handlers the /api/agent/* routes export.
const taskItem = makeAgentItemHandlers('task')
const habitItem = makeAgentItemHandlers('habit')
const routineItem = makeContainerItemHandlers('routine')
const programItem = makeContainerItemHandlers('program')
const goalItem = makeGoalItemHandlers()

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

const COLLECTION: Record<string, { create: Handler; item: { PATCH: Handler; DELETE: Handler } }> = {
  tasks: { create: makeAgentCreateHandler('task') as Handler, item: taskItem as never },
  habits: { create: makeAgentCreateHandler('habit') as Handler, item: habitItem as never },
  routines: { create: makeContainerCreateHandler('routine') as Handler, item: routineItem as never },
  programs: { create: makeContainerCreateHandler('program') as Handler, item: programItem as never },
  goals: { create: makeGoalCreateHandler() as Handler, item: goalItem as never },
}

/** Rebuilds a request for the in-process handler, carrying auth through. */
function proxyRequest(original: NextRequest, plan: ToolPlan): NextRequest {
  const url = new URL(plan.path, original.nextUrl.origin)
  const headers = new Headers()
  const auth = original.headers.get('authorization')
  if (auth) headers.set('authorization', auth)
  const timezone = original.headers.get('x-timezone')
  if (timezone) headers.set('x-timezone', timezone)
  if (plan.body !== undefined) headers.set('content-type', 'application/json')

  return new NextRequest(url, {
    method: plan.method,
    headers,
    ...(plan.body !== undefined ? { body: JSON.stringify(plan.body) } : {}),
  })
}

async function runPlan(original: NextRequest, plan: ToolPlan): Promise<Response> {
  const segments = plan.path.replace(/^\/api\/agent\/?/, '').split('/').filter(Boolean)
  const [collection, id] = segments

  if (collection === 'context') return getContext(proxyRequest(original, plan))

  const entry = COLLECTION[collection]
  if (!entry) return NextResponse.json({ error: `Unroutable path: ${plan.path}` }, { status: 400 })

  // An id is one path segment and nothing else. Dispatch reads the RAW path
  // while proxyRequest hands the handler a normalised URL, so a traversal in an
  // id would make those two disagree about what is being addressed — harmless
  // today (handlers read ctx.params, not the URL) and exactly the kind of
  // disagreement that stops being harmless later.
  if (id !== undefined && (id.includes('/') || id.includes('..') || id.includes('%'))) {
    return NextResponse.json({ error: 'id must be a single path segment' }, { status: 400 })
  }
  if (segments.length > 2) {
    return NextResponse.json({ error: `Unroutable path: ${plan.path}` }, { status: 400 })
  }

  const req = proxyRequest(original, plan)
  if (!id) {
    if (plan.method !== 'POST') {
      return NextResponse.json({ error: `${plan.method} needs an id` }, { status: 400 })
    }
    return entry.create(req, { params: Promise.resolve({ id: '' }) })
  }

  const ctx = { params: Promise.resolve({ id }) }
  if (plan.method === 'PATCH') return entry.item.PATCH(req, ctx)
  if (plan.method === 'DELETE') return entry.item.DELETE(req, ctx)
  return NextResponse.json({ error: `Unsupported method ${plan.method}` }, { status: 400 })
}

/** Response body → the text a model reads back. */
async function toToolResult(res: Response): Promise<ToolResult> {
  const text = await res.text()
  if (res.ok) {
    return { content: [{ type: 'text', text: text || '{"success":true}' }] }
  }
  // Failures come back as tool errors, not protocol errors: agent-api writes
  // its 400s for a model to read (field-level details, and long instructional
  // strings on the goal-role predicates), and a JSON-RPC error would deny the
  // model the chance to correct itself.
  return {
    content: [{ type: 'text', text: `Anchor returned ${res.status}: ${text}` }],
    isError: true,
  }
}

export async function POST(req: NextRequest) {
  // Auth is checked by the agent handlers themselves on every tool call. It is
  // ALSO checked here so that a client with no key fails at initialize, rather
  // than completing a handshake and discovering every tool 401s.
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Missing bearer token' } },
      { status: 401 }
    )
  }

  let message: unknown
  try {
    message = await req.json()
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    )
  }

  // A batch is a JSON array. Notifications inside it produce no response, and a
  // batch of only notifications produces no body at all.
  const batch = Array.isArray(message)
  const messages: unknown[] = batch ? (message as unknown[]) : [message]

  const responses: unknown[] = []
  for (const one of messages) {
    const response = await dispatch(one, {
      tools: TOOL_DESCRIPTORS,
      serverInfo: { name: 'anchor', version: '1' },
      callTool: async (name, args) => {
        const tool = toolByName(name)
        if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
        const plan = tool.plan(args)
        if ('error' in plan) {
          return { content: [{ type: 'text', text: plan.error }], isError: true }
        }
        return toToolResult(await runPlan(req, plan))
      },
    })
    if (response) responses.push(response)
  }

  if (responses.length === 0) {
    // Every message was a notification. The spec wants an empty 202, not null.
    return new NextResponse(null, { status: 202 })
  }
  return NextResponse.json(batch ? responses : responses[0])
}

/** Some clients probe with GET before opening a session; say what this is. */
export async function GET() {
  return NextResponse.json({
    name: 'anchor',
    transport: 'streamable-http',
    methods: ['initialize', 'tools/list', 'tools/call', 'ping'],
    hint: 'POST JSON-RPC 2.0 here with an Authorization: Bearer <anchor api key> header.',
  })
}

export { isNotification }
