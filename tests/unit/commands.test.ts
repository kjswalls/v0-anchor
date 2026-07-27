import { describe, it, expect } from 'vitest';
import {
  COMMANDS,
  formatKeys,
  matchCommands,
  matchesBinding,
  normalizeBinding,
  pressedKeys,
  type CommandContext,
} from '@/lib/commands';
import { DEFAULT_SHORTCUTS } from '@/lib/keyboard-shortcuts-store';

/**
 * The palette's two load-bearing invariants: every rendered row has a unique
 * cmdk value (duplicates silently collapse selection), and a keypress maps to
 * exactly one command on both platforms.
 */

const ctx: CommandContext = {
  theme: { resolved: 'light', value: 'light', set: () => {} },
  openChat: () => {},
  userId: 'test-user',
  isMobile: false,
};

/** Minimal stand-in — pressedKeys only reads these five fields. */
function keyEvent(
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  } as KeyboardEvent;
}

describe('command registry', () => {
  it('has no duplicate command ids', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate shortcut ids', () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every historical shortcut id, so persisted rebindings still resolve', () => {
    // These are the keys a user's override is stored under. Renaming one
    // silently discards their custom binding.
    const expected = [
      'new_task',
      'edit_hovered',
      'delete_hovered',
      'undo',
      'redo',
      'toggle_left_sidebar',
      'toggle_right_sidebar',
      'system_settings',
      'system_shortcuts',
      'system_search',
      'report_bug',
    ];
    const actual = DEFAULT_SHORTCUTS.map((s) => s.id);
    for (const id of expected) expect(actual).toContain(id);
    expect(actual).toHaveLength(expected.length);
  });

  it('gives no two bindings the same normalized key combination', () => {
    const seen = new Map<string, string>();
    for (const binding of DEFAULT_SHORTCUTS) {
      const combo = normalizeBinding(binding.keys).join('+');
      expect(seen.has(combo), `${binding.id} collides with ${seen.get(combo)} on ${combo}`).toBe(
        false
      );
      seen.set(combo, binding.id);
    }
  });
});

