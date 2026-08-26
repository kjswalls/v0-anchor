import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { MAX_QUESTION_OPTIONS, recordAgentQuestion } from '@/lib/db'

/**
 * POST /api/agent/items/:id/ask — the agent asks the user something answerable
 * in one tap.
 *
 * `anchor_report_progress` with status `blocked` already lets a worker ask a
 * question; what it cannot do is offer ANSWERS. Most of the questions that
 * actually block delegated work are choices, not essays — which Dana, which of
 * the two invoices, is Thursday still fine — and making the user retype a name
 * into a box is the difference between a loop that closes in a second and one
 * that waits until they have the energy to compose a sentence.
 *
 * Does both halves in ONE call. The question and the block are the same event:
 * a question recorded without the status flip is invisible (nothing renders a
 * reply box unless `aiStatus` is `blocked`), and a flip without the question is
 * the old text-box behaviour. Splitting them across two tool calls would make
 * the half-done state reachable whenever a run dies in between.
 *
 * Its own route rather than a field on the task PATCH, for the reason the
 * sibling events route gives: `/api/agent/context` is `safeParse`d whole by the
 * OpenClaw plugin, which THROWS on drift, and every `taskShape` field spreads
 * into that frozen projection. Options ride in `item_events.payload`, which is
 * `jsonb` and was designed to absorb exactly this.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const serviceClient = createServiceClient()
    const userId = await resolveUserIdFromApiKey(authHeader.slice(7), serviceClient)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    let body: { question?: unknown; options?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const question = typeof body.question === 'string' ? body.question.trim() : ''
    if (!question) {
      return NextResponse.json(
        { error: 'question is required — it is what the user reads' },
        { status: 400 }
      )
    }

    // Dropped rather than rejected: the question is the useful part, and a
    // malformed options array should cost the buttons, not the whole ask. The
    // user still gets the text box, which is where they were before this route
    // existed.
    const options = Array.isArray(body.options)
      ? body.options
          .filter((o): o is string => typeof o === 'string')
          .map((o) => o.trim())
          .filter((o) => o.length > 0 && o.length <= 120)
          .slice(0, MAX_QUESTION_OPTIONS)
      : []

    // The service client bypasses RLS, so ownership is the only thing standing
    // between this and writing into another account's item. Id-only lookup for
    // the same reason the sibling events route does it this way: the shared
    // `verifyItemOwnership` filters on `.eq('type', …)`, and a caller here has
    // an id with no reason to know whether it names a task or a custom type.
    const { data: owner } = await serviceClient
      .from('items')
      .select('user_id, type')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!owner || owner.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Status first. If this fails the user sees nothing at all, which is the
    // honest outcome — a question recorded against an item that is not
    // `blocked` renders nowhere and would sit in the trail unanswered forever.
    const { error } = await serviceClient
      .from('items')
      .update({ ai_status: 'blocked', ai_result: question })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) {
      return NextResponse.json({ error: 'Could not update the item' }, { status: 500 })
    }

    recordAgentQuestion(id, owner.type as string, question, options, userId, serviceClient)

    return NextResponse.json({ itemId: id, question, options })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
