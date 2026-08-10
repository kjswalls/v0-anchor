'use client';

import { useCallback, useMemo } from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ViewRouter } from '@/components/views/view-router';
import { MorningCheck } from '@/components/ai/morning-check';
import { HeaderCapsule } from '@/components/canvas/header-capsule';
import { WeekScale } from '@/components/canvas/week-scale';
import { ItemDialog, type ItemDialogState } from '@/components/planner/item-dialog';
import { useUIStore } from '@/lib/ui-store';
import { useCanvasWide } from '@/lib/view-store';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/** Below this the panel stops compressing the canvas and overlays it instead. */
const PANEL_OVERLAY_QUERY = '(max-width: 1180px)';

/**
 * Desktop layout: sidebar v2 (braindump + chat + omnibar) + canvas panel on
 * the warm backdrop. The views live behind ViewRouter (P5).
 */
export function DesktopShell() {
  // No sidebar state here any more: collapse, expand, resize and hover-peek all
  // live on the column's own edge in <Sidebar/>. This shell just lays out.
  const activeDialog = useUIStore((s) => s.activeDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const canvasWide = useCanvasWide();

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
        {/* The hover-peek trigger used to be a 12px strip here, on this panel's
            left edge. <Sidebar/>'s expand zone now covers those same pixels and
            sits above them, so this one could only ever have gone dead — the
            zone fires setLeftSidebarHovered itself. One edge, one owner.

            The expand-sidebar affordance used to live here too, absolutely
            positioned at the panel's top-left. It moved into <Sidebar/> as the
            mirror of the collapse grip: same shape, same vertical centre, sat
            in the shell's gutter instead of inside this panel — so collapsing
            and reopening happen in one place on screen rather than the control
            jumping from the seam to over the canvas. */}

        {/* Canvas header. canvas-container shares its left edge with every body
            view (Figma x=103 align).

            The two [DEV] emoji triggers that used to sit on the right are gone:
            "Show overdue tasks" and "Start end-of-day review" are real commands
            in the palette now, and the morning one no longer pokes store state
            (which left the server-side dismissal in place, so the reset died on
            the next reload). */}
        {/* data-wide tracks the body view: the week column grids drop the
            1100px cap so seven columns can actually fit, and this row drops it
            with them — the point of canvas-container is that the capsule and
            the view underneath share an edge, not that the edge is at any
            particular x. WeekScale sits at the far end of the same row, so in
            week scope it lands on the grid's right edge. */}
        <div
          data-wide={canvasWide ? 'true' : undefined}
          className="canvas-container flex flex-shrink-0 items-start gap-3 pt-[31px] pb-2"
        >
          <HeaderCapsule />
          <WeekScale className="ml-auto" />
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

      {/* The item panel — a sibling surface on the backdrop, not a layer over
          the canvas. `flat` drops its card chrome so it reads as the paper
          plane BELOW <main>, mirroring the braindump column on the left.
          Opening it narrows <main> (flex-1 recomputes exactly as it does for
          the braindump collapse), which is the whole argument for going
          non-modal: the day stays visible, and stays workable, beside the item.

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
        <ItemDialog presentation="panel" flat state={panelState} onOpenChange={handlePanelOpenChange} />
      </div>
    </div>
  );
}
