'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Publishes a dock's top edge as `--toast-bottom`, in px from the viewport
 * bottom, so the undo toast can sit exactly above it instead of above an
 * estimate of it.
 *
 * Both shells call this and only one shell is ever mounted (app-shell.tsx
 * renders exactly one), so there is never a fight over the variable. It is
 * deliberately NOT cleared on unmount: during a shell swap the outgoing dock's
 * value is a better guess for one frame than app/globals.css's fallback, and
 * the incoming dock overwrites it on mount anyway.
 *
 * Desktop has measured its dock since the dock was built. Mobile did not, and
 * hardcoded `bottom: 120px` against a capsule that stands between 130px and
 * 164px tall depending on whether the omnibar is showing — so the toast was
 * already drawing over the tab bar before anything was added to the dock. Any
 * surface that changes the dock's height (a notice row) makes that worse, which
 * is why the port is a prerequisite of the move and not a follow-up.
 */
export function useToastAnchor(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      document.documentElement.style.setProperty(
        '--toast-bottom',
        `${Math.max(16, Math.round(window.innerHeight - top + 8))}px`
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}
