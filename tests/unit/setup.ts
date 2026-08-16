import '@testing-library/jest-dom';

/**
 * jsdom ships no Element.prototype.scrollIntoView, and calling a missing method
 * throws rather than no-oping. Radix's RovingFocusGroup calls it on every
 * candidate BEFORE focusing it, so without this stub arrow-key traversal in any
 * Tabs / Menu / ToggleGroup test dies silently mid-handler and focus simply
 * never moves — which reads as a component bug rather than a jsdom gap.
 *
 * The Organize console needs it for its own reason too: deep-linking with
 * `focusId` scrolls the selected row into view with `{ block: 'nearest' }`.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * jsdom implements no window.matchMedia either, and it is not optional chaining
 * away — `hooks/use-mobile.ts` and `hooks/use-media-query.ts` call it directly
 * in an effect, so ANY component that renders a ResponsiveModal, the desktop
 * shell, or anything else branching on viewport throws on mount.
 *
 * Reports "does not match" for every query, which lands every consumer on its
 * desktop branch — consistent with jsdom's own 1024px innerWidth, so
 * `useIsMobile`'s width check and this agree instead of disagreeing.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      // Deprecated pair, still called by some libraries.
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
