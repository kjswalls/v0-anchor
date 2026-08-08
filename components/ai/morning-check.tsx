'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Sun, X } from 'lucide-react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MorningTriageList } from '@/components/ai/morning-triage-list';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { useCanvasWide } from '@/lib/view-store';
import { summarizeOverdue, type OverdueSummary } from '@/lib/overdue';
import { inactiveItemIdsOn } from '@/lib/active';
import { toDateStr } from '@/lib/recurrence';

/**
 * The waiting bar — a single line above the day, with the list in a portal.
 *
 * "Waiting" to the reader, "past due" in the code: the predicate, the store, the
 * settings keys and the auto-age sweep all still use the internal name, because
 * that is what they compute. See the copy contract on BarCopy below for why the
 * visible word is different, and treat that contract as covering this file and
 * components/ai/morning-triage-list.tsx together.
 *
 * THE CONTRACT: the bar's in-flow height is 50px at EVERY task count, forever.
 *   wrapper mt-3 + mb-1 (16) + border ×2 (2) + bar row h-8 (32) = 50
 * `h-8` is load-bearing and must never be replaced by padding + text: the old
 * `py-2` + `text-xs` header made --text-xs--line-height a silent input to the
 * schedule grid's hour height. lib/use-fit-hour-px.ts:41 computes that height
 * from (viewport.clientHeight − anchorTop), and both terms are constant only
 * because this bar never changes size and the list is portaled. Opening or
 * closing the tray must therefore produce ZERO setHourPx updates and zero
 * schedule-block re-layouts.
 *
 * ONE CARVE-OUT, and it is deliberate — do NOT "fix" it. `visible` below also
 * goes false when the LAST overdue item is actioned inside the tray and the
 * user then closes it, because at that moment there is nothing left to be past
 * due about. The whole 50px unmounts in that commit, the timeline column grows
 * by 50px, and lib/use-fit-hour-px.ts:63's ResizeObserver fires exactly one
 * setHourPx. That is a legitimate one-time reflow: the bar is genuinely gone
 * for the day, the same way it is gone on any day you wake up caught up. The
 * zero-updates rule above is about the TRAY (a portal, which is why it costs
 * nothing), not about the bar retiring. Keeping an empty 50px bar on screen all
 * day to dodge one ResizeObserver callback would be the worse trade.
 *
 * Exports two mounts because AppShell renders exactly one shell at a time:
 * MorningCheck (desktop, Popover tray) and MorningCheckMobile (Drawer sheet).
 */

/** Everything both platforms need, computed once. */
function usePastDue() {
  const items = usePlannerStore((s) => s.items);
  const morningCheckEnabled = useMorningStore((s) => s.morningCheckEnabled);
  const dismissedDate = useMorningStore((s) => s.morningCheckDismissedDate);
  const isOpen = useMorningStore((s) => s.isOpen);
  const open = useMorningStore((s) => s.open);
  const close = useMorningStore((s) => s.close);

  /**
   * The tray is state of THIS surface, so it dies with this surface.
   *
   * isOpen is one global flag shared by both mounts, and there are three ways
   * to leave a mount behind: AppShell swaps shells at the 768px breakpoint
   * (app-shell.tsx:371 renders exactly one), mobile-shell.tsx:60 mounts the
   * pill on the Today tab only, and `goto.overdue` can flip isOpen from the
   * omnibar on a tab where nothing is mounted at all. Without this, an open
   * tray leaks across every one of those boundaries and the NEXT surface to
   * mount inherits it — narrow the window with the desktop tray open and the
   * mobile Drawer opens by itself; swipe Today → Braindump → Today and the
   * Drawer is sitting there waiting. Neither is anything the user asked for.
   */
  useEffect(() => close, [close]);

  /**
   * ...and it cannot open in the commit it mounts in, on EITHER surface.
   *
   * The unmount-close above means a stale isOpen can no longer SURVIVE to the
   * next mount, but it clears one commit late — it is a passive effect — so on
   * its own it still lets the incoming surface paint one frame with the
   * outgoing surface's open flag. Crossing the 768px breakpoint with a tray
   * open hits this in BOTH directions (app-shell.tsx:371 swaps the two shells
   * in a single commit), so the gate lives here in the shared hook rather than
   * on one platform: rendering closed until armed is what makes "never
   * auto-opens" literally true instead of merely intended.
   *
   * It costs nothing the rest of the time. Both mounts call this hook
   * unconditionally — the `visible` early-return is below the hooks — so
   * `armed` is already true long before any user gesture, and `goto.overdue`
   * (which reveals the surface first, registry.ts:449) still opens on the
   * commit after the mount.
   */
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);

  /**
   * "Today" resolved through the user's SAVED timezone — the app-wide
   * convention (`toDateStr`), shared with hooks/use-day-items.ts,
   * week-schedule.tsx:256, task-row.tsx:77, planner-store.ts:350 and
   * lib/commands/entities.ts. `goto.overdue` and hooks/use-overdue-sweep.ts
   * resolve it the same way, so the bar, the command that opens it, and the
   * destructive auto-age sweep can never disagree about which day it is.
   *
   * Bare `format(new Date(), 'yyyy-MM-dd')` would read the MACHINE tz: for a
   * user travelling with a saved tz ≠ machine tz, an item would count as past
   * due here while the day view still showed it as today's.
   */
  const userTimezone = usePlannerStore((s) => s.userTimezone);
  const todayStr = toDateStr(
    new Date(),
    userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Suppressed work is not past due — it is deliberately set aside, so it must
  // not appear in the count, the tray, or the copy. Resolved at TODAY (this is
  // a dateless surface; plan decision 3).
  const summary = useMemo(() => {
    const tz = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return summarizeOverdue(items, todayStr, inactiveItemIdsOn(items, todayStr, { userTimezone: tz }));
  }, [items, todayStr, userTimezone]);

  // n === 0 hides the bar — EXCEPT while the tray is open. The `|| isOpen` is
  // load-bearing: without it, actioning the last item yanks the tray out from
  // under the cursor mid-triage.
  const visible =
    morningCheckEnabled && dismissedDate !== todayStr && (summary.count > 0 || isOpen);

  // `isOpen` is the store's answer; `trayOpen` is the one any surface may
  // render from. `visible` deliberately keeps using the raw flag: the bar must
  // stay on screen while a tray is open even at count 0, and that has to hold
  // in the pre-armed commit too or the bar would blink out from under the user.
  return { summary, todayStr, trayOpen: isOpen && armed, visible, open, close };
}

