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
  const prevActionCountRef = useRef(actionLog.length);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // Only trigger on new actions (not on initial load or undo/redo)
    if (actionLog.length > prevActionCountRef.current && actionLog.length > 0) {
      const latestAction = actionLog[0]; // Most recent is first
      
      // Check if this is a significant action that warrants a toast
      const isSignificant = SIGNIFICANT_ACTIONS.some(prefix => 
        latestAction.label.startsWith(prefix)
      );

      if (isSignificant && canUndo) {
        // Dismiss previous toast if exists
        if (toastIdRef.current) {
          toast.dismiss(toastIdRef.current);
        }

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
    }

    prevActionCountRef.current = actionLog.length;
  }, [actionLog, undo, canUndo]);
}
