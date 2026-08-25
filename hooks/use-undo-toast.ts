'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePlannerStore } from '@/lib/planner-store';

// Actions that should trigger an undo toast
const SIGNIFICANT_ACTIONS = [
  'Delete task:',
  'Delete habit:',
  'Delete project:',
  'Complete task:',
  'Uncomplete task:',
  'Complete habit:',
  'Skip habit:',
  'Reset habit:',
  'Unschedule task:',
  'Move task to',
  'Schedule task:',
  // The multi-select group drag. It wrote startDate and isScheduled on every
  // selected item and raised nothing — not even an undo affordance.
  'Schedule items:',
  'Move habit to',
  'Move all tasks',
  'Reset streak:',
  'Delete items',
  'Complete items',
  'Uncomplete items',
  // Bulk membership. Collecting into a container that is currently off hides
  // the items on the spot, so this is a move verb in every way that matters and
  // carries the same receipt — it needs the toast to show it.
  'Add to ',
  'Remove from ',
  // A goal role that stopped being true of its item — a milestone made
  // recurring, a check-in made one-shot. The membership yields rather than the
  // edit (goals never constrain their members), which means the user's item
  // edit succeeded and something ELSE quietly changed. That is precisely the
  // shape of change that needs a receipt: without it the milestone silently
  // stops counting and the goal reads behind weeks later, with nothing on
  // screen ever having said so.
  'Role changed:',
  // The paste-a-list path. A single add shows its row right where you typed
  // it and stays quiet; a bulk add lands N rows in one gesture — possibly on
  // a surface you aren't looking at — so it earns the receipt and the one-⌘Z
  // offer.
  'Bulk add:',
];

export function useUndoToast() {
  const actionLog = usePlannerStore((state) => state.actionLog);
  const lastActionIdRef = useRef<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // Get the latest action
    if (actionLog.length === 0) return;
    
    const latestAction = actionLog[0]; // Most recent is first
    
    // Only trigger if this is a new action we haven't seen
    if (latestAction.id === lastActionIdRef.current) {
      return;
    }
    
    // Update our reference to the latest action
    lastActionIdRef.current = latestAction.id;
    
    // Check if this is a significant action that warrants a toast
    const isSignificant = SIGNIFICANT_ACTIONS.some(prefix => 
      latestAction.label.startsWith(prefix)
    );

    if (isSignificant) {
      // Dismiss previous toast if exists
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }

      // Show toast with undo button
      // Get fresh state at click time to ensure canUndo is accurate
      toastIdRef.current = toast(latestAction.label, {
        // Decision 11's receipt, when the store attached one: the move was
        // allowed, but what it moved is not visible where it landed. Absent on
        // every other action, so this reads as an exception rather than chrome.
        description: latestAction.receipt,
        // A receipt has something to read, so it gets longer than the reflexive
        // "oops, undo" window the bare label needs.
        duration: latestAction.receipt ? 8000 : 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            const state = usePlannerStore.getState();
            if (state.canUndo) {
              state.undo();
            }
          },
        },
      });
    }
  }, [actionLog]);
}
