'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A line that arrives the way it would be typed, with one sheen passing over it.
 *
 * THE ONE RULE. The reveal is a PAINT effect and never an availability one. The
 * whole sentence is in the DOM from the first frame in every case — the wipe is
 * a `clip-path` over text that is already there, so a screen reader, a find-in-
 * page and a test all see the finished line immediately, and there is no state
 * of this component in which the text does not exist. Withholding characters and
 * appending them on a timer would make the notice literally unreadable while it
 * types, which is the failure this shape exists to avoid.
 *
 * TWO MOTION VETOES, the same pair every animated surface in this app honours
 * (lib/theme-transition.ts, lib/completion-confetti.ts, relay-field.tsx): the OS
 * `prefers-reduced-motion` AND Anchor's own animations toggle, which stamps
 * `[data-reduce-motion]` on <html>. Under either the text simply appears — no
 * clip, no sheen, no class that CSS then has to undo.
 *
 * The default is "no animation": the reveal is armed in a layout effect after
 * the veto has been read, so the server render and the first commit are the
 * plain line. A bug in here can therefore cost the shimmer; it cannot cost the
 * sentence.
 *
 * The sheen is deliberately NOT lime. Lime is this palette's meaning colour —
 * the living hour, a completion — and a notice arriving is neither. It is also
 * its own absolutely-positioned element rather than an opacity on the text, so
 * nothing here can fade an accent through a parent (CLAUDE.md).
 *
 * Only in-place notices type. The dock's line never does: the dock is where the
 * urgent and the homeless live, and anything urgent must be legible at once.
 */
export function TypewriterText({
  children,
  /**
   * Identity of the sentence. The reveal replays when this changes and NOT when
   * the text merely re-renders — a receipt whose count ticks from 11 to 12
   * should not retype itself, and a dismiss-then-return should.
   */
  revealKey,
  className,
}: {
  children: ReactNode;
  revealKey?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [reveal, setReveal] = useState<{ ms: number; steps: number } | null>(null);

  /**
   * One setState, and it reads two external systems to decide: a media query
   * and the rendered line's own length. (react-hooks/set-state-in-effect warns
   * here — this is the case the rule's own docs carve out, and the state cannot
   * be derived during render because both inputs are DOM.)
   */
  useLayoutEffect(() => {
    const reduced =
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.hasAttribute('data-reduce-motion');
    const len = reduced ? 0 : (ref.current?.textContent?.length ?? 0);

    // One step per character up to 40, so a long line does not become a
    // 200-frame animation, and ~16ms a character — fast enough that the line is
    // whole before the eye has finished arriving at it.
    setReveal(
      len === 0
        ? null
        : { ms: Math.min(640, Math.max(200, len * 16)), steps: Math.min(40, Math.max(6, len)) }
    );
  }, [revealKey]);

  return (
    <span className={cn('relative inline-block min-w-0 max-w-full align-bottom', className)}>
      <span
        ref={ref}
        data-typing={reveal ? 'true' : undefined}
        className={cn('block min-w-0 truncate', reveal && 'notice-type')}
        style={
          reveal
            ? {
                animationDuration: `${reveal.ms}ms`,
                animationTimingFunction: `steps(${reveal.steps}, end)`,
              }
            : undefined
        }
      >
        {children}
      </span>
      {reveal && (
        <span
          aria-hidden
          data-testid="notice-shimmer"
          className="notice-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3"
          style={{ animationDuration: `${Math.round(reveal.ms * 1.4)}ms` }}
        />
      )}
    </span>
  );
}