/**
 * dismiss(), with the keyboard put somewhere deliberate first.
 *
 * dismiss() writes morningCheckDismissedDate AND isOpen:false in one set
 * (lib/morning-store.ts:56), so `visible` flips false in the SAME render as the
 * click: the Popover root — the trigger Radix would restore focus to included —
 * unmounts before onCloseAutoFocus can run, and so does the ✕ / "Hide until
 * tomorrow" button the user just pressed. Focus falls to <body> and the next Tab
 * restarts at the top of the document.
 *
 * Neither surface has a survivor of its own to hand focus to (every control
 * lives inside the thing being removed), so it goes to whatever takes the bar's
 * PLACE: our next sibling — the timeline column on desktop, the tab content on
 * mobile — falling back to our parent. Both provably outlive us, and both sit
 * where the bar sat, so the next Tab continues into the day instead of
 * rewinding. tabIndex is set imperatively because the host belongs to the
 * shell, and -1 keeps it programmatic-only so it never joins the tab sequence.
 *
 * Deliberately NOT ui-store's focusOmnibar(), the app's other focus verb: it
 * requires revealing the sidebar first (lib/commands/registry.ts:656), and
 * parking the caret in a text input makes hooks/use-command-shortcuts.ts:25
 * suppress n / e / Backspace / ⌘Z until the user blurs. Closing a bar must not
 * cost you the keyboard.
 */
function useDismissWithFocus() {
  const dismiss = useMorningStore((s) => s.dismiss);
  const barRef = useRef<HTMLDivElement>(null);

  const dismissAndMoveFocus = useCallback(() => {
    const bar = barRef.current;
    const host = bar?.nextElementSibling ?? bar?.parentElement ?? null;
    // Move focus out of the doomed subtree BEFORE the store update tears it
    // down: ordered this way the removal never has a focused node to orphan,
    // and Radix's restore-to-trigger then lands on a detached element, which is
    // a silent no-op rather than a reset to <body>.
    if (host instanceof HTMLElement) {
      host.tabIndex = -1;
      host.focus({ preventScroll: true });
    }
    dismiss();
  }, [dismiss]);

  return { barRef, dismissAndMoveFocus };
}

