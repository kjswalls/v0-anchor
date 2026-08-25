import { createClient } from './supabase'

export async function saveUserProfile(userId: string, profileMd: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, profile_md: profileMd }, { onConflict: 'user_id' })
  if (error) throw new Error(`saveUserProfile failed: ${error.message} (code: ${error.code})`)
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle()

  // A failed READ is not the same answer as "you have not onboarded". This
  // used to swallow the error and fall through to `?? false`, so any transient
  // failure — a rate-limited project, a dropped connection, an expired token
  // mid-refresh — threw the welcome tour over an established user's app. The
  // tour is `fixed inset-0` with a backdrop, so it does not just look wrong; it
  // takes the whole surface until dismissed.
  //
  // When we could not find out, assume onboarded: the cost of not showing the
  // tour to someone who needs it is one missed introduction, and the cost of
  // showing it to someone who does not is blocking the app they came to use.
  if (error) return true

  // maybeSingle, not single: single() ERRORS on zero rows (PGRST116), which
  // made a genuinely new user indistinguishable from a broken read. With
  // maybeSingle a missing row is `data: null, error: null` — the one case that
  // really does mean "show the tour".
  return data?.onboarding_completed ?? false
}

export async function setOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, onboarding_completed: true }, { onConflict: 'user_id' })
}

export async function resetOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, onboarding_completed: false }, { onConflict: 'user_id' })
}
