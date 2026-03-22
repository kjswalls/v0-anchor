'use client';

import { useState, useEffect } from 'react';
import { usePlannerStore, type ActionLogEntry } from '@/lib/planner-store';
import { useKeyboardShortcutsStore } from '@/lib/keyboard-shortcuts-store';
import { cn } from '@/lib/utils';

// Format keyboard shortcut keys for display
function formatShortcutKeys(keys: string[]): string[] {
  return keys.map((key) => {
    const lower = key.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') return 'Ctrl';
    if (lower === 'shift') return 'Shift';
    if (lower === 'alt') return 'Alt';
    if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'Cmd';
    if (lower === 'backspace') return 'Del';
    if (lower === 'arrowup') return 'Up';
    if (lower === 'arrowdown') return 'Down';
    if (lower === 'arrowleft') return 'Left';
    if (lower === 'arrowright') return 'Right';
    return key.length === 1 ? key.toUpperCase() : key;
  });
}

export function ActionFeed() {
  const { actionLog, historyIndex, undo, redo, canUndo, canRedo } = usePlannerStore();
  const { shortcuts } = useKeyboardShortcutsStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [undoFlash, setUndoFlash] = useState(false);
  const [redoFlash, setRedoFlash] = useState(false);

  // Get undo/redo shortcuts
  const undoShortcut = shortcuts.find((s) => s.id === 'undo');
  const redoShortcut = shortcuts.find((s) => s.id === 'redo');

  // Listen for undo/redo keyboard events to flash the indicators
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this matches undo shortcut
      if (undoShortcut) {
        const keys = undoShortcut.keys.map((k) => k.toLowerCase());
        const pressedKeys: string[] = [];
        if (e.ctrlKey || e.metaKey) pressedKeys.push('ctrl');
        if (e.shiftKey) pressedKeys.push('shift');
        if (e.altKey) pressedKeys.push('alt');
        if (e.key.toLowerCase() !== 'control' && e.key.toLowerCase() !== 'shift' && e.key.toLowerCase() !== 'alt' && e.key.toLowerCase() !== 'meta') {
          pressedKeys.push(e.key.toLowerCase());
        }
        
        const isUndo = keys.every((k) => pressedKeys.includes(k)) && pressedKeys.length === keys.length;
        if (isUndo) {
          setUndoFlash(true);
          setTimeout(() => setUndoFlash(false), 200);
        }
      }
      
      // Check if this matches redo shortcut
      if (redoShortcut) {
        const keys = redoShortcut.keys.map((k) => k.toLowerCase());
        const pressedKeys: string[] = [];
        if (e.ctrlKey || e.metaKey) pressedKeys.push('ctrl');
        if (e.shiftKey) pressedKeys.push('shift');
        if (e.altKey) pressedKeys.push('alt');
        if (e.key.toLowerCase() !== 'control' && e.key.toLowerCase() !== 'shift' && e.key.toLowerCase() !== 'alt' && e.key.toLowerCase() !== 'meta') {
          pressedKeys.push(e.key.toLowerCase());
        }
        
        const isRedo = keys.every((k) => pressedKeys.includes(k)) && pressedKeys.length === keys.length;
        if (isRedo) {
          setRedoFlash(true);
          setTimeout(() => setRedoFlash(false), 200);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoShortcut, redoShortcut]);

  // Show most recent actions (reversed, newest first)
  const displayActions = actionLog.slice(0, isExpanded ? 10 : 2);
  
  // Calculate which action is "current" (the one we'd undo to)
  const currentActionIndex = actionLog.length > 0 ? actionLog.length - historyIndex - 1 : -1;

  return (
    <div 
      className="relative flex items-center gap-3"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Keyboard shortcut indicators */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => canUndo && undo()}
          disabled={!canUndo}
          className={cn(
            'flex items-center gap-1 transition-all duration-150',
            canUndo ? 'opacity-40 hover:opacity-80' : 'opacity-20 cursor-not-allowed',
            undoFlash && 'opacity-100'
          )}
        >
          {undoShortcut && formatShortcutKeys(undoShortcut.keys).map((key, i) => (
            <span key={i} className="flex items-center">
              <kbd className={cn(
                'px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border shadow-sm transition-all duration-150',
                'bg-secondary/50 border-border/50 text-muted-foreground',
                undoFlash && 'bg-primary/20 border-primary/40 text-foreground'
              )}>
                {key}
              </kbd>
              {i < undoShortcut.keys.length - 1 && (
                <span className="text-[8px] text-muted-foreground/50 mx-0.5">+</span>
              )}
            </span>
          ))}
        </button>
        
        <span className="text-[10px] text-muted-foreground/40">|</span>
        
        <button
          onClick={() => canRedo && redo()}
          disabled={!canRedo}
          className={cn(
            'flex items-center gap-1 transition-all duration-150',
            canRedo ? 'opacity-40 hover:opacity-80' : 'opacity-20 cursor-not-allowed',
            redoFlash && 'opacity-100'
          )}
        >
          {redoShortcut && formatShortcutKeys(redoShortcut.keys).map((key, i) => (
            <span key={i} className="flex items-center">
              <kbd className={cn(
                'px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border shadow-sm transition-all duration-150',
                'bg-secondary/50 border-border/50 text-muted-foreground',
                redoFlash && 'bg-primary/20 border-primary/40 text-foreground'
              )}>
                {key}
              </kbd>
              {i < redoShortcut.keys.length - 1 && (
                <span className="text-[8px] text-muted-foreground/50 mx-0.5">+</span>
              )}
            </span>
          ))}
        </button>
      </div>

      {/* Expandable action feed - only show if there are actions */}
      {actionLog.length > 0 && (
        <>
          <span className="text-muted-foreground/30">|</span>
          
          {/* Collapsed view - inline recent action */}
          <div className={cn(
            'text-[11px] font-mono text-muted-foreground/60 max-w-[200px] truncate transition-opacity',
            isExpanded && 'opacity-0'
          )}>
            {displayActions[0]?.label || 'No actions'}
          </div>

          {/* Expanded dropdown - appears below */}
          {isExpanded && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[280px]">
              <div className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">
                Action History
              </div>
              <div className="space-y-0.5 max-h-60 overflow-y-auto">
                {displayActions.map((action, idx) => {
                  const isCurrentPosition = idx === currentActionIndex;
                  const isUndone = idx < currentActionIndex;
                  
                  return (
                    <div
                      key={action.id}
                      className={cn(
                        'px-1.5 py-1 text-[11px] font-mono leading-tight truncate rounded transition-colors',
                        isCurrentPosition && 'text-foreground bg-secondary/50',
                        !isCurrentPosition && !isUndone && 'text-muted-foreground/60',
                        isUndone && 'text-muted-foreground/30 line-through'
                      )}
                      title={action.label}
                    >
                      <span className="opacity-40 mr-1.5">
                        {isCurrentPosition ? '>' : ' '}
                      </span>
                      {action.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
