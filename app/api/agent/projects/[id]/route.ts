import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, resolveUserIdFromApiKey } from '@/lib/supabase-service'
import { updateProject, deleteProject } from '@/lib/db'
import type { Project } from '@/lib/planner-types'

/**
 * PATCH /api/agent/projects/:id
 *
 * Updates an existing project. Ownership is verified before applying changes.
 *
 * Auth: Bearer <openclaw_api_key> only — no cookie auth.
 *
 * Body: Partial<Project> — any subset of project fields to update
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
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const updates: Partial<Project> = await req.json()
    await updateProject(userId, id, updates, serviceClient)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/agent/projects/:id
 *
 * Soft-deletes a project (recoverable from trash within 30 days).
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
    .from('projects')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await deleteProject(userId, id, serviceClient)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
