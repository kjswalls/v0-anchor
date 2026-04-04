import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { updateHabitGroup, deleteHabitGroup } from '@/lib/db'
import type { HabitGroupType } from '@/lib/planner-types'

/**
 * PATCH /api/agent/habit-groups/:id
 *
 * Updates an existing habit group. Ownership is verified before applying changes.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: Partial<HabitGroupType> — any subset of habit group fields to update
 *
 * Response: { success: true }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = await resolveUserIdFromApiKey(authHeader.slice(7))
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const serviceClient = createServiceClient()

  const { data: existing } = await serviceClient
    .from('habit_groups')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Partial<HabitGroupType> = await req.json()
  await updateHabitGroup(userId, id, updates, serviceClient)

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/agent/habit-groups/:id
 *
 * Soft-deletes a habit group (recoverable from trash within 30 days).
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Response: { success: true }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = await resolveUserIdFromApiKey(authHeader.slice(7))
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const serviceClient = createServiceClient()

  const { data: existing } = await serviceClient
    .from('habit_groups')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await deleteHabitGroup(userId, id, serviceClient)

  return NextResponse.json({ success: true })
}
