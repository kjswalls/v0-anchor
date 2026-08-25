import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RollingMetaText, formatDuration } from '@/components/primitives/pills';

/**
 * The duration readout on a schedule block under a resize drag. What's worth
 * pinning here is the mechanism, not the CSS: that a changed value mounts a FRESH
 * incoming node (a reused node would keep its finished animation and never replay
 * it), that the previous figure is still on screen to roll out, and that the
 * direction flips with the value.
 */
describe('RollingMetaText', () => {
  const slot = (c: HTMLElement) => c.firstElementChild as HTMLElement;
  const outgoing = (c: HTMLElement) => c.querySelector('[aria-hidden="true"]');
  const incoming = (c: HTMLElement) =>
    Array.from(slot(c).children).find((el) => !el.hasAttribute('aria-hidden')) as HTMLElement;

  it('does not animate the figure it mounts with', () => {
    const { container } = render(<RollingMetaText value={60} format={formatDuration} />);
    expect(incoming(container)).toHaveTextContent('1h');
    expect(incoming(container).className).not.toContain('animate-meta-roll-in');
    expect(outgoing(container)).toBeNull();
  });

  it('rolls up when the value grows, keeping the old figure to roll out', () => {
    const { container, rerender } = render(<RollingMetaText value={60} format={formatDuration} />);
    const first = incoming(container);

    rerender(<RollingMetaText value={75} format={formatDuration} />);

    expect(incoming(container)).toHaveTextContent('1h 15m');
    expect(incoming(container).className).toContain('animate-meta-roll-in');
    // A fresh node, not the old one re-labelled — this is what restarts the run.
    expect(incoming(container)).not.toBe(first);
    expect(outgoing(container)).toHaveTextContent('1h');
    expect(outgoing(container)!.className).toContain('animate-meta-roll-out');
    expect(slot(container).style.getPropertyValue('--roll-dir')).toBe('1');
  });

  it('rolls down when the value shrinks', () => {
    const { container, rerender } = render(<RollingMetaText value={75} format={formatDuration} />);
    rerender(<RollingMetaText value={45} format={formatDuration} />);

    expect(incoming(container)).toHaveTextContent('45m');
    expect(outgoing(container)).toHaveTextContent('1h 15m');
    expect(slot(container).style.getPropertyValue('--roll-dir')).toBe('-1');
  });

  it('restarts on every step of a drag that ticks faster than the roll', () => {
    const { container, rerender } = render(<RollingMetaText value={30} format={formatDuration} />);
    const seen = new Set<Element>();
    for (const v of [45, 60, 75, 90]) {
      rerender(<RollingMetaText value={v} format={formatDuration} />);
      seen.add(incoming(container));
      // One outgoing figure at a time — steps replace it rather than queueing.
      expect(slot(container).children).toHaveLength(2);
    }
    expect(seen.size).toBe(4);
    expect(outgoing(container)).toHaveTextContent('1h 15m');
  });

  it('steps out of the quiet rail only while the value is being edited', () => {
    // Not cosmetic: a resize freezes the grid at full-day scale, which pins short
    // blocks at PANE_MIN_H, so this figure is the entire readout for the gesture.
    const { container, rerender } = render(<RollingMetaText value={60} format={formatDuration} />);
    expect(slot(container).className).toContain('text-2xs');
    expect(slot(container).className).toContain('text-muted-foreground');
    expect(slot(container)).not.toHaveAttribute('data-rolling');

    rerender(<RollingMetaText value={60} format={formatDuration} active />);
    expect(slot(container).className).toContain('text-xs');
    expect(slot(container).className).toContain('text-foreground');
    expect(slot(container)).toHaveAttribute('data-rolling', 'true');
  });

  it('leaves the slot alone when a re-render does not change the value', () => {
    const { container, rerender } = render(<RollingMetaText value={60} format={formatDuration} />);
    rerender(<RollingMetaText value={60} format={formatDuration} />);
    expect(outgoing(container)).toBeNull();
    expect(incoming(container).className).not.toContain('animate-meta-roll-in');
  });
});
