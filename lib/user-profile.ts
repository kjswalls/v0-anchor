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
  const { data } = await supabase
    .from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .single()
  return data?.onboarding_completed ?? false
}

export async function setOnboardingComplete(userId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, onboarding_completed: true }, { onConflict: 'user_id' })
}
