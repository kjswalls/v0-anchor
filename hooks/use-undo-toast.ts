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
  'Move habit to',
  'Move all tasks',
  'Reset streak:',
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
        duration: 5000,
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
