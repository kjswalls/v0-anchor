'use client';

import { useEffect } from 'react';
import { useKeyboardShortcutsStore, ShortcutBinding } from '@/lib/keyboard-shortcuts-store';

type ShortcutHandlers = Partial<Record<string, () => void>>;

/** Returns true if the event matches this binding. */
function matchesShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  const keyMatch = e.key === binding.key;
  const modifierMatch =
    binding.modifier === ''
      ? !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      : binding.modifier === 'ctrl'
      ? e.ctrlKey
      : binding.modifier === 'meta'
      ? e.metaKey
      : binding.modifier === 'shift'
      ? e.shiftKey
      : binding.modifier === 'alt'
      ? e.altKey
      : false;
  return keyMatch && modifierMatch;
}

/** Returns true if focus is inside a form element where shortcuts should be suppressed. */
function isFocusedOnInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

/**
 * Registers global keydown listeners for the app's configurable shortcuts.
 * Handlers are keyed by shortcut id (e.g. 'new_task').
 * Shortcuts are suppressed when the user is typing in an input.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { shortcuts } = useKeyboardShortcutsStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFocusedOnInput()) return;

      for (const binding of shortcuts) {
        if (matchesShortcut(e, binding)) {
          const handler = handlers[binding.id];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Re-register whenever shortcuts config or handlers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, handlers]);
}
