import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses RLS.
 * ONLY use server-side (API routes, never in client components).
 * Required for:
 *   - Looking up a user by their openclaw_api_key (key is not in session)
 *   - Writing to user_settings on behalf of a user resolved via API key
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY env vars')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

/**
 * Resolve a userId from an OpenClaw API key.
 * Returns null if the key doesn't exist.
 */
export async function resolveUserIdFromApiKey(apiKey: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('user_settings')
    .select('user_id')
    .eq('openclaw_api_key', apiKey)
    .single()

  return data?.user_id ?? null
}