/**
 * THE COPY CONTRACT FOR THIS WHOLE SURFACE.
 *
 * This bar is the first thing the user sees, every day, before they have done
 * anything. So it gets exactly one job: say how much is waiting, and open. It
 * does not grade the pile, it does not date the pile, and it never implies the
 * user owes anyone an explanation. If a future edit here needs a sentence to
 * justify itself, that is the signal it belongs somewhere else.
 *
 * What that rules out, and why each one was actually here:
 *  - "· oldest May 2". An aggregate age has one reading and it is "this is how
 *    far behind you are". The per-row stamps in the tray carry every bit of the
 *    USEFUL information (which day is this line about?) without summing it into
 *    a verdict. lib/overdue.ts has a longer note where the helper used to live.
 *  - "past due", as the visible noun. It is still the internal name of the
 *    predicate (lib/overdue.ts, useMorningStore, the auto-age sweep) because
 *    that is what it computes — but a bill is past due, and a bill has a
 *    penalty. "Waiting" is the same set of items with the blame taken out, and
 *    it is the word the drawer's own description has always used.
 *  - "from yesterday" was also a LIE: the predicate has no lower bound, which is
 *    exactly why April items once sat in a list titled "yesterday".
 *  - an unconditional "Good morning!" was a LIE — visibility gates on
 *    enabled && !dismissed && n > 0, never on the clock, so it greeted you at
 *    3pm. Conditioned on the hour it stays, because a greeting is the one thing
 *    on this bar that costs the reader nothing.
 *  - "carry forward or clear them out?" is a question a collapsed bar can't answer.
 */
function BarCopy({ summary }: { summary: OverdueSummary }) {
  const n = summary.count;
  if (n === 0) return <>All clear — nothing waiting</>;

  const beforeNoon = new Date().getHours() < 12;

  return (
    <>
      {beforeNoon && 'Good morning — '}
      <span className="font-semibold">
        {n === 1 ? '1 item' : `${n} items`} waiting
      </span>
    </>
  );
}

