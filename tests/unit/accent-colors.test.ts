import { describe, it, expect } from 'vitest';
import { ACCENT_RAMP, ACCENT_RAMP_SIZE, accentColorForName } from '@/lib/accent-colors';

describe('accent-colors', () => {
  it('exposes the full 8-token ramp', () => {
    expect(ACCENT_RAMP).toHaveLength(ACCENT_RAMP_SIZE);
    expect(ACCENT_RAMP[0]).toBe('var(--accent-1)');
    expect(ACCENT_RAMP[7]).toBe('var(--accent-8)');
  });

  it('returns a CSS var from the ramp for any name', () => {
    for (const name of ['Errands', 'Deep Work', 'anchor', '日本語', '']) {
      expect(accentColorForName(name)).toMatch(/^var\(--accent-[1-8]\)$/);
    }
  });

  it('is deterministic for the same name', () => {
    expect(accentColorForName('Errands')).toBe(accentColorForName('Errands'));
  });
});
