/**
 * Key normalization shared by the shortcut dispatcher and the shortcuts modal,
 * so what a binding DOES and what the modal SAYS it does can't drift.
 *
 * Two rules that are not obvious:
 *
 * 1. Ctrl and Meta both normalize to a single 'mod'. Bindings were authored
 *    inconsistently — undo shipped as ['ctrl','z'], settings as ['meta',','] —
 *    and matching them literally means undo is dead on macOS and settings is
 *    dead on Windows. (Neither was noticed because both were also hardcoded in
 *    a second listener that tested `metaKey || ctrlKey`.) Collapsing them keeps
 *    every existing binding, and every binding a user has already recorded,
 *    working on both platforms.
 *
 * 2. Shift counts as a modifier for alphanumerics but not for symbols. `e.key`
 *    for Shift+/ is already '?', so adding 'shift' would stop ['?'] from ever
 *    matching; `e.key` for Ctrl+Shift+Z is 'Z', which lowercases to 'z', so
 *    NOT adding 'shift' made redo indistinguishable from undo — and undo, being
 *    declared first, won.
 */

export const MOD = 'mod';

const MODIFIER_TOKENS = new Set(['ctrl', 'meta', 'shift', 'alt', MOD]);

let applePlatformCache: boolean | null = null;

/** Cached because navigator.platform cannot change within a session. */
export function isApplePlatform(): boolean {
  if (applePlatformCache !== null) return applePlatformCache;
  if (typeof navigator === 'undefined') return false;
  applePlatformCache = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return applePlatformCache;
}

export function normalizeKey(key: string): string {
  if (key === ' ') return 'space';
  if (key === 'Control') return 'ctrl';
  if (key === 'Meta' || key === 'OS') return 'meta';
  if (key === 'Shift') return 'shift';
  if (key === 'Alt') return 'alt';
  return key.toLowerCase();
}

/** True for characters that only exist because Shift was held ('?', '!', ':'). */
function isShiftProducedSymbol(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

/**
 * The normalized, sorted key set for a keydown event.
 *
 * On macOS, Control is NOT folded into 'mod' — only Command is. Control there
 * belongs to the text system (⌃K kills to end of line, ⌃A/⌃E jump), and
 * because ⌘K is `allowInInput`, folding them together would let the palette
 * swallow ⌃K inside every textarea in the app. A literal 'ctrl' matches no
 * binding, which is exactly what leaves the native behaviour alone.
 */
export function pressedKeys(event: KeyboardEvent, applePlatform = isApplePlatform()): string[] {
  const keys: string[] = [];
  if (event.metaKey || (event.ctrlKey && !applePlatform)) keys.push(MOD);
  else if (event.ctrlKey) keys.push('ctrl');
  if (event.altKey) keys.push('alt');

  const normalized = normalizeKey(event.key);
  if (event.shiftKey && !isShiftProducedSymbol(normalized)) keys.push('shift');
  if (!MODIFIER_TOKENS.has(normalized)) keys.push(normalized);

  return keys.sort();
}

/** A stored binding in the same shape pressedKeys produces. */
export function normalizeBinding(keys: string[]): string[] {
  return keys
    .map((key) => (key === 'ctrl' || key === 'meta' ? MOD : key))
    .filter((key, index, all) => all.indexOf(key) === index)
    .sort();
}

export function matchesBinding(pressed: string[], binding: string[]): boolean {
  const normalized = normalizeBinding(binding);
  if (normalized.length === 0 || pressed.length !== normalized.length) return false;
  return pressed.every((key, i) => key === normalized[i]);
}

/**
 * Human-readable key labels. 'ctrl' and 'meta' both render as the platform's
 * primary modifier, because that is what they both now match.
 */
export function formatKeys(keys: string[], isMac: boolean): string[] {
  return keys.map((key) => {
    switch (key) {
      case 'ctrl':
      case 'meta':
      case MOD:
        return isMac ? '⌘' : 'Ctrl';
      case 'shift':
        return isMac ? '⇧' : 'Shift';
      case 'alt':
        return isMac ? '⌥' : 'Alt';
      case 'space':
        return 'Space';
      case 'backspace':
        return isMac ? '⌫' : 'Backspace';
      default:
        return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
    }
  });
}
