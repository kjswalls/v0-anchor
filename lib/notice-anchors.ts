/**
 * Which places are currently on screen to hold a notice.
 *
 * Direction E sends each notice back to the thing it is about, and E's own
 * stated cost is that "a notice you never scroll to is a notice you never see".
 * Most of that is a judgement per notice (memory/plans/notices-in-place.md holds
 * the table). One part of it is not a judgement at all and this module is it:
 * an anchor that is not rendered is not an anchor. The braindump is not on
 * screen on the phone's Today tab; the foot of today's column is not on screen
 * while you are looking at next Thursday. A notice whose object is absent falls
 * back to the dock's one line by itself, so nothing is ever placed somewhere
 * nobody is looking.
 *
 * A module-level registry rather than a store slice: it is read during render by
 * the dock and written in a LAYOUT effect by the slot, so the dock never paints a
 * frame holding a notice that is about to move.
 *
 * THE REFCOUNT IS INSURANCE, NOT A FIX. It is tempting to justify it with the
 * desktop⇄mobile shell swap, and that justification is wrong: React runs the
 * outgoing subtree's cleanup BEFORE the incoming subtree's effects, so the count
 * really does cross zero. What keeps that from flickering is that both happen in
 * one commit with no render in between — not the counter. As the app stands
 * nothing takes an anchor above 1. The counter is here so that a future second
 * slot for one anchor cannot silently unregister the first, and it carries a
 * hazard worth naming: two slots live for the same anchor would BOTH draw the
 * notice. If that ever becomes possible, the placement needs to pick one, not
 * just to stay registered.
 */
import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { NoticeAnchor } from '@/lib/dock-notices';

const counts = new Map<NoticeAnchor, number>();
const listeners = new Set<() => void>();

/**
 * Cached because useSyncExternalStore compares snapshots by identity and would
 * loop forever on a fresh Set every read. Rebuilt only when a count crosses 0.
 */
let snapshot: ReadonlySet<NoticeAnchor> = new Set();
const EMPTY: ReadonlySet<NoticeAnchor> = new Set();

function publish() {
  snapshot = new Set([...counts.entries()].filter(([, n]) => n > 0).map(([a]) => a));
  for (const l of listeners) l();
}

/** Imperative form. Returns the unregister. Exported for tests. */
export function registerNoticeAnchor(anchor: NoticeAnchor): () => void {
  const before = counts.get(anchor) ?? 0;
  counts.set(anchor, before + 1);
  if (before === 0) publish();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const now = (counts.get(anchor) ?? 1) - 1;
    counts.set(anchor, Math.max(0, now));
    if (now <= 0) publish();
  };
}

/** Test-only reset. The registry outlives every component, so a suite needs it. */
export function resetNoticeAnchors() {
  counts.clear();
  snapshot = EMPTY;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/**
 * The live set, read imperatively. `useLiveNoticeAnchors` is the render-time
 * reader and the one components use; this is for anything outside React that
 * needs the same answer — including the tests that pin the refcount.
 */
export function liveNoticeAnchors(): ReadonlySet<NoticeAnchor> {
  return snapshot;
}
/**
 * Nothing is anchored on the server. The dock is the safe answer for every
 * notice, so a server render that guesses wrong guesses toward being seen.
 */
const getServerSnapshot = () => EMPTY;

export function useLiveNoticeAnchors(): ReadonlySet<NoticeAnchor> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Declare "this anchor's object is on screen right now", for as long as
 * `active` holds.
 *
 * useLayoutEffect, not useEffect, and that is load-bearing: a passive effect
 * registers one commit late, which is one painted frame of the dock holding a
 * line that belongs somewhere else — the omnibar-moving flicker, reintroduced
 * by the fix for it.
 */
export function useNoticeAnchor(anchor: NoticeAnchor, active = true) {
  useLayoutEffect(() => {
    if (!active) return;
    return registerNoticeAnchor(anchor);
  }, [anchor, active]);
}