describe('aliases', () => {
  /** Every alias in the registry, including those on flattened enum options. */
  function allAliases() {
    const found: { alias: string; owner: string }[] = [];
    for (const command of COMMANDS) {
      for (const alias of command.aliases ?? []) found.push({ alias, owner: command.id });
      const arg = command.argument;
      if (arg?.kind !== 'enum') continue;
      for (const option of arg.options(ctx)) {
        for (const alias of option.aliases ?? []) {
          found.push({ alias, owner: `${command.id}::${option.value}` });
        }
      }
    }
    return found;
  }

  it('are unique across the whole registry', () => {
    // An alias is a promise that typing it lands in exactly one place. Two
    // owners for one token silently breaks that.
    const seen = new Map<string, string>();
    for (const { alias, owner } of allAliases()) {
      expect(seen.has(alias), `"${alias}" claimed by both ${seen.get(alias)} and ${owner}`).toBe(
        false
      );
      seen.set(alias, owner);
    }
  });

  it('are single lowercase words', () => {
    for (const { alias, owner } of allAliases()) {
      expect(alias, `${owner} has a malformed alias`).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('sends /dark and /light straight to the theme, not the toggle', () => {
    const dark = matchCommands('dark', ctx)[0];
    expect(dark.command.id).toBe('settings.theme');
    expect(dark.arg?.value).toBe('dark');

    const light = matchCommands('light', ctx)[0];
    expect(light.command.id).toBe('settings.theme');
    expect(light.arg?.value).toBe('light');

    // Both run in one step — no chip, no second Enter.
    expect(dark.arg).toBeDefined();
    expect(light.arg).toBeDefined();
  });

  it('outranks another command that merely contains the word', () => {
    // "Toggle dark mode" matches "dark" on a word boundary; the alias wins.
    const ids = matchCommands('dark', ctx).map((r) => r.command.id);
    expect(ids).toContain('settings.darkMode');
    expect(ids[0]).toBe('settings.theme');
  });

  it('resolves the short navigation tokens', () => {
    const top = (q: string) => matchCommands(q, ctx)[0];
    expect(top('today').command.id).toBe('goto.today');
    expect(top('tomorrow').command.id).toBe('goto.tomorrow');
    expect(top('yesterday').command.id).toBe('goto.yesterday');
    expect(top('week').command.id).toBe('view.scopeWeek');
    expect(top('eod').command.id).toBe('rituals.eod');
    expect(top('inbox').command.id).toBe('goto.braindump');
  });
});

describe('matchCommands', () => {
  it('produces unique row values so cmdk selection cannot collapse', () => {
    for (const query of ['', 'a', 'e', 'task', 'list', 'to', 'set']) {
      const values = matchCommands(query, ctx).map((r) => r.value);
      expect(new Set(values).size, `duplicate row value for query "${query}"`).toBe(values.length);
    }
  });

  it('ranks an exact label match first', () => {
    expect(matchCommands('add task', ctx)[0].command.id).toBe('create.task');
    expect(matchCommands('undo', ctx)[0].command.id).toBe('history.undo');
  });

  it('finds a singular command from a plural query', () => {
    // People type "habits"; the command is labelled "Add habit".
    const ids = matchCommands('habits', ctx).map((r) => r.command.id);
    expect(ids).toContain('create.habit');
  });

  it('does not let a three-letter word drag in unrelated commands', () => {
    // "settings" starts with the word "Set" in "Set theme" — too weak a signal.
    const ids = matchCommands('settings', ctx).map((r) => r.command.id);
    expect(ids).toContain('app.settings');
    expect(ids).not.toContain('settings.theme');
  });

  it('reaches a nested enum value in one step once you type it', () => {
    const row = matchCommands('schedule', ctx).find((r) => r.arg?.value === 'schedule');
    expect(row?.command.id).toBe('view.layout');
    expect(row?.value).toBe('cmd:view.layout::schedule');
  });

  it('does not flatten options into the resting list', () => {
    expect(matchCommands('', ctx).every((r) => !r.arg)).toBe(true);
  });

  it('omits commands hidden for the current platform', () => {
    const mobile = matchCommands('', { ...ctx, isMobile: true }).map((r) => r.command.id);
    expect(mobile).not.toContain('view.scopeWeek');
    expect(mobile).not.toContain('workspace.toggleChat');

    const desktop = matchCommands('', ctx).map((r) => r.command.id);
    expect(desktop).not.toContain('goto.todayTab');
    // Never a row on either platform — it would hide the palette itself.
    expect(desktop).not.toContain('workspace.toggleSidebar');
  });
});

const MAC = true;
const PC = false;

describe('key matching', () => {
  it('accepts the platform modifier whichever token a binding shipped with', () => {
    // Bindings were authored inconsistently: undo as ['ctrl','z'], settings as
    // ['meta'','']. Both have to work on both platforms.
    expect(matchesBinding(pressedKeys(keyEvent('z', { meta: true }), MAC), ['ctrl', 'z'])).toBe(
      true
    );
    expect(matchesBinding(pressedKeys(keyEvent('z', { ctrl: true }), PC), ['ctrl', 'z'])).toBe(true);
    expect(matchesBinding(pressedKeys(keyEvent(',', { meta: true }), MAC), ['meta', ','])).toBe(
      true
    );
    expect(matchesBinding(pressedKeys(keyEvent(',', { ctrl: true }), PC), ['meta', ','])).toBe(true);
  });

  it('leaves Control alone on macOS so native text bindings survive', () => {
    // ⌃K is "kill to end of line" in every macOS text field, and ⌘K is
    // allowInInput — folding them together would swallow it.
    expect(matchesBinding(pressedKeys(keyEvent('k', { ctrl: true }), MAC), ['meta', 'k'])).toBe(
      false
    );
    expect(matchesBinding(pressedKeys(keyEvent('k', { meta: true }), MAC), ['meta', 'k'])).toBe(
      true
    );
    // On Windows there is no such convention, so Ctrl is the modifier.
    expect(matchesBinding(pressedKeys(keyEvent('k', { ctrl: true }), PC), ['meta', 'k'])).toBe(true);
  });

  it('distinguishes redo from undo', () => {
    // e.key is the uppercase letter when Shift is held with a modifier, so
    // without the alphanumeric rule this collapsed onto undo.
    const redo = pressedKeys(keyEvent('Z', { ctrl: true, shift: true }), PC);
    expect(matchesBinding(redo, ['ctrl', 'shift', 'z'])).toBe(true);
    expect(matchesBinding(redo, ['ctrl', 'z'])).toBe(false);

    const undo = pressedKeys(keyEvent('z', { ctrl: true }), PC);
    expect(matchesBinding(undo, ['ctrl', 'z'])).toBe(true);
    expect(matchesBinding(undo, ['ctrl', 'shift', 'z'])).toBe(false);
  });

  it('does not count Shift for a character Shift produced', () => {
    // '?' arrives as Shift+/, so adding 'shift' would stop ['?'] matching.
    expect(matchesBinding(pressedKeys(keyEvent('?', { shift: true }), PC), ['?'])).toBe(true);
  });

  it('matches bare single-key bindings', () => {
    expect(matchesBinding(pressedKeys(keyEvent('n'), PC), ['n'])).toBe(true);
    expect(matchesBinding(pressedKeys(keyEvent('Backspace'), PC), ['backspace'])).toBe(true);
    // A modifier held means it is no longer the bare binding.
    expect(matchesBinding(pressedKeys(keyEvent('n', { meta: true }), PC), ['n'])).toBe(false);
  });

  it('lets undo and redo repeat on key auto-repeat, and nothing else', () => {
    const repeatable = COMMANDS.filter((c) => c.shortcut?.repeatable).map((c) => c.shortcut!.id);
    expect(repeatable.sort()).toEqual(['redo', 'undo']);
  });

  it('labels ctrl and meta as the platform modifier, matching what they match', () => {
    expect(formatKeys(['ctrl', 'z'], true)).toEqual(['⌘', 'Z']);
    expect(formatKeys(['meta', 'z'], false)).toEqual(['Ctrl', 'Z']);
  });
});
