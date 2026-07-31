'use client';

import { useCallback, useMemo } from 'react';
import { ChevronsRight } from 'lucide-react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ViewRouter } from '@/components/views/view-router';
import { MorningCheck } from '@/components/ai/morning-check';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { ItemDialog, type ItemDialogState } from '@/components/planner/item-dialog';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/lib/sidebar-store';
import { useUIStore } from '@/lib/ui-store';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/** Below this the panel stops compressing the canvas and overlays it instead. */
const PANEL_OVERLAY_QUERY = '(max-width: 1180px)';

/**
 * Desktop layout: sidebar v2 (braindump + chat + omnibar) + canvas panel on
 * the warm backdrop. The views live behind ViewRouter (P5).
 */
export function DesktopShell() {
  const { leftSidebarOpen, toggleLeftSidebar, leftSidebarHoverEnabled, setLeftSidebarHovered } = useSidebarStore();
  const activeDialog = useUIStore((s) => s.activeDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);

  // Editing an item IS the selection here — the ui-store's single dialog slot
  // already gives us retargeting for free: clicking another row calls
  // openEditFor, which replaces the slot, and the panel re-seeds off the new id.
  // Memoized because ItemDialog's anti-flicker latch keys on payload identity.
  const panelState = useMemo<ItemDialogState | null>(
    () => (activeDialog?.type === 'edit-item' ? { mode: 'edit', item: activeDialog.item } : null),
    [activeDialog]
  );

  // When the panel overlays rather than compresses, the canvas underneath is
  // covered but still tabbable — so Tab would walk onto blocks and buttons
  // hidden behind an opaque card. A class can't express that; `inert` can.
  const panelOverlays = useMediaQuery(PANEL_OVERLAY_QUERY);

  // Stable so the panel's Escape listener isn't torn down and re-bound on every
  // store tick.
  const handlePanelOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeDialog();
    },
    [closeDialog]
  );

  return (
    <div className="relative hidden h-[100dvh] gap-3 bg-surface-0 p-3 md:flex">
      <Sidebar />

      {/* Body panel: a big card floating over the backdrop/sidebar field. The
          hairline border does the close-range work (it survives on top of the
          shadow at the panel's edge, which is what reads as "lifted" in dark
          mode where a black drop barely registers); shadow-elev-panel adds the
          leftward cast onto the sidebar plus a left-edge light-catch, which the
          vertical-only elev family couldn't give it. */}
      <main
        inert={panelOverlays && !!panelState}
        className="relative flex flex-1 flex-col overflow-hidden rounded-[30px] border border-border bg-canvas shadow-[var(--shadow-elev-panel)]"
      >
        {/* Left hover zone - shows sidebar when collapsed (if enabled) */}
        {!leftSidebarOpen && leftSidebarHoverEnabled && (
          <div
            className="absolute left-0 top-0 bottom-0 z-40 w-3 cursor-pointer transition-colors hover:bg-primary/10"
            onMouseEnter={() => setLeftSidebarHovered(true)}
          />
        )}

        {/* Expand-sidebar affordance when collapsed — absolutely positioned at
            the panel's top-left so it never shifts the header capsule (which
            stays fixed at the canvas-container left edge) and reads as the same
            control that lived in the sidebar header, just flipped. */}
        {!leftSidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-[35px] z-30 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={toggleLeftSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar (⌘[)"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}

        {/* Canvas header. canvas-container shares its left edge with every body
            view (Figma x=103 align).

            The two [DEV] emoji triggers that used to sit on the right are gone:
            "Show overdue tasks" and "Start end-of-day review" are real commands
            in the palette now, and the morning one no longer pokes store state
            (which left the server-side dismissal in place, so the reset died on
            the next reload). */}
        <div className="canvas-container flex flex-shrink-0 items-start pt-[31px] pb-2">
          <HeaderCapsule />
        </div>

        {/* Past-due bar. CONTRACT: 50px in flow at every task count, forever —
            the list lives in a portaled Popover and costs this column zero
            layout pixels. lib/use-fit-hour-px.ts derives the schedule grid's
            hour height from the space left below this element, so anything that
            makes this bar's height depend on content (a list rendered in flow, a
            height derived from line-height) drives hourPx to its MIN_HOUR_PX
            floor and destroys the fit-to-height contract. Nothing else in the
            tree says so, which is why it's said here. */}
        <MorningCheck />

        {/* min-h-0 is explicit rather than relying on overflow-hidden to zero the
            automatic minimum size of a flex item: this column is what
            use-fit-hour-px measures into. */}
        <div data-tour="timeline" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ViewRouter />
        </div>

      </main>

      {/* The item panel — a sibling card, not a layer over one. Opening it
          narrows <main> (flex-1 recomputes exactly as it does for the braindump
          collapse), which is the whole argument for going non-modal: the day
          stays visible, and stays workable, beside the item.

          The width lives out here rather than in ItemDialog so the column can
          animate both ways while its contents mount and unmount — the surface
          itself must reach count 0 when closed.

          Under 1180px there is no day left worth compressing (the overlap
          layout starts wrapping panes below ~200px each), so the column goes
          back to overlaying: an absolutely-positioned flex child occupies no
          track, and <main> keeps its full width. -ml-3 eats the flex gap when
          closed, the same 12px the collapsed sidebar deliberately keeps. */}
      <div
        className={cn(
          'relative flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
          panelState ? 'w-[420px]' : '-ml-3 w-0',
          'max-[1180px]:absolute max-[1180px]:inset-y-3 max-[1180px]:right-3 max-[1180px]:z-30 max-[1180px]:ml-0'
        )}
      >
        <ItemDialog presentation="panel" state={panelState} onOpenChange={handlePanelOpenChange} />
      </div>
    </div>
  );
}
