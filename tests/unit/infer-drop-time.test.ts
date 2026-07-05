import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inferDropTime } from '@/lib/dnd/infer-drop-time';

describe('inferDropTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('empty bucket', () => {
    it('uses the current time when now is inside the bucket window', () => {
      vi.setSystemTime(new Date('2026-07-04T09:37:00'));
      expect(inferDropTime('morning', 'empty')).toBe('09:37');
    });

    it('falls back to the window start when now is outside it', () => {
      vi.setSystemTime(new Date('2026-07-04T20:00:00'));
      expect(inferDropTime('morning', 'empty')).toBe('05:00');
      expect(inferDropTime('afternoon', 'empty')).toBe('12:00');
    });
  });

  describe('before/after a reference row', () => {
    it('drops 30 minutes around the reference time', () => {
      expect(inferDropTime('morning', 'before', '09:00')).toBe('08:30');
      expect(inferDropTime('morning', 'after', '09:00')).toBe('09:30');
    });

    it('borrows across the hour boundary', () => {
      expect(inferDropTime('morning', 'before', '09:15')).toBe('08:45');
      expect(inferDropTime('morning', 'after', '09:45')).toBe('10:15');
    });

    it('clamps to the bucket window', () => {
      expect(inferDropTime('afternoon', 'before', '12:10')).toBe('12:00');
      expect(inferDropTime('afternoon', 'after', '16:50')).toBe('16:30');
    });

    it('defaults to the window start without a reference time', () => {
      expect(inferDropTime('evening', 'before')).toBe('17:00');
    });
  });
});
