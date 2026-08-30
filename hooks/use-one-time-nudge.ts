'use client';

import { useCallback } from 'react';
import { usePlannerStore } from '@/lib/planner-store';
import { useNudgeStore } from '@/lib/nudge-store';

export interface OneTimeNudgeState {
  /**
   * True only once the dismissed set for THIS account has loaded AND this id
   * isn't in it. False through the whole pre-hydration window, so a consumer
   * that fires on `active` fires at most once, for the right account.
   */
  active: boolean;
  /** Mark this nudge dismissed forever for the current user. Idempotent. */
  dismiss: () => void;
  /**
   * The account `active` speaks for (null when signed out). Exposed so a durably
   * mounted consumer can re-arm its fire-once latch on a bare account switch —
   * the shell mount survives a SIGNED_IN with no reload, so a boolean latch would
   * otherwise stay latched for the next user.
   */
  userId: string | null;
}

/**
 * The reusable one-time-nudge primitive. A consumer asks "should I show nudge X
 * to this user, and how do I mark it seen" without touching the store, the
 * hydration gate, or the persistence.
 *
 * The gate is `hydratedUserId === userId`: the nudge store stamps its owner in
 * the same set() as the values (see lib/nudge-store.ts), so an empty set can
 * never read as "nothing dismissed" before the real one arrives.
 */
export function useOneTimeNudge(id: string): OneTimeNudgeState {
  const userId = usePlannerStore((s) => s.userId);
  const hydratedUserId = useNudgeStore((s) => s.hydratedUserId);
  const dismissed = useNudgeStore((s) => s.dismissed.includes(id));

  const active = !!userId && hydratedUserId === userId && !dismissed;

  const dismiss = useCallback(() => {
    if (userId) useNudgeStore.getState().dismiss(userId, id);
  }, [userId, id]);

  return { active, dismiss, userId: userId ?? null };
}
