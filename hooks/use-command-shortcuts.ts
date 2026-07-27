'use client';

import { useEffect, useRef } from 'react';
import { getShortcutBindings, useKeyboardShortcutsStore } from '@/lib/keyboard-shortcuts-store';
import { COMMANDS, isAvailable, matchesBinding, pressedKeys } from '@/lib/commands';
import { useCommandUsageStore } from '@/lib/command-usage-store';
import type { CommandContext } from '@/lib/commands';

/**
 * The app's ONE keydown dispatcher.
 *
 * It replaces two that disagreed: a configurable one driven by the shortcuts
 * store which was only ever handed four handlers, and a hardcoded listener in
 * AppShell that owned the other seven ids and never read the store — so
 * rebinding undo, redo, either sidebar, settings, shortcuts or search silently
 * did nothing. The hardcoded one also skipped the focused-input guard, which
 * is why ⌘Z while typing in the omnibar undid a *task* instead of a keystroke.
 *
 * Bindings come from the registry (a command owns its shortcut); the two
 * hovered-item shortcuts are passed in because they need shell state.
 */

type ShellHandlers = Partial<Record<string, () => void>>;

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

export function useCommandShortcuts(ctx: CommandContext, shellHandlers: ShellHandlers = {}) {
  // Subscribing keeps the effect in sync with rebindings; the keys themselves
  // are read non-reactively at keypress time.
  const overrides = useKeyboardShortcutsStore((s) => s.overrides);
  const activeHandledRef = useRef<string | null>(null);

  // Latest-value refs so the listener never has to be torn down and rebuilt on
  // every context change (the context is rebuilt whenever the theme, the user,
  // or the viewport changes).
  const ctxRef = useRef(ctx);
  const handlersRef = useRef(shellHandlers);
  useEffect(() => {
    ctxRef.current = ctx;
    handlersRef.current = shellHandlers;
  });

  useEffect(() => {
    const commandByShortcutId = new Map(
      COMMANDS.filter((c) => c.shortcut).map((c) => [c.shortcut!.id, c])
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      const pressed = pressedKeys(event);
      if (pressed.length === 0) return;

      const typing = isFocusedOnInput();

      for (const binding of getShortcutBindings()) {
        if (!matchesBinding(pressed, binding.keys)) continue;

        const command = commandByShortcutId.get(binding.id);

        // Key auto-repeat is suppressed unless the command opts in — holding a
        // key should not reopen a dialog 30 times, but holding ⌘Z should keep
        // rewinding.
        if (activeHandledRef.current === binding.id && !command?.shortcut?.repeatable) return;

        // Chrome-level bindings (⌘K, ⌘,) still fire while typing. Anything
        // that touches data must not, or it steals the browser's own editing
        // shortcuts out from under a text field.
        if (typing && !command?.shortcut?.allowInInput) return;

        if (command) {
          if (!isAvailable(command, ctxRef.current)) return;
          event.preventDefault();
          activeHandledRef.current = binding.id;
          command.run(ctxRef.current);
          useCommandUsageStore.getState().record(command.id);
          return;
        }

        const handler = handlersRef.current[binding.id];
        if (handler) {
          event.preventDefault();
          activeHandledRef.current = binding.id;
          handler();
        }
        return;
      }
    };

    // Cleared on release so holding a key can't fire a command repeatedly.
    const handleKeyUp = () => {
      activeHandledRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [overrides]);
}
