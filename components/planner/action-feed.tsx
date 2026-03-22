'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, Redo2 } from 'lucide-react';
import { usePlannerStore } from '@/lib/planner-store';
import { useKeyboardShortcutsStore } from '@/lib/keyboard-shortcuts-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Format shortcut keys for display
const formatShortcutKey = (key: string): string => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const keyMap: Record<string, string> = {
    ctrl: isMac ? '\u2318' : 'Ctrl',
    meta: isMac ? '\u2318' : 'Win',
    alt: isMac ? '\u2325' : 'Alt',
    shift: '\u21E7',
    backspace: '\u232B',
    delete: '\u2326',
    enter: '\u23CE',
    escape: 'Esc',
    arrowup: '\u2191',
    arrowdown: '\u2193',
    arrowleft: '\u2190',
    arrowright: '\u2192',
  };
  const lower = key.toLowerCase();
  return keyMap[lower] || key.toUpperCase();
};

export function ActionFeed() {
  const { actionLog, historyIndex, undo, redo, canUndo, canRedo, chillMode } = usePlannerStore();
  const { shortcuts } = useKeyboardShortcutsStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [undoFlash, setUndoFlash] = useState(false);
  const [redoFlash, setRedoFlash] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const updateDropdownPos = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Get the current undo/redo shortcuts
  const undoShortcut = useMemo(() => 
    shortcuts.find(s => s.id === 'undo')?.keys || ['ctrl', 'z'],
    [shortcuts]
  );
  const redoShortcut = useMemo(() => 
    shortcuts.find(s => s.id === 'redo')?.keys || ['ctrl', 'shift', 'z'],
    [shortcuts]
  );

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
  const displayActions = actionLog.slice(0, 10);
  
  // Calculate which action is "current" (the one we'd undo to)
  const currentActionIndex = actionLog.length > 0 ? actionLog.length - historyIndex - 1 : -1;

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    updateDropdownPos();
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 100);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

      {/* Action preview - compact inline text (hidden in chill mode) */}
      {!chillMode && actionLog.length > 0 && (
        <div className={cn(
          'text-[10px] font-mono text-muted-foreground/50 max-w-[120px] truncate ml-1 transition-opacity',
          isExpanded && 'opacity-0'
        )}>
          {displayActions[0]?.label || ''}
        </div>
      )}

      {/* Expanded dropdown - rendered in portal to escape overflow:hidden parents */}
      {mounted && !chillMode && isExpanded && actionLog.length > 0 && createPortal(
        <div
          className="fixed z-[9999] bg-card border border-border rounded-lg shadow-xl p-2 min-w-[240px]"
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Keyboard shortcut indicators */}
          <div className="flex items-center gap-3 mb-2 px-1 pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Undo</span>
              <div className="flex gap-0.5">
                {undoShortcut.map((key, i) => (
                  <kbd
                    key={i}
                    className="px-1 py-0.5 text-[9px] font-mono bg-secondary text-secondary-foreground rounded border border-border/50"
                  >
                    {formatShortcutKey(key)}
                  </kbd>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Redo</span>
              <div className="flex gap-0.5">
                {redoShortcut.map((key, i) => (
                  <kbd
                    key={i}
                    className="px-1 py-0.5 text-[9px] font-mono bg-secondary text-secondary-foreground rounded border border-border/50"
                  >
                    {formatShortcutKey(key)}
                  </kbd>
                ))}
              </div>
            </div>
          </div>

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
        </div>,
        document.body
      )}
    </div>
  );
}