/** The 32px row itself — identical on both platforms bar the trailing ✕. */
function BarRow({
  summary,
  isOpen,
  trigger,
  onDismiss,
}: {
  summary: OverdueSummary;
  isOpen: boolean;
  /** Wraps the copy+chevron region: PopoverTrigger on desktop, a button on touch. */
  trigger: (content: ReactNode) => ReactNode;
  onDismiss?: () => void;
}) {
  const Chevron = isOpen ? ChevronUp : ChevronDown;

  return (
    <div className="flex h-8 items-center">
      {trigger(
        <>
          {/* The ONE coloured thing on this bar. Everything else — the count, the
              affordance, the ✕ — is plain body ink, because honey in a container
              edge and honey in body text is what made a planning surface read as
              a caution strip. See the --sunrise-* note in app/globals.css. */}
          <Sun className="h-3.5 w-3.5 flex-shrink-0 text-sunrise-glyph" />
          <span className="min-w-0 flex-1 truncate font-num text-xs tracking-[0.04em] text-foreground">
            <BarCopy summary={summary} />
          </span>
          <span className="flex flex-shrink-0 items-center gap-1 font-num text-xs tracking-[0.04em] text-muted-foreground">
            {isOpen ? 'Close' : 'Review'}
            <Chevron className="h-3.5 w-3.5" />
          </span>
        </>
      )}

      {onDismiss && (
        <>
          <span aria-hidden className="h-4 w-px flex-shrink-0 bg-sunrise-border" />
          {/* hover-wash, not hover:bg-accent: these controls sit ON a filled
              bg-sunrise-bg target, and hover:bg-accent REPLACES
              background-color — it would drop the tint and make the button
              lighten on hover. */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss until tomorrow"
            title="Dismiss until tomorrow"
            className="hover-wash flex h-8 w-6 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Desktop: 50px bar + portaled Popover tray.
 *
 * Mounted at components/shell/desktop-shell.tsx between the header block and
 * the timeline. See the height contract at the top of this file.
 */
export function MorningCheck() {
  const { summary, todayStr, trayOpen, visible, open, close } = usePastDue();
  const { barRef, dismissAndMoveFocus } = useDismissWithFocus();
  const canvasWide = useCanvasWide();

  if (!visible) return null;

  return (
    /* canvas-container wrapper, not a margin of its own: the bar sits on the
       same left/right edges as the header capsule and every body view. The
       gutter has to live on a wrapper — canvas-container's padding-inline would
       otherwise fall inside the box's border. */
    <div
      ref={barRef}
      // …and it follows the canvas out to full width in the week column views,
      // for exactly the reason above: the shared edge is the contract.
      data-wide={canvasWide ? 'true' : undefined}
      className="canvas-container mt-3 mb-1 flex-shrink-0"
      data-testid="morning-bar"
    >
      <Popover modal={false} open={trayOpen} onOpenChange={(o) => (o ? open() : close())}>
        {/* PopoverAnchor, not the trigger, carries the width: the trigger is only
            the copy+chevron region, so --radix-popover-trigger-width measured off
            it would come up ~25px short of the bar. Radix derives that variable
            from the ANCHOR when one is present, so anchoring the whole box makes
            the tray inherit the canvas-container gutter with zero measurement. */}
        <PopoverAnchor asChild>
          <div className="overflow-hidden rounded-[6px] border border-sunrise-border bg-sunrise-bg">
            <BarRow
              summary={summary}
              isOpen={trayOpen}
              onDismiss={dismissAndMoveFocus}
              trigger={(content) => (
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="hover-wash flex h-8 min-w-0 flex-1 items-center gap-2.5 px-3 text-left"
                  >
                    {content}
                  </button>
                </PopoverTrigger>
              )}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          data-testid="morning-tray"
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={false}
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          /* Every PopoverContent default is overridden (the primitive ships
             w-72 p-4 rounded-md border shadow-md). NEUTRAL bg-popover, not
             honey: this floats over a live grid so it has to be OPAQUE, and a
             honey field would collide with the lime checkbox — a combination
             components/primitives/task-row.tsx explicitly refuses. shadow in
             var() form because the named @theme utility inlines the light value
             and never sees the .dark re-tune. */
          className="z-50 flex flex-col overflow-hidden rounded-[6px] border border-border bg-popover p-0 shadow-[var(--shadow-elev-md)]"
          /* The one piece of dismissal Radix can't get right on its own: the
             per-row "Pick a date" Popover portals to <body>, so its content is
             outside this layer's DOM subtree and both the pointerdown and the
             auto-focus register as "outside" — the tray would slam shut the
             instant a calendar opened. Everything else (Escape, real outside
             clicks, focus restoration, aria-expanded) stays Radix's job. */
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent.target as HTMLElement | null;
            if (target?.closest?.('[data-radix-popper-content-wrapper]')) event.preventDefault();
          }}
        >
          {/* The page is NOT dimmed: there is no in-canvas scrim precedent, a
              scrim would make this modal, and the day below is the DESTINATION
              of every action taken in here. */}
          <MorningTriageList
            items={summary.items}
            todayStr={todayStr}
            variant="tray"
            onDismiss={dismissAndMoveFocus}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Mobile: 36px pill + bottom Drawer. Phones had no waiting surface at all
 * before this.
 *
 * No ✕ here — touch has no hover, and a 24px destructive target pressed up
 * against a 300px tap target is a mis-tap generator. Dismissal lives in the
 * drawer footer's "Hide until tomorrow" only.
 *
 * The drawer NEVER auto-opens — see `armed` below for what makes that true
 * rather than merely intended.
 */
export function MorningCheckMobile() {
  /**
   * `trayOpen`, not the raw store flag: the drawer cannot open in the commit it
   * mounts in — only in a later one, which is to say only in response to
   * something the user did while this surface was already on screen (the pill,
   * or `goto.overdue`, which switches to this tab first and so opens on the
   * commit after the mount). The gate itself lives in usePastDue, because the
   * desktop tray needs exactly the same protection on the way back up.
   */
  const { summary, todayStr, trayOpen, visible, open, close } = usePastDue();
  const { barRef, dismissAndMoveFocus } = useDismissWithFocus();

  if (!visible) return null;

  return (
    <>
      {/* mini-week-nav's pill language (mx-3 / rounded-[16px]) rather than the
          desktop canvas-container box — mobile chrome floats on the backdrop.
          h-8 + mb-1 keeps the in-flow cost fixed inside the min-h-0 column. */}
      <div
        ref={barRef}
        className="mx-3 mb-1 flex-shrink-0 overflow-hidden rounded-[16px] border border-sunrise-border bg-sunrise-bg"
        data-testid="morning-bar"
      >
        <BarRow
          summary={summary}
          isOpen={trayOpen}
          trigger={(content) => (
            <button
              type="button"
              onClick={open}
              className="flex h-8 min-w-0 flex-1 items-center gap-2.5 px-3 text-left"
            >
              {content}
            </button>
          )}
        />
      </div>

      <Drawer open={trayOpen} onOpenChange={(o) => !o && close()}>
        {/* max-h-[80vh] comes free from components/ui/drawer.tsx:61. */}
        <DrawerContent data-testid="morning-tray">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-left text-base">Still waiting</DrawerTitle>
            <DrawerDescription className="sr-only">
              Items still waiting from earlier days. Complete them, carry them to today, pick a new
              date, or move them to your Braindump.
            </DrawerDescription>
          </DrawerHeader>
          <MorningTriageList
            items={summary.items}
            todayStr={todayStr}
            variant="sheet"
            onDismiss={dismissAndMoveFocus}
          />
        </DrawerContent>
      </Drawer>
    </>
  );
}
