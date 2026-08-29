import { createClient } from '@/lib/supabase';

/**
 * The per-user set of one-time nudges already dismissed — or `null` when it
 * cannot be read, which is the load-bearing distinction.
 *
 * `null` means "couldn't find out": a transient failure, or a database that has
 * not run migration 040 yet (the `dismissed_nudges` column is missing, so the
 * select errors). The store leaves itself UNHYDRATED on null, which keeps every
 * nudge inert — a nudge that cannot prove it hasn't already been dismissed must
 * not fire. Same posture as isOnboardingComplete: when in doubt, don't intrude.
 *
 * An empty array is the other answer: the row exists (or the user is brand new)
 * and nothing has been dismissed — nudges are free to fire.
 */
export async function loadDismissedNudges(userId: string): Promise<string[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('dismissed_nudges')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[nudges] loadDismissedNudges failed — nudges stay inert:', error.message);
    return null;
  }

  const raw = (data as { dismissed_nudges?: unknown } | null)?.dismissed_nudges;
  // Defensive: the column is jsonb, so a hand-edited row could hold anything.
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Persist the whole set. The column is a jsonb array and the upsert REPLACES it,
 * so the caller passes the full next set (the store appends before calling),
 * never a delta.
 */
export async function saveDismissedNudges(userId: string, ids: string[]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, dismissed_nudges: ids }, { onConflict: 'user_id' });
  if (error) console.error('[nudges] saveDismissedNudges failed:', error.message);
}

/**
 * Clear every dismissal, re-arming all nudges for this user. QA/testing only —
 * the mirror of resetOnboardingComplete. Not wired to any user-facing control
 * yet; call it from the console or a settings action when one exists.
 */
export async function resetDismissedNudges(userId: string): Promise<void> {
  await saveDismissedNudges(userId, []);
}
