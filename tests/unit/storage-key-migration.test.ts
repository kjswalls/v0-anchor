/**
 * The one-time `anchor-*` → `dsul-*` storage rename, tested against the REAL
 * script — the test extracts the literal out of app/layout.tsx rather than
 * keeping a copy, because a copy is exactly what would have hidden the bug this
 * file exists for: a repo-wide `anchor-` → `dsul-` sweep rewrote the migration's
 * OWN prefix literal, leaving a script that migrated `dsul-` to `dsul-` and
 * mangled every key it touched. Nothing failed. The palette, the rebindings, the
 * filters and every Beacon transcript would simply have been gone on first load,
 * because lib/local-state.ts treats a browser with no owner stamp as orphaned
 * and clears it.
 *
 * Safe to delete along with the migration itself, once every browser has loaded
 * the app once after the rename.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
const match = layout.match(/__html:\s*\n\s*"(try\{var P=.*?)",\n/s);

/** A localStorage/sessionStorage stand-in with the bits the script uses. */
class MemoryStorage {
  private m: Map<string, string>;
  constructor(init: Record<string, string> = {}) {
    this.m = new Map(Object.entries(init));
  }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  snapshot() { return Object.fromEntries([...this.m.entries()].sort()); }
}

function migrate(local: MemoryStorage, session: MemoryStorage) {
  const g = globalThis as unknown as { localStorage: unknown; sessionStorage: unknown };
  const prevLocal = g.localStorage;
  const prevSession = g.sessionStorage;
  g.localStorage = local;
  g.sessionStorage = session;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(JSON.parse(`"${match![1]}"`))();
  } finally {
    g.localStorage = prevLocal;
    g.sessionStorage = prevSession;
  }
}

describe('the anchor- → dsul- storage migration in app/layout.tsx', () => {
  it('is still present in the layout, above the palette script', () => {
    expect(match, 'migration script not found in app/layout.tsx').not.toBeNull();
    // Order is the whole point: the palette read and every hydration path must
    // see the new keys, so the migration has to come first in the document.
    expect(layout.indexOf(match![0])).toBeLessThan(layout.indexOf('reset-theme'));
  });

  it('renames every key, including the per-item chat families', () => {
    const local = new MemoryStorage({
      'anchor-local-state-owner': 'user-123',
      'anchor-view': '{"scope":"day"}',
      'anchor-palette': 'moss',
      'anchor-eod-store': '{"a":1}',
      'anchor-keyboard-shortcuts': '{"overrides":{}}',
      'anchor-item-chat-abc': '[{"role":"user"}]',
      'anchor-item-abc': 'sess-1',
      'anchor-sweep-grace': '{}',
      'planner-storage': '{"items":[]}',
    });
    const session = new MemoryStorage({
      'anchor-palette-reset': '1',
      'anchor-settings-advanced:look': '1',
    });

    migrate(local, session);

    expect(local.snapshot()).toEqual({
      'dsul-eod-store': '{"a":1}',
      'dsul-item-abc': 'sess-1',
      'dsul-item-chat-abc': '[{"role":"user"}]',
      'dsul-keyboard-shortcuts': '{"overrides":{}}',
      'dsul-local-state-owner': 'user-123',
      'dsul-palette': 'moss',
      'dsul-sweep-grace': '{}',
      'dsul-view': '{"scope":"day"}',
      'planner-storage': '{"items":[]}',
    });
    expect(session.snapshot()).toEqual({
      'dsul-palette-reset': '1',
      'dsul-settings-advanced:look': '1',
    });
  });

  it('carries the OWNER STAMP across, so the browser is never read as orphaned', () => {
    // The sharp one. lib/local-state.ts clears every per-user store when the
    // stamp does not match the signed-in account, and an absent stamp is a
    // mismatch — so losing this one key loses all the others' contents too.
    const local = new MemoryStorage({ 'anchor-local-state-owner': 'user-123' });
    migrate(local, new MemoryStorage());
    expect(local.getItem('dsul-local-state-owner')).toBe('user-123');
  });

  it('is a no-op the second time', () => {
    const local = new MemoryStorage({ 'anchor-view': 'x' });
    migrate(local, new MemoryStorage());
    const after = local.snapshot();
    migrate(local, new MemoryStorage());
    expect(local.snapshot()).toEqual(after);
  });

  it('lets an existing dsul- value win, and still clears the stale key', () => {
    const local = new MemoryStorage({ 'anchor-view': 'OLD', 'dsul-view': 'NEW' });
    migrate(local, new MemoryStorage());
    expect(local.snapshot()).toEqual({ 'dsul-view': 'NEW' });
  });

  it('leaves a fresh browser and every unrelated key alone', () => {
    const fresh = new MemoryStorage();
    migrate(fresh, new MemoryStorage());
    expect(fresh.snapshot()).toEqual({});

    const other = new MemoryStorage({
      'planner-storage': 'x',
      'sb-abc-auth-token': 'y',
      // Only a PREFIX match migrates — a key that merely contains the word does not.
      'notice-anchor-x': 'keep',
    });
    migrate(other, new MemoryStorage());
    expect(other.snapshot()).toEqual({
      'notice-anchor-x': 'keep',
      'planner-storage': 'x',
      'sb-abc-auth-token': 'y',
    });
  });
});
