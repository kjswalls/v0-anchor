'use client';

import { useState, useEffect } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ActionFeed() {
  const { actionLog, historyIndex, undo, redo, canUndo, canRedo } = usePlannerStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [undoFlash, setUndoFlash] = useState(false);
  const [redoFlash, setRedoFlash] = useState(false);

  // Listen for undo/redo keyboard events to flash the buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        if (e.shiftKey) {
          setRedoFlash(true);
          setTimeout(() => setRedoFlash(false), 200);
        } else {
          setUndoFlash(true);
          setTimeout(() => setUndoFlash(false), 200);
        }
      }
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        setRedoFlash(true);
        setTimeout(() => setRedoFlash(false), 200);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Show most recent actions (reversed, newest first)
  const displayActions = actionLog.slice(0, isExpanded ? 10 : 1);
  
  // Calculate which action is "current" (the one we'd undo to)
  const currentActionIndex = actionLog.length > 0 ? actionLog.length - historyIndex - 1 : -1;

  return (
    <div 
      className="relative flex items-center gap-1"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Undo button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={undo}
        disabled={!canUndo}
        className={cn(
          'h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all',
          undoFlash && 'text-primary bg-primary/10'
        )}
        title="Undo"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>

      {/* Redo button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={redo}
        disabled={!canRedo}
        className={cn(
          'h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all',
          redoFlash && 'text-primary bg-primary/10'
        )}
        title="Redo"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      {/* Action preview - compact inline text */}
      {actionLog.length > 0 && (
        <div className={cn(
          'text-[10px] font-mono text-muted-foreground/50 max-w-[120px] truncate ml-1 transition-opacity',
          isExpanded && 'opacity-0'
        )}>
          {displayActions[0]?.label || ''}
        </div>
      )}

      {/* Expanded dropdown - appears below */}
      {isExpanded && actionLog.length > 0 && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[240px]">
          <div className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">
            History
          </div>
          <div className="space-y-0.5 max-h-60 overflow-y-auto">
            {displayActions.map((action, idx) => {
              const isCurrentPosition = idx === currentActionIndex;
              const isUndone = idx < currentActionIndex;
              
              return (
                <div
                  key={action.id}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-mono leading-tight truncate rounded transition-colors',
                    isCurrentPosition && 'text-foreground bg-secondary/50',
                    !isCurrentPosition && !isUndone && 'text-muted-foreground/60',
                    isUndone && 'text-muted-foreground/30 line-through'
                  )}
                  title={action.label}
                >
                  <span className="opacity-40 mr-1">
                    {isCurrentPosition ? '>' : ' '}
                  </span>
                  {action.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
