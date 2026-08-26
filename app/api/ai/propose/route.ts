import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ProposalDraftSchema } from '@anchor-app/types'
import { createClient } from '@/lib/supabase-server'
import {
  extractJsonObject,
  gatewayCompletion,
  getGatewayConfig,
  proposeSessionKey,
} from '@/lib/openclaw-gateway'

/**
 * POST /api/ai/propose — turn a free-form ask into a planner diff.
 *
 * Returns `{ proposal }` (a ProposalDraft: summary + rationale + operations) or
 * `{ proposal: null, message }` when the model has nothing to suggest. The
 * client stamps the id/timestamp and re-validates every operation against the
 * type registry before showing the card, so this route is allowed to be
 * optimistic — a partly-wrong response degrades to a shorter card, never to a
 * bad write.
 *
 * Not streamed: a proposal is worthless until it is complete and validated, so
 * there is nothing to show token by token.
 */

/**
 * Comfortably inside `maxDuration` so the deadline is OURS — a platform-killed
 * function returns no body at all, and the card would have nothing to show.
 */
const GATEWAY_PROPOSE_TIMEOUT_MS = 45_000

export const maxDuration = 60

const SYSTEM_PROMPT = `You are Beacon, the planning assistant inside Anchor — a daily planner for neurodivergent people.

You turn a request into a PROPOSAL: a small set of concrete changes the user accepts with one tap. You never make changes yourself.

Reply with a JSON object and nothing else — no prose before or after it, no markdown fences.

The shape, exactly:
{
  "summary": "short headline, max ~8 words",
  "rationale": "one warm sentence explaining the thinking",
  "operations": [
    { "kind": "update", "itemId": "<id from the list>", "startDate": "yyyy-MM-dd", "timeBucket": "morning|afternoon|evening|anytime", "startTime": "HH:mm", "priority": "low|medium|high", "title": "new title", "status": "<a status this item's type allows>" },
    { "kind": "create", "itemType": "task", "title": "...", "startDate": "yyyy-MM-dd", "timeBucket": "...", "priority": "...", "notes": "..." }
  ]
}

Rules:
- Only include the fields you actually want to change. Omit everything else.
- "itemId" MUST be an id from the provided list, copied exactly.
- Create "task" items unless the user names a different type from the list.
- Never create habits.
- Task statuses are pending, completed or cancelled. Habit statuses are pending, done or skipped. Never mix them.
- Keep it to at most 8 operations. A short plan someone will actually do beats a complete one they won't.
- Tone: warm, specific, never judgmental. Never mention how late anything is.
- If you have nothing useful to propose, return {"summary":"","operations":[]}.`

export async function POST(req: NextRequest) {
  // Authenticated, always. This route can fall back to the deployment's own
  // OPENAI_API_KEY, so leaving it open would let anyone on the internet spend
  // the owner's money by POSTing a prompt at it. The browser always has a
  // session here — the chat surfaces live inside the authenticated shell.
  //
  // The id is kept, not just checked: the gateway branch resolves the user's
  // own gateway from it, and it must come from the session rather than the
  // body — a userId a caller could name is a caller who can spend someone
  // else's gateway.
  let userId: string
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    prompt?: string
    provider?: string
    apiKey?: string
    model?: string
    itemContext?: string
    todayStr?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { prompt, provider, apiKey, model, itemContext, todayStr } = body

  if (provider === 'anthropic') {
    return NextResponse.json(
      { error: 'Claude support is coming soon — use OpenAI for now.' },
      { status: 400 }
    )
  }

  const userTurn = [
    `Today is ${todayStr ?? new Date().toISOString().slice(0, 10)}.`,
    itemContext ?? '',
    '',
    prompt?.trim() || 'Suggest a realistic plan for today.',
  ].join('\n')

  // The agent tier proposes through the user's OWN gateway. Falling through to
  // OpenAI here would quietly send an OpenClaw user's planner to a provider
  // they deliberately did not choose — not a degraded mode, a broken promise
  // about where their data goes. So this branch either works or fails; it never
  // reroutes.
  if (provider === 'openclaw') {
    const config = await getGatewayConfig(userId)
    if (!config) {
      return NextResponse.json(
        { error: 'Connect your OpenClaw gateway in Settings → Beacon to ask it for a plan.' },
        { status: 400 }
      )
    }

    // A gateway is a machine on someone's tailnet, and this call is not
    // streamed — a hung one is a spinner with no output and no end. Without a
    // deadline the failure mode is a platform-level 504 with no body, which
    // reaches the card as a blank error; with one it is a sentence.
    const timeout = AbortSignal.timeout(GATEWAY_PROPOSE_TIMEOUT_MS)

    try {
      const raw = await gatewayCompletion({
        config,
        sessionKey: proposeSessionKey(userId),
        signal: timeout,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userTurn },
        ],
      })

      const parsed = extractJsonObject(raw)
      if (!parsed) {
        return NextResponse.json({ proposal: null, message: 'No suggestion came back.' })
      }

      const result = ProposalDraftSchema.safeParse(parsed)
      if (!result.success || result.data.operations.length === 0) {
        return NextResponse.json({ proposal: null, message: 'Nothing worth changing right now.' })
      }

      return NextResponse.json({ proposal: result.data })
    } catch (err) {
      if (timeout.aborted) {
        return NextResponse.json(
          { error: 'Your gateway did not answer in time. Is it reachable from the internet?' },
          { status: 504 }
        )
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'Add an OpenAI API key in Settings → AI Assistant to ask for a plan.' },
      { status: 400 }
    )
  }

  const openai = new OpenAI({ apiKey: key })

  try {
    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4o-mini',
      // json_object rather than a strict json_schema: the client drops
      // individual bad operations anyway, so tolerance beats brittleness here.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userTurn },
      ],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return NextResponse.json({ proposal: null, message: 'No suggestion came back.' })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ proposal: null, message: 'No suggestion came back.' })
    }

    const result = ProposalDraftSchema.safeParse(parsed)
    if (!result.success || result.data.operations.length === 0) {
      // An empty or malformed draft is a normal outcome ("nothing to suggest"),
      // not an error the user should have to read a stack trace about.
      return NextResponse.json({ proposal: null, message: 'Nothing worth changing right now.' })
    }

    return NextResponse.json({ proposal: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
