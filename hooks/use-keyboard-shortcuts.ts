'use client';

import { useEffect, useRef } from 'react';
import { useKeyboardShortcutsStore, ShortcutBinding } from '@/lib/keyboard-shortcuts-store';

type ShortcutHandlers = Partial<Record<string, () => void>>;

/** Normalize a key to lowercase and handle special cases. */
function normalizeKey(key: string): string {
  if (key === ' ') return 'space';
  // Map modifier key names to their standard forms
  if (key === 'Control') return 'ctrl';
  if (key === 'Meta' || key === 'OS') return 'meta';
  if (key === 'Shift') return 'shift';
  if (key === 'Alt') return 'alt';
  return key.toLowerCase();
}

/** Returns the normalized set of keys currently being pressed. */
function getPressedKeys(e: KeyboardEvent): string[] {
  const keys: string[] = [];
  
  if (e.ctrlKey) keys.push('ctrl');
  if (e.metaKey) keys.push('meta');
  if (e.altKey) keys.push('alt');

  const normalized = normalizeKey(e.key);
  if (!['ctrl', 'meta', 'shift', 'alt'].includes(normalized)) {
    keys.push(normalized);
  }

  // Only include 'shift' as an explicit modifier when it's paired with another
  // non-shift key that doesn't already encode the shift (e.g. '?' is Shift+/
  // but the key itself is '?', so adding 'shift' would break the match).
  // We include shift only when the resulting key is a plain letter/number/symbol
  // that doesn't embed the shift state — i.e. when the key is a modifier name itself.
  // Simplest correct rule: include shift only if paired with a non-printable key.
  const isPrintable = normalized.length === 1;
  if (e.shiftKey && !isPrintable) {
    keys.push('shift');
  }
  
  return keys.sort();
}

/** Returns true if the pressed keys match the binding exactly. */
function matchesShortcut(pressedKeys: string[], binding: ShortcutBinding): boolean {
  if (pressedKeys.length !== binding.keys.length) return false;
  const sortedBinding = [...binding.keys].sort();
  return pressedKeys.every((key, i) => key === sortedBinding[i]);
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
 * Supports up to 3 keys pressed concurrently (e.g., Ctrl+Shift+K).
 * Handlers are keyed by shortcut id (e.g. 'new_task').
 * Shortcuts are suppressed when the user is typing in an input.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const { shortcuts } = useKeyboardShortcutsStore();
  const activeHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFocusedOnInput()) return;

      const pressedKeys = getPressedKeys(e);
      if (pressedKeys.length === 0) return;

      for (const binding of shortcuts) {
        if (matchesShortcut(pressedKeys, binding)) {
          const handler = handlers[binding.id];
          if (handler && activeHandledRef.current !== binding.id) {
            e.preventDefault();
            activeHandledRef.current = binding.id;
            handler();
            return;
          }
        }
      }
    };

    const handleKeyUp = () => {
      // Reset the active handler on key release to allow re-triggering
      activeHandledRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // Re-register whenever shortcuts config or handlers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, handlers]);
}
