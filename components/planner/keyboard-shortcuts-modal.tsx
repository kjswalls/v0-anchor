'use client';

import { useMemo, useState } from 'react';
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
import {
  useKeyboardShortcutsStore,
  useShortcutBindings,
  type ShortcutBinding,
} from '@/lib/keyboard-shortcuts-store';
import { formatKeys, matchesBinding, pressedKeys } from '@/lib/commands';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Generated from the command registry — every binding listed here is one a
 * command actually owns, so the modal can no longer advertise a shortcut that
 * nothing dispatches (which was true of 7 of the 11 it used to show).
 */

function ShortcutRow({
  binding,
  isMac,
  allBindings,
}: {
  binding: ShortcutBinding;
  isMac: boolean;
  allBindings: ShortcutBinding[];
}) {
  const updateShortcut = useKeyboardShortcutsStore((s) => s.updateShortcut);
  const [recording, setRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);

  const handleStartRecording = () => {
    setRecording(true);
    setRecordedKeys([]);
    setConflict(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;

    // The exact function the dispatcher uses, so what you record is what will
    // match. Recording with different rules is how ['?', 'shift'] used to get
    // stored for a key that only ever arrives as ['?'].
    const keys = pressedKeys(e.nativeEvent);
    if (keys.length > 0 && keys.length <= 3) setRecordedKeys(keys);
  };

  const handleKeyUp = () => {
    if (!recording || recordedKeys.length === 0) return;

    // On macOS a bare Control combo is deliberately left to the text system,
    // so recording one would store a binding that can never fire. Say so
    // rather than accepting a dead shortcut.
    if (recordedKeys.includes('ctrl')) {
      setConflict('macOS text editing — use ⌘ instead');
      setRecording(false);
      setRecordedKeys([]);
      return;
    }

    // Refuse a combination another binding already answers to. The dispatcher
    // takes the FIRST match in registry order, so saving a duplicate would
    // leave this row displaying a shortcut that silently runs a different
    // command — the failure is invisible from here without this check.
    const clash = allBindings.find(
      (other) => other.id !== binding.id && matchesBinding(recordedKeys, other.keys)
    );
    if (clash) {
      setConflict(clash.label);
      setRecording(false);
      setRecordedKeys([]);
      return;
    }

    updateShortcut(binding.id, recordedKeys);
    setRecording(false);
    setRecordedKeys([]);
  };

  const displayKeys = formatKeys(binding.keys, isMac);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 space-y-0.5">
        <p className="text-sm text-foreground">{binding.label}</p>
        {conflict ? (
          <p className="text-xs text-destructive">
            {conflict.startsWith('macOS') ? `Reserved for ${conflict}` : `Already used by “${conflict}”`}
          </p>
        ) : (
          binding.description && (
            <p className="text-xs text-muted-foreground">{binding.description}</p>
          )
        )}
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
          'flex min-w-[100px] flex-wrap items-center justify-center gap-1 rounded-md border px-2 py-1 font-mono text-xs outline-none transition-colors',
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
  const bindings = useShortcutBindings();
  const resetShortcuts = useKeyboardShortcutsStore((s) => s.resetShortcuts);
  const isMobile = useIsMobile();

  // navigator.platform is stable across renders, so there is no hydration
  // hazard in reading it during one — but it is undefined on the server.
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    []
  );

  const sections = useMemo(() => {
    const byHeading = new Map<string, ShortcutBinding[]>();
    for (const binding of bindings) {
      byHeading.set(binding.groupHeading, [...(byHeading.get(binding.groupHeading) ?? []), binding]);
    }
    return [...byHeading.entries()];
  }, [bindings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="sr-only">
            Customize keyboard shortcuts for Anchor.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {isMobile && (
            <p className="py-2 text-xs text-muted-foreground">
              These apply when Anchor is open on a device with a keyboard.
            </p>
          )}
          <div className="space-y-5 py-2">
            {sections.map(([heading, rows]) => (
              <div key={heading} className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{heading}</p>
                {rows.map((binding) => (
                  <ShortcutRow
                    key={binding.id}
                    binding={binding}
                    isMac={isMac}
                    allBindings={bindings}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
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
