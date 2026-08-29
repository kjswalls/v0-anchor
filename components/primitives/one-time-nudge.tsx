'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useOneTimeNudge } from '@/hooks/use-one-time-nudge';
import { nudgeDef } from '@/lib/nudges/registry';

/**
 * Renders one one-time nudge as a persistent sonner toast — shown the first time
 * it goes `active` for this account, gone forever once the user closes it or
 * follows its CTA. Renders nothing itself (returns null).
 *
 * `enabled` is a caller precondition ON TOP of "not yet dismissed": the streak
 * nudge only makes sense while streaks are actually on. While it is false the
 * toast never fires and nothing is recorded, so the nudge is still waiting the
 * day the precondition becomes true.
 *
 * Reusable: add a NudgeDef to lib/nudges/registry.ts and mount one of these on a
 * durable surface (the app shell). The toast is keyed by the nudge id, so a
 * double-invoked effect (React StrictMode in dev) updates the one toast rather
 * than stacking a duplicate.
 */
export function OneTimeNudge({ id, enabled = true }: { id: string; enabled?: boolean }) {
  const router = useRouter();
  const { active, dismiss } = useOneTimeNudge(id);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !active || firedRef.current) return;
    const def = nudgeDef(id);
    if (!def) return;
    firedRef.current = true;

    toast(def.title, {
      id: def.id,
      description: def.body,
      duration: Infinity,
      action: def.settingsFocusId
        ? {
            label: def.ctaLabel ?? 'Open settings',
            onClick: () => {
              router.push(`/settings?focus=${encodeURIComponent(def.settingsFocusId!)}`);
              dismiss();
            },
          }
        : undefined,
      // Fires on the close button / swipe. Following the CTA already calls
      // dismiss(); calling it twice is a no-op, so either exit records the nudge.
      onDismiss: () => dismiss(),
    });
  }, [enabled, active, id, dismiss, router]);

  return null;
}
