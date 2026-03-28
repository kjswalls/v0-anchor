'use client';

import { useState, useEffect } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useKeyboardShortcutsStore, ShortcutBinding } from '@/lib/keyboard-shortcuts-store';

function getModifierLabels(isMac: boolean): Record<string, string> {
  return {
    ctrl: isMac ? '⌃' : 'Ctrl',
    meta: isMac ? '⌘' : 'Ctrl',
    shift: isMac ? '⇧' : 'Shift',
    alt: isMac ? '⌥' : 'Alt',
  };
}

function ShortcutRow({ binding, isMac }: { binding: ShortcutBinding; isMac: boolean }) {
  const MODIFIER_LABELS = getModifierLabels(isMac);
  const { updateShortcut } = useKeyboardShortcutsStore();
  const [recording, setRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  const handleStartRecording = () => {
    setRecording(true);
    setRecordedKeys([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;

    const keys: string[] = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.metaKey) keys.push('meta');
    if (e.shiftKey) keys.push('shift');
    if (e.altKey) keys.push('alt');

    const normalizedKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (!['ctrl', 'meta', 'shift', 'alt'].includes(normalizedKey)) {
      keys.push(normalizedKey);
    }

    if (keys.length <= 3) {
      setRecordedKeys(keys.sort());
    }
  };

  const handleKeyUp = () => {
    if (!recording || recordedKeys.length === 0) return;
    updateShortcut(binding.id, recordedKeys);
    setRecording(false);
    setRecordedKeys([]);
  };

  const displayKeys = binding.keys.map((key) => {
    if (key === 'space') return 'Space';
    return MODIFIER_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
  });

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5 flex-1">
        <p className="text-sm text-foreground">{binding.label}</p>
        <p className="text-xs text-muted-foreground">{binding.description}</p>
      </div>
      <button
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          if (recording) {
            setRecording(false);
            setRecordedKeys([]);
          }
        }}
        onClick={handleStartRecording}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-mono transition-colors outline-none min-w-[100px] justify-center flex-wrap',
          recording
            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
            : 'border-border bg-muted text-foreground hover:border-primary/50'
        )}
      >
        {recording ? (
          <span className="animate-pulse text-primary">Recording...</span>
        ) : displayKeys.length === 0 ? (
          <span className="text-muted-foreground">No shortcut</span>
        ) : (
          displayKeys.map((key, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">+</span>}
              {key}
            </span>
          ))
        )}
      </button>
    </div>
  );
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  const { shortcuts, resetShortcuts } = useKeyboardShortcutsStore();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="sr-only">
            Customize keyboard shortcuts for Anchor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 py-2">
            {shortcuts.map((binding) => (
              <ShortcutRow key={binding.id} binding={binding} isMac={isMac} />
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={resetShortcuts}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
