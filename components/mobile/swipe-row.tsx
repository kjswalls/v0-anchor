'use client';

import { useCallback, useRef, useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Check, Clock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rowSwipeActive, openRowSwipe, closeRowSwipe } from '@/lib/row-swipe';

const ACTION_W = 56;
const REVEAL = ACTION_W * 3;

interface SwipeRowProps {
  onComplete: () => void;
  onSchedule: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

/**
 * Mobile-only wrapper that reveals Schedule / Complete / Delete when a row is
 * swiped left. Gesture arbitration (see lib/row-swipe + the plan):
 * - only claims horizontal intent (`|dx| > |dy|`), leaving vertical to scroll;
 * - `stopPropagation` on the swipe so the container tab-swipe never sees it
 *   (+ a `rowSwipeActive` guard as backup);
 * - dnd-kit's TouchSensor needs a 250ms still-hold, so a quick swipe never
 *   triggers a drag.
 * One row open at a time; tapping an open row closes it instead of opening edit.
 */
export function SwipeRow({ onComplete, onSchedule, onDelete, children }: SwipeRowProps) {
  const [tx, setTx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const openRef = useRef(false);
  const baseRef = useRef(0);

  const close = useCallback(() => {
    openRef.current = false;
    setTx(0);
  }, []);

  const clamp = (x: number) => Math.max(-REVEAL * 1.12, Math.min(0, x));

  const handlers = useSwipeable({
    onSwipeStart: () => {
      setSwiping(true);
      baseRef.current = openRef.current ? -REVEAL : 0;
    },
    onSwiping: (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical → let it scroll
      e.event.stopPropagation();
      rowSwipeActive.current = true;
      openRowSwipe(close);
      setTx(clamp(baseRef.current + e.deltaX));
    },
    onSwiped: (e) => {
      setSwiping(false);
      rowSwipeActive.current = false;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const finalTx = clamp(baseRef.current + e.deltaX);
      const open = finalTx < -REVEAL / 2 || (e.dir === 'Left' && e.velocity > 0.4);
      openRef.current = open;
      setTx(open ? -REVEAL : 0);
      if (open) openRowSwipe(close);
      else closeRowSwipe(close);
    },
    trackMouse: false,
    delta: 10,
    preventScrollOnSwipe: false,
  });

  const act = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <div className="relative overflow-hidden rounded-[5px]">
      <div className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          onClick={() => act(onSchedule)}
          className="flex w-14 items-center justify-center bg-surface-3 text-foreground"
          aria-label="Schedule"
        >
          <Clock className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => act(onComplete)}
          className="flex w-14 items-center justify-center bg-primary text-primary-foreground"
          aria-label="Complete"
        >
          <Check className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => act(onDelete)}
          className="flex w-14 items-center justify-center bg-destructive text-destructive-foreground"
          aria-label="Delete"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
      <div
        {...handlers}
        style={{ transform: `translateX(${tx}px)` }}
        onClickCapture={(e) => {
          // A tap while open just closes the actions — don't open the edit dialog.
          if (openRef.current) {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        className={cn('relative bg-canvas', !swiping && 'transition-transform duration-200 ease-out')}
      >
        {children}
      </div>
    </div>
  );
}
