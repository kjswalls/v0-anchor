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
  const { actionLog, undo, canUndo } = usePlannerStore();
  const lastActionIdRef = useRef<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // Get the latest action
    if (actionLog.length === 0) return;
    
    const latestAction = actionLog[0]; // Most recent is first
    
    console.log('[v0] useUndoToast - actionLog changed:', {
      length: actionLog.length,
      latestId: latestAction?.id,
      lastSeenId: lastActionIdRef.current,
      label: latestAction?.label,
      canUndo
    });
    
    // Only trigger if this is a new action we haven't seen
    if (latestAction.id === lastActionIdRef.current) {
      console.log('[v0] useUndoToast - Same action, skipping');
      return;
    }
    
    // Update our reference to the latest action
    lastActionIdRef.current = latestAction.id;
    
    // Check if this is a significant action that warrants a toast
    const isSignificant = SIGNIFICANT_ACTIONS.some(prefix => 
      latestAction.label.startsWith(prefix)
    );

    console.log('[v0] useUndoToast - isSignificant:', isSignificant, 'canUndo:', canUndo);

    if (isSignificant && canUndo) {
      // Dismiss previous toast if exists
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }

      console.log('[v0] useUndoToast - Showing toast for:', latestAction.label);

      // Show toast with undo button
      toastIdRef.current = toast(latestAction.label, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            undo();
          },
        },
      });
    }
  }, [actionLog, undo, canUndo]);
}
